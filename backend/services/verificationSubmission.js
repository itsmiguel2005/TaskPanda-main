const mongoose = require("mongoose");

async function persistVerificationSubmission(userModel, previousUser, verificationDetails, autoVerified) {
  const previousDetails = previousUser.verificationDetails || {};
  const user = await userModel.findOneAndUpdate({
    _id: previousUser._id,
    isVerified: previousUser.isVerified === true,
    verificationStatus: previousUser.verificationStatus || "unverified",
    "verificationDetails.status": previousDetails.status || null,
    "verificationDetails.submittedAt": previousDetails.submittedAt || null,
    "verificationDetails.reviewedAt": previousDetails.reviewedAt || null,
  }, {
    $set: {
      verificationDetails,
      isVerified: autoVerified,
      verificationStatus: autoVerified ? "verified" : "pending",
    },
  }, {
    new: true,
    runValidators: true,
  });

  if (!user) {
    const error = new Error("Your verification was reviewed while this submission was processing. The review decision was kept; refresh your profile to see the latest status.");
    error.statusCode = 409;
    throw error;
  }

  return user;
}

async function persistVerificationOCRResult(userModel, userId, submittedAt, result) {
  const user = await userModel.findOneAndUpdate({
    _id: userId,
    isVerified: false,
    verificationStatus: "pending",
    "verificationDetails.status": "Pending",
    "verificationDetails.submittedAt": submittedAt,
    "verificationDetails.reviewedAt": null,
    "verificationDetails.ocrProcessing": true,
  }, {
    $set: {
      "verificationDetails.ocrProcessing": false,
      "verificationDetails.ocrConfidence": result.ocrConfidence,
      "verificationDetails.nameMatchAccuracy": result.nameMatchAccuracy,
      "verificationDetails.autoVerified": result.autoVerified,
      "verificationDetails.status": result.autoVerified ? "Active" : "Pending",
      "verificationDetails.securityFlags": result.securityFlags,
      isVerified: result.autoVerified,
      verificationStatus: result.autoVerified ? "verified" : "pending",
    },
  }, {
    new: true,
    runValidators: true,
  });

  return user;
}

async function markVerificationOCRUnavailable(userModel, userId, submittedAt, securityFlags) {
  return persistVerificationOCRResult(userModel, userId, submittedAt, {
    ocrConfidence: 0,
    nameMatchAccuracy: 0,
    autoVerified: false,
    securityFlags,
  });
}

async function releaseStaleVerificationOCR(userModel, staleBefore) {
  const result = await userModel.updateMany({
    isVerified: false,
    verificationStatus: "pending",
    "verificationDetails.status": "Pending",
    "verificationDetails.ocrProcessing": true,
    "verificationDetails.submittedAt": mongoose.trusted({ $lt: staleBefore }),
  }, {
    $set: {
      "verificationDetails.ocrProcessing": false,
      "verificationDetails.ocrConfidence": 0,
      "verificationDetails.nameMatchAccuracy": 0,
      "verificationDetails.autoVerified": false,
    },
  });
  return result.modifiedCount;
}

module.exports = {
  markVerificationOCRUnavailable,
  persistVerificationOCRResult,
  persistVerificationSubmission,
  releaseStaleVerificationOCR,
};
