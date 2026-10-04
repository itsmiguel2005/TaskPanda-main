const test = require("node:test");
const assert = require("node:assert/strict");
const { revalidatePersistedVerification } = require("./verificationPolicy");

function createUser(overrides = {}) {
  return {
    _id: "user-123",
    isVerified: true,
    verificationStatus: "verified",
    verificationDetails: {
      status: "Active",
      nameMatchAccuracy: 66,
      autoVerified: true,
      rejectionReason: "",
    },
    ...overrides,
  };
}

function createModel({ modifiedCount = 1, currentUser = null } = {}) {
  return {
    updateCalls: 0,
    async updateOne() {
      this.updateCalls += 1;
      return { modifiedCount };
    },
    findById() {
      return { select: async () => currentUser };
    },
  };
}

test("previous approvals with incomplete OCR name match are returned to pending review", async () => {
  const user = createUser();
  const userModel = createModel();

  assert.equal(await revalidatePersistedVerification(user, userModel), true);
  assert.equal(user.isVerified, false);
  assert.equal(user.verificationStatus, "pending");
  assert.equal(user.verificationDetails.status, "Pending");
  assert.equal(user.verificationDetails.autoVerified, false);
  assert.match(user.verificationDetails.rejectionReason, /first and last names/);
  assert.equal(userModel.updateCalls, 1);
});

test("previous approval remains verified when the weighted name score is at least 75%", async () => {
  const user = createUser({
    verificationDetails: {
      status: "Active",
      nameMatchAccuracy: 75,
      autoVerified: true,
      rejectionReason: "",
    },
  });

  const userModel = createModel();
  assert.equal(await revalidatePersistedVerification(user, userModel), false);
  assert.equal(user.isVerified, true);
  assert.equal(userModel.updateCalls, 0);
});

test("previous approval with all name parts matched remains verified", async () => {
  const user = createUser({
    verificationDetails: {
      status: "Active",
      nameMatchAccuracy: 100,
      autoVerified: true,
      rejectionReason: "",
    },
  });

  const userModel = createModel();
  assert.equal(await revalidatePersistedVerification(user, userModel), false);
  assert.equal(user.isVerified, true);
  assert.equal(userModel.updateCalls, 0);
});

test("unverified or legacy records are not modified by verification revalidation", async () => {
  const user = createUser({ isVerified: false });
  const legacyUser = createUser({ verificationDetails: undefined });
  const userModel = createModel();

  assert.equal(await revalidatePersistedVerification(user, userModel), false);
  assert.equal(await revalidatePersistedVerification(legacyUser, userModel), false);
  assert.equal(userModel.updateCalls, 0);
});

test("concurrent policy checks reload the already-downgraded database state", async () => {
  const user = createUser();
  const userModel = createModel({
    modifiedCount: 0,
    currentUser: {
      isVerified: false,
      verificationStatus: "pending",
      verificationDetails: {
        status: "Pending",
        autoVerified: false,
        rejectionReason: "Resubmit an ID showing your full account name.",
      },
    },
  });

  assert.equal(await revalidatePersistedVerification(user, userModel), false);
  assert.equal(user.isVerified, false);
  assert.equal(user.verificationStatus, "pending");
  assert.equal(user.verificationDetails.status, "Pending");
  assert.equal(userModel.updateCalls, 1);
});
