const mongoose = require("mongoose");
const User = require("../models/User");

async function revalidatePersistedVerification(user, userModel = User) {
  const details = user.verificationDetails;
  if (
    user.isVerified !== true ||
    details?.status !== "Active" ||
    details.nameMatchAccuracy >= 75
  ) {
    return false;
  }

  const rejectionReason = "Your ID's first and last names did not match your account name. Please resubmit an ID that clearly shows both.";
  const result = await userModel.updateOne({
    _id: user._id,
    isVerified: true,
    "verificationDetails.status": "Active",
    "verificationDetails.nameMatchAccuracy": mongoose.trusted({ $lt: 75 }),
  }, {
    $set: {
      isVerified: false,
      verificationStatus: "pending",
      "verificationDetails.status": "Pending",
      "verificationDetails.autoVerified": false,
      "verificationDetails.rejectionReason": rejectionReason,
    },
  });

  if (result.modifiedCount === 0) {
    const currentUser = await userModel.findById(user._id)
      .select("isVerified verificationStatus verificationDetails.status verificationDetails.autoVerified verificationDetails.rejectionReason");
    if (currentUser) {
      user.isVerified = currentUser.isVerified;
      user.verificationStatus = currentUser.verificationStatus;
      if (user.verificationDetails && currentUser.verificationDetails) {
        user.verificationDetails.status = currentUser.verificationDetails.status;
        user.verificationDetails.autoVerified = currentUser.verificationDetails.autoVerified;
        user.verificationDetails.rejectionReason = currentUser.verificationDetails.rejectionReason;
      }
    }
    return false;
  }

  user.isVerified = false;
  user.verificationStatus = "pending";
  details.status = "Pending";
  details.autoVerified = false;
  details.rejectionReason = rejectionReason;
  console.warn("Previously approved identity moved back to review because its OCR name match was incomplete.", String(user._id));
  return true;
}

module.exports = { revalidatePersistedVerification };
