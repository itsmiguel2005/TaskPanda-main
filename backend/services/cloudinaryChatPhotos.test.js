const test = require("node:test");
const assert = require("node:assert/strict");
const cloudinary = require("cloudinary").v2;
const {
  CHAT_PHOTO_MAX_BYTES,
  fetchAuthenticatedChatPhoto,
  uploadChatPhoto,
  verifyChatPhotoUploads,
} = require("./cloudinaryMedia");

const originalResource = cloudinary.api.resource;
const originalUploadStream = cloudinary.uploader.upload_stream;
const originalCloudinaryUrl = cloudinary.url;
const originalFetch = global.fetch;
const originalEnvironment = {
  cloudName: process.env.CLOUDINARY_CLOUD_NAME,
  apiKey: process.env.CLOUDINARY_API_KEY,
  apiSecret: process.env.CLOUDINARY_API_SECRET,
};
const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0x00]);

function configureTestCloudinary() {
  process.env.CLOUDINARY_CLOUD_NAME = "taskpanda-test";
  process.env.CLOUDINARY_API_KEY = "test-key";
  process.env.CLOUDINARY_API_SECRET = "test-secret";
}

test.afterEach(() => {
  cloudinary.api.resource = originalResource;
  cloudinary.uploader.upload_stream = originalUploadStream;
  cloudinary.url = originalCloudinaryUrl;
  global.fetch = originalFetch;
  if (originalEnvironment.cloudName === undefined) delete process.env.CLOUDINARY_CLOUD_NAME;
  else process.env.CLOUDINARY_CLOUD_NAME = originalEnvironment.cloudName;
  if (originalEnvironment.apiKey === undefined) delete process.env.CLOUDINARY_API_KEY;
  else process.env.CLOUDINARY_API_KEY = originalEnvironment.apiKey;
  if (originalEnvironment.apiSecret === undefined) delete process.env.CLOUDINARY_API_SECRET;
  else process.env.CLOUDINARY_API_SECRET = originalEnvironment.apiSecret;
});

test("chat photo uploads reject data that does not match an allowed image signature and MIME type", async () => {
  let uploadStarted = false;
  cloudinary.uploader.upload_stream = () => {
    uploadStarted = true;
    throw new Error("Upload should not start for invalid image data.");
  };

  await assert.rejects(
    uploadChatPhoto(Buffer.from("not an image"), "conversation", "user", "image/jpeg"),
    { statusCode: 400, message: "Only valid JPEG, PNG, WebP, or GIF photos are allowed." }
  );
  await assert.rejects(
    uploadChatPhoto(jpegBuffer, "conversation", "user", "image/png"),
    { statusCode: 400, message: "Only valid JPEG, PNG, WebP, or GIF photos are allowed." }
  );
  await assert.rejects(
    uploadChatPhoto(Buffer.alloc(CHAT_PHOTO_MAX_BYTES + 1), "conversation", "user", "image/jpeg"),
    { statusCode: 400, message: "Chat photos must be 4 MB or smaller." }
  );
  assert.equal(uploadStarted, false);
});

test("chat photo delivery signs the Cloudinary URL with its saved version and verifies returned bytes", async () => {
  configureTestCloudinary();
  let deliveryOptions;
  cloudinary.url = (_publicId, options) => {
    deliveryOptions = options;
    return "https://cloudinary.test/private-photo";
  };
  global.fetch = async () => ({
    ok: true,
    headers: { get: () => "image/jpeg" },
    arrayBuffer: async () => Uint8Array.from(jpegBuffer).buffer,
  });

  const image = await fetchAuthenticatedChatPhoto("taskpanda-chat-photo", "jpg", 123456);

  assert.equal(deliveryOptions.type, "authenticated");
  assert.equal(deliveryOptions.version, 123456);
  assert.equal(deliveryOptions.sign_url, true);
  assert.deepEqual(image.body, jpegBuffer);
  assert.equal(image.contentType, "image/jpeg");
});

test("chat photo delivery resolves the Cloudinary version for older stored photos", async () => {
  configureTestCloudinary();
  let deliveryOptions;
  cloudinary.api.resource = async () => ({ format: "jpeg", bytes: jpegBuffer.length, version: 654321 });
  cloudinary.url = (_publicId, options) => {
    deliveryOptions = options;
    return "https://cloudinary.test/private-photo";
  };
  global.fetch = async () => ({
    ok: true,
    headers: { get: () => "image/jpeg" },
    arrayBuffer: async () => Uint8Array.from(jpegBuffer).buffer,
  });

  await fetchAuthenticatedChatPhoto("taskpanda-chat-photo", undefined, undefined);

  assert.equal(deliveryOptions.version, 654321);
  assert.equal(deliveryOptions.format, "jpeg");
});

test("verified chat photos persist the Cloudinary version for later delivery", async () => {
  configureTestCloudinary();
  const conversationId = "64b000000000000000000001";
  const userId = "64b000000000000000000002";
  const publicId = `taskpanda_chat_${conversationId}_${userId}_${"a".repeat(32)}`;
  cloudinary.api.resource = async () => ({ format: "jpg", bytes: jpegBuffer.length, version: 123456 });

  assert.deepEqual(await verifyChatPhotoUploads([{ publicId }], conversationId, userId), [
    { publicId, format: "jpg", bytes: jpegBuffer.length, version: 123456 },
  ]);
});
