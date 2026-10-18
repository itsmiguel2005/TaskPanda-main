const { createCipheriv, createHmac, randomBytes } = require("crypto");

const ENCRYPTION_VERSION = "v1";
const ASSOCIATED_DATA = Buffer.from("TaskPanda:verification:identifier:v1");

function readKey(name, value) {
  const encoded = String(value || "").trim();
  if (!/^[a-f\d]{64}$/i.test(encoded)) {
    const error = new Error(`${name} must be configured as 64 hexadecimal characters.`);
    error.statusCode = 503;
    throw error;
  }
  return Buffer.from(encoded, "hex");
}

function validateKeys(keys) {
  if (
    !Buffer.isBuffer(keys?.encryptionKey) || keys.encryptionKey.length !== 32 ||
    !Buffer.isBuffer(keys?.hmacKey) || keys.hmacKey.length !== 32
  ) {
    const error = new Error("Identity encryption and HMAC keys must each be 32 bytes.");
    error.statusCode = 503;
    throw error;
  }
  if (keys.encryptionKey.equals(keys.hmacKey)) {
    const error = new Error("Identity encryption and HMAC keys must be different.");
    error.statusCode = 503;
    throw error;
  }
  return keys;
}

function getIdentityKeys() {
  const config = require("../config/env");
  return validateKeys({
    encryptionKey: readKey("IDENTITY_PSN_ENCRYPTION_KEY", config.identityPsnEncryptionKey),
    hmacKey: readKey("IDENTITY_PSN_HMAC_KEY", config.identityPsnHmacKey),
  });
}

function normalizeIdentifier(value) {
  return String(value || "").replace(/\D/g, "");
}

function encryptIdentifier(value, identifierType, keys = getIdentityKeys()) {
  validateKeys(keys);
  const normalizedValue = normalizeIdentifier(value);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keys.encryptionKey, iv);
  cipher.setAAD(ASSOCIATED_DATA);
  const ciphertext = Buffer.concat([
    cipher.update(normalizedValue, "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    keyVersion: ENCRYPTION_VERSION,
    hash: createHmac("sha256", keys.hmacKey)
      .update(`${identifierType}:${normalizedValue}`)
      .digest("hex"),
    lastFour: normalizedValue.slice(-4),
  };
}

function maskIdentifier(identifierType, lastFour) {
  const groups = identifierType === "PCN" ? 4 : 3;
  return `${Array.from({ length: groups - 1 }, () => "XXXX").join("-")}-${String(lastFour || "").padStart(4, "X")}`;
}

module.exports = {
  encryptIdentifier,
  getIdentityKeys,
  maskIdentifier,
  normalizeIdentifier,
};
