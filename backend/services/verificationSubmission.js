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

module.exports = { persistVerificationSubmission };
