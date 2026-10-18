const test = require("node:test");
const assert = require("node:assert/strict");
const { createDecipheriv } = require("crypto");
const {
  encryptIdentifier,
  maskIdentifier,
  normalizeIdentifier,
} = require("./identityCrypto");

test("identity numbers are AES-256-GCM encrypted and keyed-hashed with separate keys", () => {
  const keys = {
    encryptionKey: Buffer.alloc(32, 7),
    hmacKey: Buffer.alloc(32, 9),
  };
  const first = encryptIdentifier("1234-5678-9012", "PSN", keys);
  const second = encryptIdentifier("1234 5678 9012", "PSN", keys);
  assert.equal(first.hash, second.hash);
  assert.equal(first.ciphertext === second.ciphertext, false);
  assert.equal(first.lastFour, "9012");
  assert.equal(first.ciphertext.includes("123456789012"), false);

  const decipher = createDecipheriv(
    "aes-256-gcm",
    keys.encryptionKey,
    Buffer.from(first.iv, "base64"),
  );
  decipher.setAAD(Buffer.from("TaskPanda:verification:identifier:v1"));
  decipher.setAuthTag(Buffer.from(first.tag, "base64"));
  const value = Buffer.concat([
    decipher.update(Buffer.from(first.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
  assert.equal(value, "123456789012");
});

test("identifier helpers keep only the final four digits in a display mask", () => {
  assert.equal(normalizeIdentifier("1234-5678-9012"), "123456789012");
  assert.equal(maskIdentifier("PSN", "9012"), "XXXX-XXXX-9012");
  assert.equal(maskIdentifier("PCN", "3456"), "XXXX-XXXX-XXXX-3456");
});

test("identity encryption rejects a reused encryption and HMAC key", () => {
  const key = Buffer.alloc(32, 7);
  assert.throws(
    () => encryptIdentifier("1234-5678-9012", "PSN", {
      encryptionKey: key,
      hmacKey: Buffer.from(key),
    }),
    { message: "Identity encryption and HMAC keys must be different." },
  );
});
