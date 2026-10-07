const fs = require("fs/promises");
const mongoose = require("mongoose");
const { waitUntil } = require("@vercel/functions");
const User = require("../models/User");
const tesdaSectors = require("../../shared/tesdaQualifications.json");
const TESDA_QUALIFICATIONS = new Set(tesdaSectors.flatMap(({ qualifications }) => qualifications));

function tesdaCertificateResponse(certificate) {
  return {
    id: String(certificate._id),
    trade: certificate.trade || "",
    status: String(certificate.status || "pending").toLowerCase(),
    submittedAt: certificate.submittedAt || null,
    reviewedAt: certificate.reviewedAt || null,
    rejectionReason: certificate.rejectionReason || "",
  };
}
const {
  classifyIdSide,
  performOCRVerification,
  warmOCRWorker,
} = require("../utils/ocrHelper");
const { SECURITY_FLAGS, inspectVerificationMetadata } = require("../utils/verificationMetadata");
const {
  markVerificationOCRUnavailable,
  persistVerificationOCRResult,
  persistVerificationSubmission,
  releaseStaleVerificationOCR,
} = require("../services/verificationSubmission");
const { removeUploadedFiles } = require("../storage/verificationUpload");
const { sendPushNotification } = require("../services/oneSignal");
const { awardVerificationVoucher } = require("../services/rewards");
const {
  deleteVerificationImage,
  fetchAuthenticatedVerificationImage,
  uploadVerificationImage,
} = require("../services/cloudinaryMedia");

function getProfileName(user) {
  return String(user.fullName || [user.firstName, user.middleName, user.lastName].filter(Boolean).join(" ")).trim();
}

function getProfileNameParts(user) {
  if (user.firstName && user.lastName) {
    return {
      firstName: user.firstName,
      middleName: user.middleName || "",
      lastName: user.lastName,
    };
  }
  return getProfileName(user);
}

async function handleSubmitVerification(req, res) {
  const front = req.files?.idFront?.[0];
  const back = req.files?.idBack?.[0];
  const uploadedFiles = [front, back].filter(Boolean);
  if (!front || !back) {
    await removeUploadedFiles(uploadedFiles);
    return res.status(400).json({ message: "Both the front and back of your ID are required." });
  }

  const uploadedCloudImages = [];
  let cloudUploadsPromise;
  let submissionSaved = false;
  try {
    const previousUser = await User.findById(req.user._id)
      .select("+verificationDetails.idFrontPublicId +verificationDetails.idBackPublicId");
    if (!previousUser) {
      await removeUploadedFiles(uploadedFiles);
      return res.status(404).json({ message: "Your account could not be found." });
    }
    if (previousUser.isVerified === true && previousUser.verificationDetails?.status === "Active") {
      const error = new Error("Your identity is already verified. This submission was not saved.");
      error.statusCode = 409;
      throw error;
    }

    const tradeCertificate = String(req.body.tradeCertificate || req.body.certificate || "").trim();
    if (tradeCertificate.length > 200) {
      await removeUploadedFiles(uploadedFiles);
      return res.status(400).json({ message: "Trade certificates must be 200 characters or fewer." });
    }

    void warmOCRWorker().catch((error) => {
      console.warn("Verification OCR worker preloading failed; it will retry during processing:", error.message);
    });
    const [frontBuffer, backBuffer] = await Promise.all([
      fs.readFile(front.path),
      fs.readFile(back.path),
    ]);
    cloudUploadsPromise = Promise.allSettled([
      uploadVerificationImage(frontBuffer, String(req.user._id), "front"),
      uploadVerificationImage(backBuffer, String(req.user._id), "back"),
    ]);
    const metadataInspection = await inspectVerificationMetadata(frontBuffer);
    const securityFlags = metadataInspection.flags;
    if (metadataInspection.error) {
      console.warn("Verification metadata inspection failed; routing submission for manual review:", metadataInspection.error.message);
    }
    if (securityFlags.includes(SECURITY_FLAGS.AI_OR_EDITED_METADATA_DETECTED)) {
      console.warn("Verification metadata indicates possible AI-generated or edited ID; routing for manual review.", String(req.user._id));
    }
    if (securityFlags.includes(SECURITY_FLAGS.CAMERA_METADATA_MISSING)) {
      console.warn("Verification ID has no camera Make/Model metadata; flagging for admin inspection.", String(req.user._id));
    }

    const [frontUpload, backUpload] = await cloudUploadsPromise;
    for (const upload of [frontUpload, backUpload]) {
      if (upload.status === "fulfilled") uploadedCloudImages.push(upload.value.publicId);
    }
    const failedOperation = [frontUpload, backUpload].find((result) => result.status === "rejected");
    if (failedOperation) throw failedOperation.reason;

    const frontImage = frontUpload.value;
    const backImage = backUpload.value;
    const submittedAt = new Date();
    const verificationDetails = {
      idFrontUrl: `/api/v1/admin/verifications/${req.user._id}/documents/front`,
      idBackUrl: `/api/v1/admin/verifications/${req.user._id}/documents/back`,
      tradeCertificate,
      ocrConfidence: null,
      nameMatchAccuracy: null,
      ocrProcessing: true,
      autoVerified: false,
      securityFlags,
      rejectionReason: "",
      status: "Pending",
      submittedAt,
      reviewedAt: null,
      idFrontPublicId: frontImage.publicId,
      idBackPublicId: backImage.publicId,
      idFrontFormat: frontImage.format,
      idBackFormat: backImage.format,
    };

    const savedUser = await persistVerificationSubmission(
      User,
      previousUser,
      verificationDetails,
      false,
    );
    submissionSaved = true;

    const previousPublicIds = [
      previousUser.verificationDetails?.idFrontPublicId,
      previousUser.verificationDetails?.idBackPublicId,
    ].filter((publicId) => publicId && !uploadedCloudImages.includes(publicId));
    const runBackgroundTasks = async () => {
      await processIdentityVerificationOCR({
        userId: savedUser._id,
        role: savedUser.role,
        submittedAt,
        profileName: getProfileNameParts(savedUser),
        securityFlags,
        frontBuffer,
      });
      await Promise.all(previousPublicIds.map((publicId) => deleteVerificationImage(publicId).catch((error) => {
        console.error("Could not remove replaced verification image:", error.message);
      })));
    };
    if (process.env.VERCEL) {
      waitUntil(Promise.resolve().then(runBackgroundTasks));
    } else {
      setImmediate(() => {
        void runBackgroundTasks().catch((error) => {
          console.error("Background verification tasks failed:", error);
        });
      });
    }

    res.status(202).json({
      success: true,
      autoVerified: false,
      ocrProcessing: true,
      isVerified: false,
      status: "Pending",
      verificationStatus: savedUser.verificationStatus,
      ocrConfidence: null,
      nameMatchAccuracy: null,
      securityFlags,
      message: "Your documents are saved. We are checking your ID in the background; you can continue using TaskPanda.",
      user: {
        isVerified: false,
        status: "Pending",
        verificationStatus: savedUser.verificationStatus,
      },
    });
  } catch (error) {
    await removeUploadedFiles(uploadedFiles);
    if (!submissionSaved) {
      if (cloudUploadsPromise) {
        const completedUploads = await cloudUploadsPromise;
        for (const upload of completedUploads) {
          if (upload.status === "fulfilled") uploadedCloudImages.push(upload.value.publicId);
        }
      }
      await Promise.all([...new Set(uploadedCloudImages)].map((publicId) => deleteVerificationImage(publicId).catch((deleteError) => {
        console.error("Could not remove unsaved verification image:", deleteError.message);
      })));
    }
    console.error("Submit identity verification error:", error);
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    return res.status(500).json({ message: "We could not save your verification. Please try again." });
  } finally {
    await removeUploadedFiles(uploadedFiles);
  }
}

async function processIdentityVerificationOCR({
  userId,
  role,
  submittedAt,
  profileName,
  securityFlags,
  frontBuffer,
  frontPublicId,
  frontFormat,
}) {
  try {
    let frontImageBuffer = frontBuffer;
    if (!frontImageBuffer) {
      const frontImage = await fetchAuthenticatedVerificationImage(frontPublicId, frontFormat);
      frontImageBuffer = frontImage.body;
    }

    const ocrResult = await performOCRVerification(frontImageBuffer, profileName);
    const frontSideCheck = classifyIdSide({
      extractedText: ocrResult.extractedText,
      ocrConfidence: ocrResult.ocrConfidence,
      nameMatch: {
        firstNameMatched: ocrResult.firstNameMatched,
        lastNameMatched: ocrResult.lastNameMatched,
      },
      detectedIdType: ocrResult.detectedIdType,
    });
    const autoVerified = ocrResult.autoVerified &&
      securityFlags.length === 0 &&
      frontSideCheck !== "back";
    if (frontSideCheck === "back") {
      console.warn("Verification OCR found possible back-side evidence on the submitted front image; keeping the submission pending for manual review.", String(userId));
    }

    const updatedUser = await persistVerificationOCRResult(User, userId, submittedAt, {
      ocrConfidence: ocrResult.ocrConfidence,
      nameMatchAccuracy: ocrResult.nameMatchAccuracy,
      autoVerified,
      securityFlags,
    });
    if (!updatedUser) return;

    if (autoVerified && role === "client") {
      try {
        await awardVerificationVoucher(updatedUser._id);
      } catch (error) {
        console.error("Could not award client identity verification voucher:", error);
      }
    }
  } catch (error) {
    console.error("Background identity OCR processing failed; leaving the submission for manual review:", error);
    try {
      await markVerificationOCRUnavailable(User, userId, submittedAt, securityFlags);
    } catch (saveError) {
      console.error("Could not mark failed identity OCR for manual review:", saveError);
    }
  }
}

async function resumePendingVerificationOCR() {
  const pendingUsers = await User.find({
    "verificationDetails.status": "Pending",
    "verificationDetails.ocrProcessing": true,
  })
    .select("role firstName middleName lastName fullName +verificationDetails.idFrontPublicId +verificationDetails.idFrontFormat")
    .lean();

  for (const user of pendingUsers) {
    void processIdentityVerificationOCR({
      userId: user._id,
      role: user.role,
      submittedAt: user.verificationDetails.submittedAt,
      profileName: getProfileNameParts(user),
      securityFlags: user.verificationDetails.securityFlags || [],
      frontPublicId: user.verificationDetails.idFrontPublicId,
      frontFormat: user.verificationDetails.idFrontFormat,
    });
  }
  return pendingUsers.length;
}

async function handleSubmitTesdaCertificate(req, res) {
  const file = req.file;
  if (!file) return res.status(400).json({ message: "Upload a photo of your TESDA certificate." });

  const trade = typeof req.body?.trade === "string" ? req.body.trade : "";
  if (!TESDA_QUALIFICATIONS.has(trade)) {
    await removeUploadedFiles([file]);
    return res.status(400).json({ message: "Choose a TESDA qualification from the available catalog." });
  }

  let uploadedImage;
  try {
    const previousUser = await User.findById(req.user._id)
      .select([
        "role isVerified",
        "tesdaCertificates._id",
        "tesdaCertificates.trade tesdaCertificates.status tesdaCertificates.submittedAt",
        "tesdaCertificates.reviewedAt tesdaCertificates.rejectionReason tesdaCertificates.certificateImageUrl",
        "+tesdaCertificates.certificateImagePublicId",
      ].join(" "));
    if (!previousUser) {
      return res.status(404).json({ message: "Your account could not be found." });
    }
    if (!["client", "provider"].includes(previousUser.role) || previousUser.isVerified !== true) {
      return res.status(403).json({ message: "Complete identity verification before submitting a TESDA certificate." });
    }

    const tradeKey = trade.toLowerCase();
    const pendingCertificate = (previousUser.tesdaCertificates || []).find((certificate) =>
      certificate.trade?.trim().toLowerCase() === tradeKey &&
      String(certificate.status).toLowerCase() === "pending"
    );
    if (pendingCertificate) {
      return res.status(409).json({
        message: "A TESDA certificate for this trade is already pending review.",
        certificate: tesdaCertificateResponse(pendingCertificate),
      });
    }
    const approvedCertificate = (previousUser.tesdaCertificates || []).find((certificate) =>
      certificate.trade?.trim().toLowerCase() === tradeKey &&
      String(certificate.status).toLowerCase() === "approved"
    );
    const previousImagePublicId = approvedCertificate?.certificateImagePublicId;

    const buffer = await fs.readFile(file.path);
    uploadedImage = await uploadVerificationImage(buffer, String(req.user._id), "tesda");
    const certificateId = approvedCertificate?._id || new mongoose.Types.ObjectId();
    const certificateImageUrl = `/api/v1/admin/verifications/${req.user._id}/tesda/${certificateId}/document`;
    const submittedAt = new Date();
    const savedUser = approvedCertificate
      ? await User.findOneAndUpdate({
        _id: req.user._id,
        role: mongoose.trusted({ $in: ["client", "provider"] }),
        isVerified: true,
        tesdaCertificates: mongoose.trusted({
          $elemMatch: {
            _id: approvedCertificate._id,
            status: "approved",
          },
        }),
      }, {
        $set: {
          "tesdaCertificates.$.status": "pending",
          "tesdaCertificates.$.submittedAt": submittedAt,
          "tesdaCertificates.$.reviewedAt": null,
          "tesdaCertificates.$.rejectionReason": "",
          "tesdaCertificates.$.certificateImageUrl": certificateImageUrl,
          "tesdaCertificates.$.certificateImagePublicId": uploadedImage.publicId,
          "tesdaCertificates.$.certificateImageFormat": uploadedImage.format,
        },
      }, {
        new: true,
        runValidators: true,
      })
      : await User.findOneAndUpdate({
        _id: req.user._id,
        role: mongoose.trusted({ $in: ["client", "provider"] }),
        isVerified: true,
        $nor: [{
          tesdaCertificates: {
            $elemMatch: {
              trade: { $regex: `^${trade.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
              status: "pending",
            },
          },
        }],
      }, {
        $push: {
          tesdaCertificates: {
            _id: certificateId,
            trade,
            status: "pending",
            submittedAt,
            certificateImageUrl,
            certificateImagePublicId: uploadedImage.publicId,
            certificateImageFormat: uploadedImage.format,
          },
        },
      }, {
        new: true,
        runValidators: true,
      });

    if (!savedUser) {
      const latestUser = await User.findById(req.user._id).select("tesdaCertificates");
      const conflictingCertificate = (latestUser?.tesdaCertificates || []).find((certificate) =>
        certificate.trade?.trim().toLowerCase() === tradeKey &&
        String(certificate.status).toLowerCase() === "pending"
      );
      const error = new Error(conflictingCertificate
        ? "A TESDA certificate for this trade is already pending review."
        : "We couldn't save your TESDA certificate. Please try again.");
      error.statusCode = 409;
      error.certificate = conflictingCertificate
        ? tesdaCertificateResponse(conflictingCertificate)
        : undefined;
      throw error;
    }

    if (previousImagePublicId && previousImagePublicId !== uploadedImage.publicId) {
      await deleteVerificationImage(previousImagePublicId).catch((deleteError) => {
        console.error("Could not remove the replaced TESDA certificate image:", deleteError.message);
      });
    }

    return res.status(201).json({
      success: true,
      message: "Your TESDA certificate was submitted for review.",
      certificate: tesdaCertificateResponse(savedUser.tesdaCertificates.id(certificateId)),
      user: { tesdaCertificates: (savedUser.tesdaCertificates || []).map(tesdaCertificateResponse) },
    });
  } catch (error) {
    if (uploadedImage?.publicId) {
      await deleteVerificationImage(uploadedImage.publicId).catch((deleteError) => {
        console.error("Could not remove unsaved TESDA certificate image:", deleteError.message);
      });
    }
    console.error("Submit TESDA certificate error:", error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        message: error.message,
        ...(error.certificate ? { certificate: error.certificate } : {}),
      });
    }
    return res.status(500).json({ message: "We could not submit your TESDA certificate. Please try again." });
  } finally {
    await removeUploadedFiles([file]);
  }
}

async function handleGetAdminVerifications(_req, res) {
  try {
    const staleOCRCount = await releaseStaleVerificationOCR(
      User,
      new Date(Date.now() - 3 * 60 * 1000),
    );
    if (staleOCRCount) {
      console.warn(`Released ${staleOCRCount} identity submission(s) from stale OCR processing for manual review.`);
    }
    const [users, providersWithPendingCertificates, processingIdentityCount] = await Promise.all([
      User.find({
        "verificationDetails.status": "Pending",
        "verificationDetails.idFrontUrl": mongoose.trusted({ $ne: "" }),
        role: mongoose.trusted({ $in: ["client", "provider"] }),
      })
        .select("fullName firstName middleName lastName username email role createdAt verificationStatus isVerified verificationDetails")
        .lean(),
      User.find({
        "tesdaCertificates.status": mongoose.trusted({ $regex: "^pending$", $options: "i" }),
        role: mongoose.trusted({ $in: ["client", "provider"] }),
      })
        .select([
          "fullName firstName middleName lastName username email role createdAt",
          "tesdaCertificates._id tesdaCertificates.trade tesdaCertificates.status tesdaCertificates.submittedAt tesdaCertificates.certificateImageUrl",
          "+tesdaCertificates.certificateImagePublicId",
        ].join(" "))
        .lean(),
      User.countDocuments({
        "verificationDetails.status": "Pending",
        "verificationDetails.ocrProcessing": true,
        role: mongoose.trusted({ $in: ["client", "provider"] }),
      }),
    ]);

    const identitySubmissions = users.map((user) => ({
      type: "identity",
      userId: String(user._id),
      name: getProfileName(user) || user.username || "Unnamed account",
      username: user.username || "",
      email: user.email,
      role: user.role,
      accountCreatedAt: user.createdAt,
      submittedAt: user.verificationDetails?.submittedAt || null,
      status: user.verificationDetails?.status || "Pending",
      idFrontUrl: user.verificationDetails?.idFrontUrl || "",
      idBackUrl: user.verificationDetails?.idBackUrl || "",
      tradeCertificate: user.verificationDetails?.tradeCertificate || "",
      ocrConfidence: user.verificationDetails?.ocrConfidence ?? null,
      nameMatchAccuracy: user.verificationDetails?.nameMatchAccuracy ?? null,
      ocrProcessing: user.verificationDetails?.ocrProcessing === true,
      autoVerified: user.verificationDetails?.autoVerified === true,
      securityFlags: (user.verificationDetails?.securityFlags || [])
        .filter((flag) => Object.values(SECURITY_FLAGS).includes(flag)),
      rejectionReason: user.verificationDetails?.rejectionReason || "",
    }));
    const tesdaSubmissions = providersWithPendingCertificates.flatMap((user) =>
      (user.tesdaCertificates || [])
        .filter((certificate) => String(certificate.status).toLowerCase() === "pending")
        .map((certificate) => ({
          type: "tesda",
          userId: String(user._id),
          certificateId: String(certificate._id),
          name: getProfileName(user) || user.username || "Unnamed account",
          username: user.username || "",
          email: user.email,
          role: user.role,
          accountCreatedAt: user.createdAt,
          submittedAt: certificate.submittedAt || null,
          trade: certificate.trade || "",
          certificateUrl: certificate.certificateImageUrl || `/api/v1/admin/verifications/${user._id}/tesda/${certificate._id}/document`,
          hasCertificateImage: Boolean(certificate.certificateImagePublicId),
        }))
    );
    const verifications = [...identitySubmissions, ...tesdaSubmissions]
      .sort((left, right) => new Date(left.submittedAt || 0) - new Date(right.submittedAt || 0));
    return res.json({
      verifications,
      processingIdentityCount,
    });
  } catch (error) {
    console.error("Admin verification queue error:", error);
    return res.status(500).json({ message: "Could not load pending verification submissions." });
  }
}

async function handleGetTesdaCertificateDocument(req, res) {
  try {
    const user = await User.findOne({
      _id: req.params.userId,
      role: mongoose.trusted({ $in: ["client", "provider"] }),
      tesdaCertificates: mongoose.trusted({ $elemMatch: { _id: req.params.certificateId } }),
    }).select("+tesdaCertificates.certificateImagePublicId +tesdaCertificates.certificateImageFormat");
    const certificate = user?.tesdaCertificates?.id(req.params.certificateId);
    if (!certificate?.certificateImagePublicId) {
      return res.status(404).json({ message: "TESDA certificate image not found." });
    }

    const image = await fetchAuthenticatedVerificationImage(
      certificate.certificateImagePublicId,
      certificate.certificateImageFormat,
    );
    res.set("Cache-Control", "private, no-store");
    res.set("Content-Type", image.contentType);
    return res.send(image.body);
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    console.error("Admin TESDA certificate document error:", error);
    return res.status(500).json({ message: "Could not load this TESDA certificate image." });
  }
}

async function handleReviewTesdaCertificate(req, res) {
  const approved = req.body.action === "approve";
  if (approved && req.body.certificateInspected !== true) {
    return res.status(400).json({ message: "Inspect the TESDA certificate before approving it." });
  }
  const rejectionReason = approved ? "" : String(req.body.rejectionReason || "").trim();
  try {
    const targetUser = await User.findById(req.params.userId).select("role").lean();
    if (!targetUser || !["client", "provider"].includes(targetUser.role)) {
      return res.status(404).json({ message: "This account could not be found." });
    }
    const notification = {
      title: approved ? "TESDA certificate approved" : "TESDA certificate needs changes",
      message: approved
        ? "Your TESDA certificate was approved and is now shown on your profile."
        : `Your TESDA certificate was rejected. ${rejectionReason}`.slice(0, 240),
      href: userProfilePathForRole(targetUser.role),
      createdAt: new Date(),
    };
    const user = await User.findOneAndUpdate({
      _id: req.params.userId,
      role: mongoose.trusted({ $in: ["client", "provider"] }),
      tesdaCertificates: mongoose.trusted({
        $elemMatch: {
          _id: req.params.certificateId,
          status: "pending",
          certificateImagePublicId: { $exists: true, $ne: "" },
        },
      }),
    }, {
      $set: {
        "tesdaCertificates.$.status": approved ? "approved" : "rejected",
        "tesdaCertificates.$.reviewedAt": new Date(),
        "tesdaCertificates.$.rejectionReason": rejectionReason,
      },
      $push: {
        verificationNotifications: {
          $each: [notification],
          $slice: -25,
        },
      },
    }, {
      new: true,
      runValidators: true,
    });
    if (!user) return res.status(404).json({ message: "This pending TESDA certificate could not be found." });
    return res.json({
      success: true,
      userId: String(user._id),
      certificateId: String(req.params.certificateId),
      status: user.tesdaCertificates.id(req.params.certificateId)?.status,
    });
  } catch (error) {
    console.error("Admin TESDA certificate review error:", error);
    return res.status(500).json({ message: "Could not update this TESDA certificate." });
  }
}

async function handleReviewVerification(req, res) {
  const { action, nameMatchConfirmed, rejectionReason } = req.body;
  if (action === "approve" && nameMatchConfirmed !== true) {
    return res.status(400).json({ message: "Inspect the ID and confirm that its name matches the account before approving." });
  }
  try {
    const approved = action === "approve";
    const targetUser = approved
      ? null
      : await User.findById(req.params.userId).select("role").lean();
    const update = {
      $set: {
        "verificationDetails.status": approved ? "Active" : "Rejected",
        "verificationDetails.ocrProcessing": false,
        "verificationDetails.rejectionReason": approved ? "" : rejectionReason.trim(),
        "verificationDetails.autoVerified": false,
        "verificationDetails.reviewedAt": new Date(),
        isVerified: approved,
        verificationStatus: approved ? "verified" : "rejected",
      },
    };
    if (!approved) {
      update.$push = {
        verificationNotifications: {
          $each: [{
            title: "Identity verification rejected",
            message: `Your identity verification was rejected. ${rejectionReason.trim()}`,
            href: userProfilePathForRole(targetUser?.role),
            createdAt: new Date(),
          }],
          $slice: -25,
        },
      };
    }
    const user = await User.findOneAndUpdate({
      _id: req.params.userId,
      "verificationDetails.status": "Pending",
      role: mongoose.trusted({ $in: ["client", "provider"] }),
    }, update, { new: true, runValidators: true });
    if (!user) return res.status(404).json({ message: "This pending verification could not be found." });

    let voucherAwarded = false;
    let voucherAwardError = false;
    if (approved && user.role === "client") {
      try {
        voucherAwarded = await awardVerificationVoucher(user._id);
      } catch (error) {
        voucherAwardError = true;
        console.error("Could not award client identity verification voucher:", error);
      }
    }

    let pushNotificationSent = false;
    if (!approved) {
      try {
        const result = await sendPushNotification({
          userIds: [String(user._id)],
          title: "Identity verification rejected",
          body: `Your identity verification was rejected. ${rejectionReason.trim()}`,
          url: user.role === "provider" ? "/provider-profile" : "/profile",
          data: { event: "verification.rejected", userId: String(user._id) },
          name: "Identity verification update",
        });
        pushNotificationSent = Boolean(result?.id);
      } catch (pushError) {
        console.warn("Verification rejection push notification failed; in-app notice was saved:", pushError.message);
      }
    }

    return res.json({
      success: true,
      userId: String(user._id),
      status: user.verificationDetails.status,
      isVerified: user.isVerified,
      verificationStatus: user.verificationStatus,
      ...(approved && user.role === "client" ? { voucherAwarded, voucherAwardError } : {}),
      ...(approved ? {} : { notificationSent: true, pushNotificationSent }),
    });
  } catch (error) {
    console.error("Admin verification review error:", error);
    return res.status(500).json({ message: "Could not update this identity verification." });
  }
}

function userProfilePathForRole(role) {
  return role === "provider" ? "/provider-profile" : "/profile";
}

async function handleGetVerificationNotifications(req, res) {
  try {
    const user = await User.findById(req.user._id).select("verificationNotifications").lean();
    if (!user) return res.status(404).json({ message: "Account not found." });
    const notifications = (user.verificationNotifications || [])
      .filter((notification) => !notification.readAt)
      .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
      .map((notification) => ({
        id: String(notification._id),
        title: notification.title,
        message: notification.message,
        href: notification.href,
        createdAt: notification.createdAt,
      }));
    return res.json({ notifications });
  } catch (error) {
    console.error("Get verification notifications error:", error);
    return res.status(500).json({ message: "Could not load verification notifications." });
  }
}

async function handleMarkVerificationNotificationRead(req, res) {
  if (!mongoose.isValidObjectId(req.params.notificationId)) {
    return res.status(400).json({ message: "Choose a valid verification notification." });
  }
  try {
    const result = await User.updateOne(
      mongoose.trusted({
        _id: req.user._id,
        verificationNotifications: mongoose.trusted({
          $elemMatch: { _id: new mongoose.Types.ObjectId(req.params.notificationId) },
        }),
      }),
      { $set: { "verificationNotifications.$.readAt": new Date() } }
    );
    if (!result.matchedCount) return res.status(404).json({ message: "Verification notification not found." });
    return res.json({ message: "Verification notification marked as read." });
  } catch (error) {
    console.error("Mark verification notification read error:", error);
    return res.status(500).json({ message: "Could not update the verification notification." });
  }
}

async function handleGetVerificationDocument(req, res) {
  try {
    const user = await User.findOne({
      _id: req.params.userId,
      role: mongoose.trusted({ $in: ["client", "provider"] }),
    }).select("+verificationDetails.idFrontPublicId +verificationDetails.idBackPublicId +verificationDetails.idFrontFormat +verificationDetails.idBackFormat");
    if (!user) return res.status(404).json({ message: "Verification document not found." });

    const publicId = req.params.side === "front"
      ? user.verificationDetails?.idFrontPublicId
      : user.verificationDetails?.idBackPublicId;
    const format = req.params.side === "front"
      ? user.verificationDetails?.idFrontFormat
      : user.verificationDetails?.idBackFormat;
    if (!publicId) return res.status(404).json({ message: "Verification document not found." });

    const image = await fetchAuthenticatedVerificationImage(publicId, format);
    res.set("Cache-Control", "private, no-store");
    res.set("Content-Type", image.contentType);
    return res.send(image.body);
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    console.error("Admin verification document error:", error);
    return res.status(500).json({ message: "Could not load this verification document." });
  }
}

module.exports = {
  handleGetAdminVerifications,
  handleGetTesdaCertificateDocument,
  handleReviewTesdaCertificate,
  handleGetVerificationNotifications,
  handleGetVerificationDocument,
  handleMarkVerificationNotificationRead,
  handleSubmitTesdaCertificate,
  handleReviewVerification,
  handleSubmitVerification,
  resumePendingVerificationOCR,
};
