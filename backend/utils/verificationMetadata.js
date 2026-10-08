const exifr = require("exifr");

const SECURITY_FLAGS = Object.freeze({
  AI_OR_EDITED_METADATA_DETECTED: "AI_OR_EDITED_METADATA_DETECTED",
  CAMERA_METADATA_MISSING: "CAMERA_METADATA_MISSING",
  METADATA_INSPECTION_FAILED: "METADATA_INSPECTION_FAILED",
});

const EDITING_SOFTWARE_SIGNATURES = /\bphotoshop\b|\billustrator\b|\bcanva\b|\bmidjourney\b|\bstable diffusion\b|\bdall[\s.-]?e\b/i;

function collectMetadataText(value, result = []) {
  if (typeof value === "string") {
    result.push(value);
  } else if (Array.isArray(value)) {
    value.forEach((item) => collectMetadataText(item, result));
  } else if (value && typeof value === "object") {
    Object.values(value).forEach((item) => collectMetadataText(item, result));
  }
  return result;
}

function getVerificationMetadataFlags(metadata, { cameraCaptured = false } = {}) {
  const flags = [];
  const metadataText = collectMetadataText(metadata).join(" ");

  if (EDITING_SOFTWARE_SIGNATURES.test(metadataText)) {
    flags.push(SECURITY_FLAGS.AI_OR_EDITED_METADATA_DETECTED);
  }

  if (!cameraCaptured && !metadata?.Make && !metadata?.Model) {
    flags.push(SECURITY_FLAGS.CAMERA_METADATA_MISSING);
  }

  return flags;
}

async function inspectVerificationMetadata(imageBuffer, options) {
  try {
    const metadata = await exifr.parse(imageBuffer);
    return { flags: getVerificationMetadataFlags(metadata, options) };
  } catch (error) {
    return {
      flags: [SECURITY_FLAGS.METADATA_INSPECTION_FAILED],
      error,
    };
  }
}

module.exports = {
  SECURITY_FLAGS,
  getVerificationMetadataFlags,
  inspectVerificationMetadata,
};
