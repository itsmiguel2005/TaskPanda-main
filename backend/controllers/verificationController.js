const fs = require("fs/promises");
const mongoose = require("mongoose");
const User = require("../models/User");
const tesdaSectors = require("../../shared/tesdaQualifications.json");
const TESDA_QUALIFICATIONS = new Set(tesdaSectors.flatMap(({ qualifications }) => qualifications));
const {
  areIdSidesLikelySwapped,
  classifyIdSide,
  performOCRVerification,
} = require("../utils/ocrHelper");
const { SECURITY_FLAGS, inspectVerificationMetadata } = require("../utils/verificationMetadata");
const { persistVerificationSubmission } = require("../services/verificationSubmission");
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

    const [frontBuffer, backBuffer] = await Promise.all([
      fs.readFile(front.path),
      fs.readFile(back.path),
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

    const cloudUploadsPromise = Promise.allSettled([
      uploadVerificationImage(frontBuffer, String(req.user._id), "front"),
      uploadVerificationImage(backBuffer, String(req.user._id), "back"),
    ]);
    const profileName = getProfileNameParts(req.user);
    const ocrResult = await performOCRVerification(front.path, profileName);
    const frontNameMatched = ocrResult.nameMatchAccuracy >= 75 &&
      ocrResult.firstNameMatched &&
      ocrResult.lastNameMatched;
    const backOcrResult = frontNameMatched
      ? null
      : await performOCRVerification(back.path, profileName);

    const [frontUpload, backUpload] = await cloudUploadsPromise;
    for (const upload of [frontUpload, backUpload]) {
      if (upload.status === "fulfilled") uploadedCloudImages.push(upload.value.publicId);
    }
    const failedOperation = [frontUpload, backUpload].find((result) => result.status === "rejected");
    if (failedOperation) throw failedOperation.reason;

    if (backOcrResult && areIdSidesLikelySwapped(ocrResult, backOcrResult)) {
      const error = new Error("The name on your ID appears on the image uploaded as ID Back instead of ID Front. Swap the images so the side with your photo and name is ID Front, then submit again.");
      error.statusCode = 400;
      throw error;
    }

    const frontSideCheck = classifyIdSide({
      extractedText: ocrResult.extractedText,
      ocrConfidence: ocrResult.ocrConfidence,
      nameMatch: {
        firstNameMatched: ocrResult.firstNameMatched,
        lastNameMatched: ocrResult.lastNameMatched,
      },
      detectedIdType: ocrResult.detectedIdType,
    });
    if (frontSideCheck === "back") {
      const error = new Error("This looks like the back of your ID. Upload the side showing your photo and name as ID Front, then upload the reverse as ID Back.");
      error.statusCode = 400;
      throw error;
    }

    const frontImage = frontUpload.value;
    const backImage = backUpload.value;
    const autoVerified = ocrResult.autoVerified && securityFlags.length === 0;
    const verificationDetails = {
      idFrontUrl: `/api/v1/admin/verifications/${req.user._id}/documents/front`,
      idBackUrl: `/api/v1/admin/verifications/${req.user._id}/documents/back`,
      tradeCertificate,
      ocrConfidence: ocrResult.ocrConfidence,
      nameMatchAccuracy: ocrResult.nameMatchAccuracy,
      autoVerified,
      securityFlags,
      rejectionReason: "",
      status: autoVerified ? "Active" : "Pending",
      submittedAt: new Date(),
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
      autoVerified,
    );

    let voucherAwarded = false;
    let voucherAwardError = false;
    if (autoVerified && savedUser.role === "client") {
      try {
        voucherAwarded = await awardVerificationVoucher(savedUser._id);
      } catch (error) {
        voucherAwardError = true;
        console.error("Could not award client identity verification voucher:", error);
      }
    }

    const previousPublicIds = [previousUser.verificationDetails?.idFrontPublicId, previousUser.verificationDetails?.idBackPublicId]
      .filter((publicId) => publicId && !uploadedCloudImages.includes(publicId));
    await Promise.all(previousPublicIds.map((publicId) => deleteVerificationImage(publicId).catch((error) => {
      console.error("Could not remove replaced verification image:", error.message);
    })));

    return res.status(200).json({
      success: true,
      autoVerified,
      isVerified: savedUser.isVerified,
      status: verificationDetails.status,
      verificationStatus: savedUser.verificationStatus,
      ocrConfidence: ocrResult.ocrConfidence,
      nameMatchAccuracy: ocrResult.nameMatchAccuracy,
      securityFlags,
      ...(savedUser.role === "client" && autoVerified ? { voucherAwarded, voucherAwardError } : {}),
      message: autoVerified
        ? "Your identity was verified successfully."
        : "Your documents were submitted and are waiting for manual review.",
      user: {
        isVerified: savedUser.isVerified,
        status: verificationDetails.status,
        verificationStatus: savedUser.verificationStatus,
      },
    });
  } catch (error) {
    await removeUploadedFiles(uploadedFiles);
    await Promise.all(uploadedCloudImages.map((publicId) => deleteVerificationImage(publicId).catch((deleteError) => {
      console.error("Could not remove unsaved verification image:", deleteError.message);
    })));
    console.error("Submit identity verification error:", error);
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    return res.status(500).json({ message: "We could not save your verification. Please try again." });
  } finally {
    await removeUploadedFiles(uploadedFiles);
  }
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
    const previousUser = await User.findById(req.user._id).select("role isVerified tesdaCertificates");
    if (!previousUser) {
      return res.status(404).json({ message: "Your account could not be found." });
    }
    if (previousUser.role !== "provider" || previousUser.isVerified !== true) {
      return res.status(403).json({ message: "Complete identity verification before submitting a TESDA certificate." });
    }

    const tradeKey = trade.toLowerCase();
    const alreadySubmitted = (previousUser.tesdaCertificates || []).some((certificate) =>
      certificate.trade?.trim().toLowerCase() === tradeKey &&
      ["pending", "approved"].includes(certificate.status)
    );
    if (alreadySubmitted) {
      return res.status(409).json({ message: "A TESDA certificate for this trade is already pending or approved." });
    }

    const buffer = await fs.readFile(file.path);
    uploadedImage = await uploadVerificationImage(buffer, String(req.user._id), "tesda");
    const certificateId = new mongoose.Types.ObjectId();
    const certificateImageUrl = `/api/v1/admin/verifications/${req.user._id}/tesda/${certificateId}/document`;
    const savedUser = await User.findOneAndUpdate({
      _id: req.user._id,
      role: "provider",
      isVerified: true,
      tesdaCertificates: {
        $not: {
          $elemMatch: {
            trade: { $regex: `^${trade.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
            status: { $in: ["pending", "approved"] },
          },
        },
      },
    }, {
      $push: {
        tesdaCertificates: {
          _id: certificateId,
          trade,
          status: "pending",
          submittedAt: new Date(),
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
      const error = new Error("A TESDA certificate for this trade was submitted while your upload was processing. Refresh your profile to see its status.");
      error.statusCode = 409;
      throw error;
    }

    return res.status(201).json({
      success: true,
      message: "Your TESDA certificate was submitted for review.",
      user: {
        tesdaCertificates: (savedUser.tesdaCertificates || []).map((certificate) => ({
          id: String(certificate._id),
          trade: certificate.trade || "",
          status: certificate.status || "pending",
          submittedAt: certificate.submittedAt || null,
          reviewedAt: certificate.reviewedAt || null,
          rejectionReason: certificate.rejectionReason || "",
        })),
      },
    });
  } catch (error) {
    if (uploadedImage?.publicId) {
      await deleteVerificationImage(uploadedImage.publicId).catch((deleteError) => {
        console.error("Could not remove unsaved TESDA certificate image:", deleteError.message);
      });
    }
    console.error("Submit TESDA certificate error:", error);
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    return res.status(500).json({ message: "We could not submit your TESDA certificate. Please try again." });
  } finally {
    await removeUploadedFiles([file]);
  }
}

async function handleGetAdminVerifications(_req, res) {
  try {
    const [users, providersWithPendingCertificates] = await Promise.all([
      User.find({
        "verificationDetails.status": "Pending",
        "verificationDetails.idFrontUrl": mongoose.trusted({ $ne: "" }),
        role: mongoose.trusted({ $in: ["client", "provider"] }),
      })
        .select("fullName firstName middleName lastName username email role createdAt verificationStatus isVerified verificationDetails")
        .lean(),
      User.find({
        "tesdaCertificates.status": "pending",
        role: "provider",
      })
        .select("fullName firstName middleName lastName username email role createdAt tesdaCertificates")
        .lean(),
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
      autoVerified: user.verificationDetails?.autoVerified === true,
      securityFlags: (user.verificationDetails?.securityFlags || [])
        .filter((flag) => Object.values(SECURITY_FLAGS).includes(flag)),
      rejectionReason: user.verificationDetails?.rejectionReason || "",
    }));
    const tesdaSubmissions = providersWithPendingCertificates.flatMap((user) =>
      (user.tesdaCertificates || [])
        .filter((certificate) => certificate.status === "pending")
        .filter((certificate) => certificate.certificateImageUrl)
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
          certificateUrl: certificate.certificateImageUrl || "",
        }))
    );
    const verifications = [...identitySubmissions, ...tesdaSubmissions]
      .sort((left, right) => new Date(left.submittedAt || 0) - new Date(right.submittedAt || 0));
    return res.json({
      verifications,
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
      role: "provider",
      tesdaCertificates: { $elemMatch: { _id: req.params.certificateId } },
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
  const notification = {
    title: approved ? "TESDA certificate approved" : "TESDA certificate needs changes",
    message: approved
      ? "Your TESDA certificate was approved and is now shown on your provider profile."
      : `Your TESDA certificate was rejected. ${rejectionReason}`.slice(0, 240),
    href: "/provider-profile",
    createdAt: new Date(),
  };
  try {
    const user = await User.findOneAndUpdate({
      _id: req.params.userId,
      role: "provider",
      tesdaCertificates: {
        $elemMatch: {
          _id: req.params.certificateId,
          status: "pending",
          certificateImagePublicId: { $exists: true, $ne: "" },
        },
      },
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
};
