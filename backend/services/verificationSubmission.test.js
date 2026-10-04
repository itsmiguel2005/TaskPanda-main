const test = require("node:test");
const assert = require("node:assert/strict");
const {
  markVerificationOCRUnavailable,
  persistVerificationOCRResult,
  persistVerificationSubmission,
} = require("./verificationSubmission");

function createUserModel(currentUser) {
  return {
    updateFilter: null,
    updateData: null,
    async findOneAndUpdate(filter, update) {
      this.updateFilter = filter;
      this.updateData = update;

      const currentDetails = currentUser.verificationDetails || {};
      const submittedAtMatches = (currentDetails.submittedAt || null) === filter["verificationDetails.submittedAt"];
      const reviewedAtMatches = (currentDetails.reviewedAt || null) === filter["verificationDetails.reviewedAt"];
      const matches = currentUser._id === filter._id &&
        currentUser.isVerified === filter.isVerified &&
        currentUser.verificationStatus === filter.verificationStatus &&
        (currentDetails.status || null) === filter["verificationDetails.status"] &&
        submittedAtMatches &&
        reviewedAtMatches;

      if (!matches) return null;
      Object.assign(currentUser, update.$set);
      return currentUser;
    },
  };
}

test("a late upload cannot overwrite an admin approval", async () => {
  const submissionStartedAt = new Date("2026-10-04T07:00:00.000Z");
  const currentUser = {
    _id: "user-123",
    isVerified: true,
    verificationStatus: "verified",
    verificationDetails: {
      status: "Active",
      submittedAt: submissionStartedAt,
      autoVerified: false,
    },
  };
  const userModel = createUserModel(currentUser);
  const pendingDetails = {
    status: "Pending",
    submittedAt: new Date("2026-10-04T07:00:10.000Z"),
    autoVerified: false,
  };

  await assert.rejects(
    persistVerificationSubmission(userModel, {
      _id: "user-123",
      isVerified: false,
      verificationStatus: "pending",
      verificationDetails: {
        status: "Pending",
        submittedAt: submissionStartedAt,
      },
    }, pendingDetails, false),
    { statusCode: 409, message: /reviewed while this submission was processing/ },
  );

  assert.equal(currentUser.isVerified, true);
  assert.equal(currentUser.verificationStatus, "verified");
  assert.equal(currentUser.verificationDetails.status, "Active");
  assert.equal(userModel.updateData.$set.verificationDetails, pendingDetails);
});

test("a submission is saved when the verification state has not changed", async () => {
  const submittedAt = new Date("2026-10-04T07:00:00.000Z");
  const currentUser = {
    _id: "user-123",
    isVerified: false,
    verificationStatus: "pending",
    verificationDetails: { status: "Pending", submittedAt },
  };
  const userModel = createUserModel(currentUser);
  const nextDetails = { status: "Pending", submittedAt: new Date() };

  const savedUser = await persistVerificationSubmission(userModel, currentUser, nextDetails, false);

  assert.equal(savedUser, currentUser);
  assert.equal(savedUser.verificationDetails, nextDetails);
  assert.equal(savedUser.isVerified, false);
  assert.equal(savedUser.verificationStatus, "pending");
});

test("a review marker prevents an in-flight submission from replacing the review result", async () => {
  const reviewedAt = new Date("2026-10-04T07:21:40.000Z");
  const currentUser = {
    _id: "user-123",
    isVerified: true,
    verificationStatus: "verified",
    verificationDetails: {
      status: "Active",
      submittedAt: new Date("2026-10-04T07:21:35.000Z"),
      reviewedAt,
      autoVerified: false,
    },
  };
  const userModel = createUserModel(currentUser);
  const staleSubmission = {
    status: "Pending",
    submittedAt: new Date("2026-10-04T07:21:35.000Z"),
    reviewedAt: null,
  };

  await assert.rejects(
    persistVerificationSubmission(userModel, {
      _id: "user-123",
      isVerified: false,
      verificationStatus: "pending",
      verificationDetails: {
        status: "Pending",
        submittedAt: staleSubmission.submittedAt,
        reviewedAt: null,
      },
    }, staleSubmission, false),
    { statusCode: 409, message: /reviewed while this submission was processing/ },
  );

  assert.equal(currentUser.isVerified, true);
  assert.equal(currentUser.verificationStatus, "verified");
  assert.equal(currentUser.verificationDetails.status, "Active");
  assert.equal(currentUser.verificationDetails.reviewedAt, reviewedAt);
});

test("background OCR updates only the exact still-processing submission", async () => {
  const submittedAt = new Date("2026-10-04T07:30:00.000Z");
  const updates = [];
  const userModel = {
    async findOneAndUpdate(filter, update, options) {
      updates.push({ filter, update, options });
      return { _id: "user-123" };
    },
  };

  await persistVerificationOCRResult(userModel, "user-123", submittedAt, {
    ocrConfidence: 86,
    nameMatchAccuracy: 100,
    autoVerified: true,
    securityFlags: [],
  });

  assert.equal(updates[0].filter._id, "user-123");
  assert.equal(updates[0].filter["verificationDetails.submittedAt"], submittedAt);
  assert.equal(updates[0].filter["verificationDetails.status"], "Pending");
  assert.equal(updates[0].filter["verificationDetails.ocrProcessing"], true);
  assert.equal(updates[0].update.$set["verificationDetails.status"], "Active");
  assert.equal(updates[0].update.$set["verificationDetails.ocrProcessing"], false);
  assert.equal(updates[0].update.$set.verificationStatus, "verified");
  assert.equal(updates[0].options.new, true);
});

test("OCR-unavailable fallback keeps a submission pending for manual review", async () => {
  const submittedAt = new Date("2026-10-04T07:31:00.000Z");
  const updates = [];
  const userModel = {
    async findOneAndUpdate(filter, update) {
      updates.push({ filter, update });
      return null;
    },
  };

  const result = await markVerificationOCRUnavailable(userModel, "user-123", submittedAt, []);

  assert.equal(result, null);
  assert.equal(updates[0].update.$set["verificationDetails.ocrConfidence"], 0);
  assert.equal(updates[0].update.$set["verificationDetails.nameMatchAccuracy"], 0);
  assert.equal(updates[0].update.$set["verificationDetails.ocrProcessing"], false);
  assert.equal(updates[0].update.$set["verificationDetails.status"], "Pending");
  assert.equal(updates[0].update.$set.isVerified, false);
});
