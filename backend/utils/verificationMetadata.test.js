const test = require("node:test");
const assert = require("node:assert/strict");
const {
  SECURITY_FLAGS,
  getVerificationMetadataFlags,
} = require("./verificationMetadata");

test("metadata from known editing and AI software is flagged", () => {
  for (const software of ["Adobe Photoshop 25", "Illustrator", "Canva", "Midjourney"]) {
    assert.deepEqual(getVerificationMetadataFlags({
      Make: "Canon",
      Model: "EOS",
      XMP: { CreatorTool: software },
    }), [SECURITY_FLAGS.AI_OR_EDITED_METADATA_DETECTED]);
  }
});

test("missing camera metadata is flagged for admin inspection", () => {
  assert.deepEqual(getVerificationMetadataFlags({ Software: "Unknown application" }), [
    SECURITY_FLAGS.CAMERA_METADATA_MISSING,
  ]);
});

test("guided camera captures are not flagged when canvas output has no camera metadata", () => {
  assert.deepEqual(
    getVerificationMetadataFlags({}, { cameraCaptured: true }),
    [],
  );
});

test("guided camera captures still flag known editing software", () => {
  assert.deepEqual(
    getVerificationMetadataFlags(
      { XMP: { CreatorTool: "Adobe Photoshop 25" } },
      { cameraCaptured: true },
    ),
    [SECURITY_FLAGS.AI_OR_EDITED_METADATA_DETECTED],
  );
});

test("camera metadata without editing signatures produces no flags", () => {
  assert.deepEqual(getVerificationMetadataFlags({ Make: "Canon", Model: "EOS 80D" }), []);
});
