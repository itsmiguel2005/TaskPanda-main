const fs = require("fs/promises");
const mongoose = require("mongoose");
const User = require("../models/User");
const { performOCRVerification } = require("../utils/ocrHelper");
const { revalidatePersistedVerification } = require("../services/verificationPolicy");
const { removeUploadedFiles } = require("../storage/verificationUpload");
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

    const [ocrOutcome, frontUpload, backUpload] = await Promise.allSettled([
      performOCRVerification(front.path, getProfileName(req.user)),
      fs.readFile(front.path).then((buffer) => uploadVerificationImage(buffer, String(req.user._id), "front")),
      fs.readFile(back.path).then((buffer) => uploadVerificationImage(buffer, String(req.user._id), "back")),
    ]);
    for (const upload of [frontUpload, backUpload]) {
      if (upload.status === "fulfilled") uploadedCloudImages.push(upload.value.publicId);
    }
    const failedOperation = [ocrOutcome, frontUpload, backUpload].find((result) => result.status === "rejected");
    if (failedOperation) throw failedOperation.reason;

    const ocrResult = ocrOutcome.value;
    const frontImage = frontUpload.value;
    const backImage = backUpload.value;
    const verificationDetails = {
      idFrontUrl: `/api/v1/admin/verifications/${req.user._id}/documents/front`,
      idBackUrl: `/api/v1/admin/verifications/${req.user._id}/documents/back`,
      tradeCertificate,
      ocrConfidence: ocrResult.ocrConfidence,
      nameMatchAccuracy: ocrResult.nameMatchAccuracy,
      autoVerified: ocrResult.autoVerified,
      rejectionReason: "",
      status: ocrResult.autoVerified ? "Active" : "Pending",
      submittedAt: new Date(),
      idFrontPublicId: frontImage.publicId,
      idBackPublicId: backImage.publicId,
      idFrontFormat: frontImage.format,
      idBackFormat: backImage.format,
    };

    req.user.verificationDetails = verificationDetails;
    req.user.isVerified = ocrResult.autoVerified;
    req.user.verificationStatus = ocrResult.autoVerified ? "verified" : "pending";
    await req.user.save();

    const previousPublicIds = [previousUser.verificationDetails?.idFrontPublicId, previousUser.verificationDetails?.idBackPublicId]
      .filter((publicId) => publicId && !uploadedCloudImages.includes(publicId));
    await Promise.all(previousPublicIds.map((publicId) => deleteVerificationImage(publicId).catch((error) => {
      console.error("Could not remove replaced verification image:", error.message);
    })));

    return res.status(200).json({
      success: true,
      autoVerified: ocrResult.autoVerified,
      isVerified: req.user.isVerified,
      status: verificationDetails.status,
      verificationStatus: req.user.verificationStatus,
      ocrConfidence: ocrResult.ocrConfidence,
      nameMatchAccuracy: ocrResult.nameMatchAccuracy,
      message: ocrResult.autoVerified
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
      "verificationDetails.nameMatchAccuracy": mongoose.trusted({ $ne: 100 }),
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
    const user = await User.findOneAndUpdate({
      _id: req.params.userId,
      "verificationDetails.status": "Pending",
      role: mongoose.trusted({ $in: ["client", "provider"] }),
    }, {
      $set: {
        "verificationDetails.status": approved ? "Active" : "Rejected",
        "verificationDetails.rejectionReason": approved ? "" : rejectionReason.trim(),
        isVerified: approved,
        verificationStatus: approved ? "verified" : "rejected",
      },
    }, { new: true, runValidators: true });
    if (!user) return res.status(404).json({ message: "This pending verification could not be found." });

    return res.json({
      success: true,
      userId: String(user._id),
      status: user.verificationDetails.status,
      isVerified: user.isVerified,
      verificationStatus: user.verificationStatus,
    });
  } catch (error) {
    console.error("Admin verification review error:", error);
    return res.status(500).json({ message: "Could not update this identity verification." });
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
  handleGetVerificationDocument,
  handleReviewVerification,
  handleSubmitVerification,
};
