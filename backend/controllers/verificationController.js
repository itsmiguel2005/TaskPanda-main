const fs = require("fs/promises");
const mongoose = require("mongoose");
const { logAuditAction } = require("../utils/logAuditAction");
const { notifyAdminEvent } = require("../services/adminNotifications");
const User = require("../models/User");
const { encryptIdentifier, getIdentityKeys, maskIdentifier } = require("../utils/identityCrypto");
const { recordIdentityVerificationAttempt } = require("../utils/identityVerificationAudit");
const { prepareVerificationDocument } = require("../utils/verificationDocument");
const { getAgeFromDateOfBirth } = require("../utils/providerAge");
const tesdaSectors = require("../../shared/tesdaQualifications.json");
const TESDA_QUALIFICATIONS = new Set(tesdaSectors.flatMap(({ qualifications }) => qualifications));
const PHILSYS_RETAKE_MESSAGE = "Incorrect ID or blurry photo detected. TaskPanda only accepts the Philippine National ID (PhilSys). Please ensure a clear photo of your PhilSys ID is provided and retake it.";
const PHILSYS_HEADER_RETAKE_MESSAGE = "We couldn't read the PhilSys heading. Make sure the top of the front of your Philippine National ID is fully visible, then retake the photo.";
const PHILSYS_NUMBER_RETAKE_MESSAGE = "We recognized the PhilSys ID, but couldn't read its number. Retake the front photo closer, with the number below the heading fully visible.";

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
const { performOCRVerification, shouldUseManualReview } = require("../utils/ocrHelper");
const { SECURITY_FLAGS, inspectVerificationMetadata } = require("../utils/verificationMetadata");
const {
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

async function handleSubmitVerification(req, res) {
  const front = req.files?.idFront?.[0];
  const uploadedFiles = front ? [front] : [];
  const uploadedCloudImages = [];
  let uploadedDocuments = [];
  let auditRecorded = false;
  let savedSubmission = false;
  let identifierHash = '';

  const recordAttempt = async (status, reason) => {
    await recordIdentityVerificationAttempt(req, {
      identifierHash,
      reason,
      status,
      userId: req.user?._id,
    });
    auditRecorded = true;
  };

  try {
    if (!front) {
      await recordAttempt('FAILURE', 'invalid_document');
      return res.status(400).json({ message: 'Upload the front of your PhilSys National ID.' });
    }

    const previousUser = await User.findById(req.user._id)
      .select('+verificationDetails.idFrontPublicId +verificationDetails.idBackPublicId');
    if (!previousUser) {
      await recordAttempt('FAILURE', 'processing_error');
      return res.status(404).json({ message: 'Your account could not be found.' });
    }
    if (previousUser.isVerified === true && previousUser.verificationDetails?.status === 'Active') {
      await recordAttempt('FAILURE', 'processing_error');
      return res.status(409).json({ message: 'Your identity is already verified.' });
    }

    const tradeCertificate = String(req.body.tradeCertificate || req.body.certificate || '').trim();
    if (tradeCertificate.length > 200) {
      await recordAttempt('FAILURE', 'processing_error');
      return res.status(400).json({ message: 'Trade certificates must be 200 characters or fewer.' });
    }

    const keys = getIdentityKeys();
    const frontBuffer = await fs.readFile(front.path);
    const frontDocument = await prepareVerificationDocument(frontBuffer, front.mimetype);

    if (frontDocument.quality.isBlurry || frontDocument.quality.isTooDark) {
      await recordAttempt('FAILURE', 'image_quality');
      return res.status(422).json({ message: PHILSYS_RETAKE_MESSAGE });
    }

    const ocrResult = await performOCRVerification(frontDocument.buffer, {
      firstName: previousUser.firstName,
      middleName: previousUser.middleName,
      lastName: previousUser.lastName,
      fullName: getProfileName(previousUser),
      dateOfBirth: previousUser.dateOfBirth,
      role: previousUser.role,
    });
    if (!ocrResult.headerMatched) {
      await recordAttempt('FAILURE', 'invalid_document');
      return res.status(422).json({ message: PHILSYS_HEADER_RETAKE_MESSAGE });
    }
    if (!ocrResult.identifier) {
      await recordAttempt('FAILURE', 'invalid_document');
      return res.status(422).json({ message: PHILSYS_NUMBER_RETAKE_MESSAGE });
    }

    const protectedIdentifier = encryptIdentifier(
      ocrResult.identifier.digits,
      ocrResult.identifier.type,
      keys,
    );
    identifierHash = protectedIdentifier.hash;

    if (previousUser.role === 'provider' && ocrResult.providerAge !== null && ocrResult.providerAge < 18) {
      await recordAttempt('FAILURE', 'underage');
      return res.status(422).json({ message: 'Providers must be at least 18 years old to verify their identity.' });
    }

    const metadataInspections = await Promise.all([
      ...(frontDocument.isPdf ? [] : [
        inspectVerificationMetadata(frontBuffer),
      ]),
    ]);
    const securityFlags = [...new Set(metadataInspections.flatMap(({ flags }) => flags))];
    metadataInspections.forEach(({ error }) => {
      if (error) console.warn('Verification metadata inspection failed.');
    });

    const autoVerified = ocrResult.autoVerified;
    const manualReview = !autoVerified && shouldUseManualReview(ocrResult);
    if (!autoVerified && !manualReview) {
      await recordAttempt('FAILURE', 'identity_mismatch');
      return res.status(422).json({
        message: 'The name on your PhilSys ID does not match your TaskPanda account. Check your profile details or contact support.',
      });
    }

    if (manualReview) {
      const frontImage = await uploadVerificationImage(
        frontDocument.buffer,
        String(req.user._id),
        'front',
      );
      uploadedDocuments = [frontImage];
      uploadedCloudImages.push(frontImage.publicId);
    }

    const frontImage = uploadedDocuments[0] || null;
    const submittedAt = new Date();
    const verificationDetails = {
      idFrontUrl: frontImage ? `/api/v1/admin/verifications/${req.user._id}/documents/front` : '',
      idBackUrl: '',
      idBackPublicId: '',
      idBackFormat: '',
      tradeCertificate,
      ocrConfidence: ocrResult.ocrConfidence,
      verificationScore: ocrResult.verificationScore,
      nameMatchAccuracy: ocrResult.nameMatchAccuracy,
      dateOfBirthMatched: ocrResult.dateOfBirthMatched,
      ageEligible: previousUser.role !== 'provider' ||
        ocrResult.providerAge !== null && ocrResult.providerAge >= 18,
      ocrProcessing: false,
      autoVerified,
      securityFlags,
      rejectionReason: '',
      status: autoVerified ? 'Active' : 'Pending',
      submittedAt,
      reviewedAt: null,
      ...(frontImage ? {
        idFrontPublicId: frontImage.publicId,
        idFrontFormat: frontImage.format,
      } : {}),
      identifierType: ocrResult.identifier.type,
      identifierCiphertext: protectedIdentifier.ciphertext,
      identifierIv: protectedIdentifier.iv,
      identifierTag: protectedIdentifier.tag,
      identifierKeyVersion: protectedIdentifier.keyVersion,
      identifierHash: protectedIdentifier.hash,
      identifierLastFour: protectedIdentifier.lastFour,
    };

    const savedUser = await persistVerificationSubmission(User, previousUser, verificationDetails, autoVerified);
    savedSubmission = true;
    const previousPublicIds = [
      previousUser.verificationDetails?.idFrontPublicId,
      previousUser.verificationDetails?.idBackPublicId,
    ].filter((publicId) => publicId && !uploadedCloudImages.includes(publicId));
    await Promise.all(previousPublicIds.map((publicId) => deleteVerificationImage(publicId).catch((error) => {
      console.error('Could not remove replaced verification image:', error.message);
    })));

    await recordAttempt(
      autoVerified ? 'SUCCESS' : 'PENDING_MANUAL_REVIEW',
      autoVerified ? 'verified' : 'manual_review',
    );

    if (!autoVerified) await notifyIdentityVerificationReview(savedUser._id, savedUser.role, submittedAt);
    if (autoVerified && savedUser.role === 'client') {
      try {
        await awardVerificationVoucher(savedUser._id);
      } catch (error) {
        console.error('Could not award client identity verification voucher:', error.message);
      }
    }

    return res.status(autoVerified ? 200 : 202).json({
      success: true,
      autoVerified,
      ocrProcessing: false,
      isVerified: autoVerified,
      status: autoVerified ? 'Active' : 'Pending',
      verificationStatus: savedUser.verificationStatus,
      ocrConfidence: ocrResult.ocrConfidence,
      verificationScore: ocrResult.verificationScore,
      nameMatchAccuracy: ocrResult.nameMatchAccuracy,
      securityFlags,
      message: autoVerified
        ? 'Your PhilSys ID is verified.'
        : 'Your PhilSys ID is in the secure admin queue for manual review.',
      user: {
        isVerified: autoVerified,
        status: autoVerified ? 'Active' : 'Pending',
        verificationStatus: savedUser.verificationStatus,
      },
    });
  } catch (error) {
    if (!auditRecorded) {
      try {
        await recordAttempt('FAILURE', error.code === 11000 ? 'duplicate_identifier' : 'processing_error');
      } catch (auditError) {
        console.error('Identity verification audit write failed:', auditError.message);
      }
    }
    if (!savedSubmission) {
      await Promise.all(uploadedCloudImages.map((publicId) => deleteVerificationImage(publicId).catch((deleteError) => {
        console.error('Could not remove unsaved verification image:', deleteError.message);
      })));
    }
    console.error('PhilSys verification submission failed:', error.code || error.statusCode || 'unexpected error');
    if (error.code === 11000) {
      return res.status(409).json({ message: 'This PhilSys ID is already linked to another TaskPanda account.' });
    }
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    return res.status(500).json({ message: 'We could not securely process your PhilSys ID. Please try again.' });
  } finally {
    await removeUploadedFiles(uploadedFiles);
  }
}

async function notifyIdentityVerificationReview(userId, role, submittedAt) {
  try {
    await notifyAdminEvent({
      title: 'PhilSys identity verification needs review',
      body: `A ${role} submitted a PhilSys ID for manual review.`,
      url: '/admin?section=verifications',
      eventKey: `verification.identity:${userId}:${new Date(submittedAt).getTime()}`,
      data: { event: 'verification.identity_submitted', userId: String(userId) },
    });
  } catch (error) {
    console.error('PhilSys verification admin notification failed:', error.message);
  }
}

async function resumePendingVerificationOCR() {
  return releaseStaleVerificationOCR(User, new Date());
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
    try {
      await notifyAdminEvent({
        title: "TESDA certificate submitted",
        body: `A ${req.user.role} submitted a TESDA certificate for ${trade}.`,
        url: "/admin?section=verifications",
        eventKey: `verification.tesda:${req.user._id}:${certificateId}:${submittedAt.getTime()}`,
        data: {
          event: "verification.tesda_submitted",
          userId: String(req.user._id),
        },
      });
    } catch (notificationError) {
      console.error("TESDA verification admin notification failed:", notificationError.message);
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
        .select([
          "fullName firstName middleName lastName username email role dateOfBirth createdAt verificationStatus isVerified",
          "verificationDetails.idFrontUrl verificationDetails.idBackUrl",
          "verificationDetails.tradeCertificate verificationDetails.ocrConfidence verificationDetails.verificationScore verificationDetails.nameMatchAccuracy",
          "verificationDetails.dateOfBirthMatched verificationDetails.ageEligible verificationDetails.ocrProcessing",
          "verificationDetails.autoVerified verificationDetails.securityFlags verificationDetails.rejectionReason",
          "verificationDetails.status verificationDetails.submittedAt",
          "+verificationDetails.identifierLastFour +verificationDetails.identifierType",
        ].join(" "))
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
      dateOfBirth: user.role === "provider" ? user.dateOfBirth || null : null,
      accountCreatedAt: user.createdAt,
      submittedAt: user.verificationDetails?.submittedAt || null,
      status: user.verificationDetails?.status || "Pending",
      idFrontUrl: user.verificationDetails?.idFrontUrl || "",
      idBackUrl: user.verificationDetails?.idBackUrl || "",
      tradeCertificate: user.verificationDetails?.tradeCertificate || "",
      ocrConfidence: user.verificationDetails?.ocrConfidence ?? null,
      verificationScore: user.verificationDetails?.verificationScore ?? null,
      nameMatchAccuracy: user.verificationDetails?.nameMatchAccuracy ?? null,
      ocrProcessing: user.verificationDetails?.ocrProcessing === true,
      autoVerified: user.verificationDetails?.autoVerified === true,
      maskedIdentifier: user.verificationDetails?.identifierLastFour
        ? maskIdentifier(
          user.verificationDetails.identifierType,
          user.verificationDetails.identifierLastFour,
        )
        : "",
      identifierType: user.verificationDetails?.identifierType || "",
      dateOfBirthMatched: user.verificationDetails?.dateOfBirthMatched === true,
      ageEligible: user.verificationDetails?.ageEligible === true,
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
    void logAuditAction(req, {
      category: "OPERATIONS",
      action: approved ? "VERIFICATION_APPROVED" : "VERIFICATION_REJECTED",
      targetResource: "ProviderVerification",
      targetId: req.params.certificateId,
      details: `TESDA certificate ${approved ? "approved" : "rejected"} for ${user.fullName || user.email}.`,
    });
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
  const { action, nameMatchConfirmed, dobMatchConfirmed, rejectionReason } = req.body || {};
  if (!["approve", "reject"].includes(action)) {
    return res.status(400).json({ message: "Choose approve or reject for this PhilSys verification." });
  }
  if (action === "approve" && nameMatchConfirmed !== true) {
    return res.status(400).json({ message: "Confirm that the name on the PhilSys ID matches the account before approving." });
  }
  const trimmedRejectionReason = String(rejectionReason || "").trim();
  if (action === "reject" && (!trimmedRejectionReason || trimmedRejectionReason.length > 500)) {
    return res.status(400).json({ message: "Provide a rejection reason of 1 to 500 characters." });
  }
  try {
    const approved = action === "approve";
    const targetUser = await User.findById(req.params.userId)
      .select("role dateOfBirth verificationDetails.submittedAt +verificationDetails.idFrontPublicId +verificationDetails.idBackPublicId")
      .lean();
    if (!targetUser) return res.status(404).json({ message: "This pending verification could not be found." });
    if (approved && targetUser.role === "provider" && dobMatchConfirmed !== true) {
      return res.status(400).json({ message: "Confirm that the date of birth on the PhilSys ID matches the provider account before approving." });
    }
    const profileDob = typeof targetUser.dateOfBirth === "string"
      ? targetUser.dateOfBirth.slice(0, 10)
      : targetUser.dateOfBirth?.toISOString?.().slice(0, 10) || "";
    if (approved && targetUser.role === "provider" &&
      (getAgeFromDateOfBirth(profileDob) ?? 0) < 18) {
      return res.status(400).json({ message: "Providers must be at least 18 years old to verify their identity." });
    }
    const update = {
      $set: {
        "verificationDetails.status": approved ? "Active" : "Rejected",
        "verificationDetails.ocrProcessing": false,
        "verificationDetails.rejectionReason": approved ? "" : trimmedRejectionReason,
        "verificationDetails.autoVerified": false,
        "verificationDetails.dateOfBirthMatched": approved && targetUser.role === "provider",
        "verificationDetails.ageEligible": approved,
        "verificationDetails.idFrontUrl": "",
        "verificationDetails.idBackUrl": "",
        "verificationDetails.reviewedAt": new Date(),
        isVerified: approved,
        verificationStatus: approved ? "verified" : "rejected",
      },
      $unset: {
        "verificationDetails.idFrontPublicId": 1,
        "verificationDetails.idBackPublicId": 1,
        "verificationDetails.idFrontFormat": 1,
        "verificationDetails.idBackFormat": 1,
      },
    };
    if (!approved) {
      update.$push = {
        verificationNotifications: {
          $each: [{
            title: "Identity verification rejected",
            message: `Your identity verification was rejected. ${trimmedRejectionReason}`,
            href: userProfilePathForRole(targetUser?.role),
            createdAt: new Date(),
          }],
          $slice: -25,
        },
      };
    }
    const user = await User.findOneAndUpdate({
      _id: req.params.userId,
      "verificationDetails.submittedAt": targetUser.verificationDetails?.submittedAt,
      "verificationDetails.status": "Pending",
      role: mongoose.trusted({ $in: ["client", "provider"] }),
    }, update, { new: true, runValidators: true });
    if (!user) return res.status(404).json({ message: "This pending verification could not be found." });
    await Promise.all([
      targetUser.verificationDetails?.idFrontPublicId,
      targetUser.verificationDetails?.idBackPublicId,
    ].filter(Boolean).map((publicId) => deleteVerificationImage(publicId).catch((error) => {
      console.error("Could not remove reviewed PhilSys image:", error.message);
    })));
    void logAuditAction(req, {
      category: "OPERATIONS",
      action: approved ? "VERIFICATION_APPROVED" : "VERIFICATION_REJECTED",
      targetResource: "User",
      targetId: user._id,
      details: `PhilSys identity verification ${approved ? "approved" : "rejected"} for ${user.fullName || user.email}.`,
    });

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
          body: `Your identity verification was rejected. ${trimmedRejectionReason}`,
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
