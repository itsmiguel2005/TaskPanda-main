const test = require("node:test");
const assert = require("node:assert/strict");
const cloudinary = require("cloudinary").v2;
const {
  CHAT_PHOTO_MAX_BYTES,
  fetchAuthenticatedChatPhoto,
  uploadChatPhoto,
} = require("./cloudinaryMedia");

const originalResource = cloudinary.api.resource;
const originalUploadStream = cloudinary.uploader.upload_stream;
const originalPrivateDownloadUrl = cloudinary.utils.private_download_url;
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
  cloudinary.utils.private_download_url = originalPrivateDownloadUrl;
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

test("chat photo delivery uses Cloudinary's authenticated private-download URL and verifies returned bytes", async () => {
  configureTestCloudinary();
  let requestedResource;
  cloudinary.utils.private_download_url = (publicId, format, options) => {
    requestedResource = { publicId, format, options };
    return "https://cloudinary.test/private-photo";
  };
  global.fetch = async () => ({
    ok: true,
    headers: { get: () => "image/jpeg" },
    arrayBuffer: async () => Uint8Array.from(jpegBuffer).buffer,
  });

  const image = await fetchAuthenticatedChatPhoto("taskpanda-chat-photo", "jpg");

  assert.deepEqual(requestedResource, {
    publicId: "taskpanda-chat-photo",
    format: "jpg",
    options: { resource_type: "image", type: "authenticated" },
  });
  assert.deepEqual(image.body, jpegBuffer);
  assert.equal(image.contentType, "image/jpeg");
});

test("chat photo delivery rejects a Cloudinary response that is not the stored image format", async () => {
  configureTestCloudinary();
  cloudinary.utils.private_download_url = () => "https://cloudinary.test/private-photo";
  global.fetch = async () => ({
    ok: true,
    headers: { get: () => "image/png" },
    arrayBuffer: async () => Uint8Array.from(Buffer.from("not an image")).buffer,
  });

  await assert.rejects(
    fetchAuthenticatedChatPhoto("taskpanda-chat-photo", "jpg"),
    { statusCode: 502, message: "Cloudinary returned an invalid chat photo." }
  );
});

test("chat photo delivery initializes Cloudinary credentials in a separate serverless instance", async () => {
  delete process.env.CLOUDINARY_CLOUD_NAME;
  delete process.env.CLOUDINARY_API_KEY;
  delete process.env.CLOUDINARY_API_SECRET;

  await assert.rejects(
    fetchAuthenticatedChatPhoto("taskpanda-chat-photo", "jpg"),
    { statusCode: 503, message: "Image uploads are not configured. Set the Cloudinary environment variables." }
  );
});
