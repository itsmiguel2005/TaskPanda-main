const test = require("node:test");
const assert = require("node:assert/strict");
const User = require("./User");

test("validation removes the retired camera-metadata flag from existing users", async () => {
  const user = new User({
    role: "client",
    email: "legacy-camera-flag@example.test",
    passwordHash: "unused",
    verificationDetails: {
      securityFlags: [
        "CAMERA_METADATA_MISSING",
        "METADATA_INSPECTION_FAILED",
      ],
    },
  });

  await user.validate();
  assert.deepEqual([...user.verificationDetails.securityFlags], [
    "METADATA_INSPECTION_FAILED",
  ]);
});
