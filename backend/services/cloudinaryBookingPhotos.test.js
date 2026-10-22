const test = require("node:test");
const assert = require("node:assert/strict");
const cloudinary = require("cloudinary").v2;
const {
  BOOKING_PHOTO_MAX_BYTES,
  isOwnedBookingPhotoPublicId,
  uploadBookingPhoto,
  verifyBookingPhotoUploads,
} = require("./cloudinaryMedia");

const originalResource = cloudinary.api.resource;
const originalUploadStream = cloudinary.uploader.upload_stream;
const originalEnvironment = {
  cloudName: process.env.CLOUDINARY_CLOUD_NAME,
  apiKey: process.env.CLOUDINARY_API_KEY,
  apiSecret: process.env.CLOUDINARY_API_SECRET,
};

function configureTestCloudinary() {
  process.env.CLOUDINARY_CLOUD_NAME = "taskpanda-test";
  process.env.CLOUDINARY_API_KEY = "test-key";
  process.env.CLOUDINARY_API_SECRET = "test-secret";
}

test.afterEach(() => {
  cloudinary.api.resource = originalResource;
  cloudinary.uploader.upload_stream = originalUploadStream;
  if (originalEnvironment.cloudName === undefined) delete process.env.CLOUDINARY_CLOUD_NAME;
  else process.env.CLOUDINARY_CLOUD_NAME = originalEnvironment.cloudName;
  if (originalEnvironment.apiKey === undefined) delete process.env.CLOUDINARY_API_KEY;
  else process.env.CLOUDINARY_API_KEY = originalEnvironment.apiKey;
  if (originalEnvironment.apiSecret === undefined) delete process.env.CLOUDINARY_API_SECRET;
  else process.env.CLOUDINARY_API_SECRET = originalEnvironment.apiSecret;
});

test("booking photo uploads use Cloudinary and are namespaced to their uploader", async () => {
  configureTestCloudinary();
  let uploadOptions;
  cloudinary.uploader.upload_stream = (options, callback) => {
    uploadOptions = options;
    return {
      end() {
        callback(null, {
          public_id: options.public_id,
          secure_url: `https://res.cloudinary.com/taskpanda-test/image/upload/${options.public_id}.jpg`,
          format: "jpg",
          bytes: 1024,
        });
      },
    };
  };

  const userId = "64b000000000000000000001";
  const uploaded = await uploadBookingPhoto(Buffer.from("photo"), userId);
  assert.match(uploaded.publicId, /^taskpanda_booking_64b000000000000000000001_[a-f\d]{32}$/i);
  assert.equal(uploadOptions.resource_type, "image");
  assert.equal(uploadOptions.type, "upload");
  assert.equal(uploadOptions.overwrite, false);
  assert.equal(isOwnedBookingPhotoPublicId(uploaded.publicId, userId), true);
  assert.equal(isOwnedBookingPhotoPublicId(uploaded.publicId, "64b000000000000000000002"), false);
});

test("booking photo uploads reject oversized buffers", async () => {
  await assert.rejects(
    uploadBookingPhoto(Buffer.alloc(BOOKING_PHOTO_MAX_BYTES + 1), "64b000000000000000000001"),
    { statusCode: 400, message: "Booking photos must be 4 MB or smaller." }
  );
});

test("booking photo verification returns only Cloudinary URLs owned by the uploader", async () => {
  configureTestCloudinary();
  const userId = "64b000000000000000000001";
  const publicId = `taskpanda_booking_${userId}_${"a".repeat(32)}`;
  cloudinary.api.resource = async (requestedPublicId) => ({
    public_id: requestedPublicId,
    secure_url: `https://res.cloudinary.com/taskpanda-test/image/upload/v123/${requestedPublicId}.jpg`,
    format: "jpg",
    bytes: 1024,
  });

  assert.deepEqual(await verifyBookingPhotoUploads([publicId], userId), [
    `https://res.cloudinary.com/taskpanda-test/image/upload/v123/${publicId}.jpg`,
  ]);
  await assert.rejects(
    verifyBookingPhotoUploads([publicId], "64b000000000000000000002"),
    { statusCode: 400 }
  );
  await assert.rejects(
    verifyBookingPhotoUploads([publicId, publicId, publicId, publicId, publicId, publicId], userId),
    { statusCode: 400 }
  );
});

test("booking photo verification rejects URLs outside the configured Cloudinary account", async () => {
  configureTestCloudinary();
  const userId = "64b000000000000000000001";
  const publicId = `taskpanda_booking_${userId}_${"b".repeat(32)}`;
  cloudinary.api.resource = async (requestedPublicId) => ({
    public_id: requestedPublicId,
    secure_url: "https://example.invalid/image.jpg",
    format: "jpg",
    bytes: 1024,
  });

  await assert.rejects(
    verifyBookingPhotoUploads([publicId], userId),
    { statusCode: 400 }
  );
});
