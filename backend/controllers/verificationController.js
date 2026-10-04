const fs = require("fs/promises");
const mongoose = require("mongoose");
const User = require("../models/User");
const {
  areIdSidesLikelySwapped,
  classifyIdSide,
  performOCRVerification,
} = require("../utils/ocrHelper");
const { SECURITY_FLAGS, inspectVerificationMetadata } = require("../utils/verificationMetadata");
const { revalidatePersistedVerification } = require("../services/verificationPolicy");
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

    const ocrResult = await performOCRVerification(front.path, getProfileName(req.user));
    const backOcrResult = await performOCRVerification(back.path, getProfileName(req.user));
    if (areIdSidesLikelySwapped(ocrResult, backOcrResult)) {
      return res.status(400).json({
        message: "The name on your ID appears on the image uploaded as ID Back instead of ID Front. Swap the images so the side with your photo and name is ID Front, then submit again.",
        code: "ID_SIDES_APPEAR_SWAPPED",
      });
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
      return res.status(400).json({
        message: "This looks like the back of your ID. Upload the side showing your photo and name as ID Front, then upload the reverse as ID Back.",
        code: "ID_FRONT_APPEARS_TO_BE_BACK",
      });
    }
    const [frontUpload, backUpload] = await Promise.allSettled([
      uploadVerificationImage(frontBuffer, String(req.user._id), "front"),
      uploadVerificationImage(backBuffer, String(req.user._id), "back"),
    ]);
    for (const upload of [frontUpload, backUpload]) {
      if (upload.status === "fulfilled") uploadedCloudImages.push(upload.value.publicId);
    }
    const failedOperation = [frontUpload, backUpload].find((result) => result.status === "rejected");
    if (failedOperation) throw failedOperation.reason;

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
      idFrontPublicId: frontImage.publicId,
      idBackPublicId: backImage.publicId,
      idFrontFormat: frontImage.format,
      idBackFormat: backImage.format,
    };

    req.user.verificationDetails = verificationDetails;
    req.user.isVerified = autoVerified;
    req.user.verificationStatus = autoVerified ? "verified" : "pending";
    await req.user.save();

    let voucherAwarded = false;
    let voucherAwardError = false;
    if (autoVerified && req.user.role === "client") {
      try {
        voucherAwarded = await awardVerificationVoucher(req.user._id);
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
      isVerified: req.user.isVerified,
      status: verificationDetails.status,
      verificationStatus: req.user.verificationStatus,
      ocrConfidence: ocrResult.ocrConfidence,
      nameMatchAccuracy: ocrResult.nameMatchAccuracy,
      securityFlags,
      ...(req.user.role === "client" && autoVerified ? { voucherAwarded, voucherAwardError } : {}),
      message: autoVerified
        ? "Your identity was verified successfully."
        : "Your documents were submitted and are waiting for manual review.",
      user: {
        isVerified: req.user.isVerified,
        status: verificationDetails.status,
        verificationStatus: req.user.verificationStatus,
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

async function handleGetAdminVerifications(_req, res) {
  try {
    const previousPartialMatches = await User.find({
      isVerified: true,
      "verificationDetails.status": "Active",
      "verificationDetails.nameMatchAccuracy": mongoose.trusted({ $lt: 75 }),
    });
    for (const user of previousPartialMatches) {
      await revalidatePersistedVerification(user);
    }

    const users = await User.find({
      "verificationDetails.status": "Pending",
      "verificationDetails.idFrontUrl": mongoose.trusted({ $ne: "" }),
      role: mongoose.trusted({ $in: ["client", "provider"] }),
    })
      .select("fullName firstName middleName lastName username email role createdAt verificationStatus isVerified verificationDetails")
      .sort({ "verificationDetails.submittedAt": 1 })
      .lean();

    return res.json({
      verifications: users.map((user) => ({
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
        securityFlags: user.verificationDetails?.securityFlags || [],
        rejectionReason: user.verificationDetails?.rejectionReason || "",
      })),
    });
  } catch (error) {
    console.error("Admin verification queue error:", error);
    return res.status(500).json({ message: "Could not load pending identity verifications." });
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
  handleGetVerificationNotifications,
  handleGetVerificationDocument,
  handleMarkVerificationNotificationRead,
  handleReviewVerification,
  handleSubmitVerification,
};
