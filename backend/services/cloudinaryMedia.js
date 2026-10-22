const { randomUUID } = require("crypto");
const cloudinary = require("cloudinary").v2;

const CHAT_PHOTO_MAX_BYTES = 4 * 1024 * 1024;
const CHAT_PHOTO_FORMATS = ["jpg", "jpeg", "png", "webp", "gif"];
const CHAT_PHOTO_MIME_TYPES = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};
const BOOKING_PHOTO_MAX_BYTES = 4 * 1024 * 1024;
const BOOKING_PHOTO_FORMATS = ["jpg", "jpeg", "png", "webp", "gif"];
const PROFILE_PHOTO_MAX_BYTES = 4 * 1024 * 1024;
const VERIFICATION_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const VERIFICATION_IMAGE_FORMATS = ["jpg", "jpeg", "png", "webp"];

function getCredentials() {
  const cloudName = String(process.env.CLOUDINARY_CLOUD_NAME || "").trim();
  const apiKey = String(process.env.CLOUDINARY_API_KEY || "").trim();
  const apiSecret = String(process.env.CLOUDINARY_API_SECRET || "").trim();
  if (!cloudName || !apiKey || !apiSecret) {
    const error = new Error("Image uploads are not configured. Set the Cloudinary environment variables.");
    error.statusCode = 503;
    throw error;
  }
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
  return { cloudName, apiKey, apiSecret };
}

function getChatPhotoFormat(buffer) {
  if (!Buffer.isBuffer(buffer)) return "";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpg";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (buffer.length >= 6 && ["GIF87a", "GIF89a"].includes(buffer.toString("ascii", 0, 6))) return "gif";
  return "";
}

function normalizeChatPhotoFormat(format) {
  const normalized = String(format || "").toLowerCase();
  return normalized === "jpeg" ? "jpg" : normalized;
}

function assertChatPhotoBuffer(buffer, mimeType) {
  if (!Buffer.isBuffer(buffer) || buffer.length > CHAT_PHOTO_MAX_BYTES) {
    const error = new Error("Chat photos must be 4 MB or smaller.");
    error.statusCode = 400;
    throw error;
  }
  const format = getChatPhotoFormat(buffer);
  const expectedMimeType = CHAT_PHOTO_MIME_TYPES[format];
  if (!expectedMimeType || expectedMimeType !== mimeType) {
    const error = new Error("Only valid JPEG, PNG, WebP, or GIF photos are allowed.");
    error.statusCode = 400;
    throw error;
  }
  return format;
}

async function uploadProfileImage(buffer, userId) {
  getCredentials();
  const publicId = `taskpanda_profiles/${userId}`;
  const result = await new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream({
      allowed_formats: CHAT_PHOTO_FORMATS,
      overwrite: true,
      invalidate: true,
      public_id: publicId,
      resource_type: "image",
      type: "upload",
    }, (error, uploadedResource) => error ? reject(error) : resolve(uploadedResource)).end(buffer);
  });
  if (!CHAT_PHOTO_FORMATS.includes(String(result.format || "").toLowerCase()) || result.bytes > PROFILE_PHOTO_MAX_BYTES || !result.secure_url) {
    const error = new Error("Profile photos must be 4 MB or smaller and use JPEG, PNG, WebP, or GIF format.");
    error.statusCode = 400;
    throw error;
  }
  return { publicId, secureUrl: result.secure_url };
}

async function uploadBookingPhoto(buffer, userId) {
  if (!Buffer.isBuffer(buffer) || buffer.length > BOOKING_PHOTO_MAX_BYTES) {
    const error = new Error("Booking photos must be 4 MB or smaller.");
    error.statusCode = 400;
    throw error;
  }
  getCredentials();
  const publicId = `taskpanda_booking_${userId}_${randomUUID().replace(/-/g, "")}`;
  const result = await new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream({
      allowed_formats: BOOKING_PHOTO_FORMATS,
      overwrite: false,
      public_id: publicId,
      resource_type: "image",
      type: "upload",
    }, (error, uploadedResource) => error ? reject(error) : resolve(uploadedResource)).end(buffer);
  });
  if (!BOOKING_PHOTO_FORMATS.includes(String(result.format || "").toLowerCase()) ||
    result.bytes > BOOKING_PHOTO_MAX_BYTES || !result.public_id || !result.secure_url) {
    await deleteBookingPhoto(result.public_id || publicId);
    const error = new Error("Booking photos must be 4 MB or smaller and use JPEG, PNG, WebP, or GIF format.");
    error.statusCode = 400;
    throw error;
  }
  return { publicId: result.public_id };
}

function isOwnedBookingPhotoPublicId(publicId, userId) {
  const prefix = `taskpanda_booking_${userId}_`;
  return typeof publicId === "string"
    && publicId.startsWith(prefix)
    && /^[a-f\d]{32}$/i.test(publicId.slice(prefix.length));
}

async function verifyBookingPhotoUploads(publicIds, userId) {
  if (!Array.isArray(publicIds) || publicIds.length > 5 ||
    publicIds.some((publicId) => !isOwnedBookingPhotoPublicId(publicId, userId))) {
    const error = new Error("One or more booking photos are invalid. Upload them again.");
    error.statusCode = 400;
    throw error;
  }
  if (!publicIds.length) return [];

  getCredentials();
  try {
    return await Promise.all(publicIds.map(async (publicId) => {
      const resource = await cloudinary.api.resource(publicId, {
        resource_type: "image",
        type: "upload",
      });
      let imageUrl;
      try {
        imageUrl = new URL(resource.secure_url || "");
      } catch {
        const error = new Error("One or more booking photos could not be verified. Upload them again.");
        error.statusCode = 400;
        throw error;
      }
      const cloudName = String(process.env.CLOUDINARY_CLOUD_NAME || "").trim();
      if (resource.public_id !== publicId ||
        !BOOKING_PHOTO_FORMATS.includes(String(resource.format || "").toLowerCase()) ||
        resource.bytes > BOOKING_PHOTO_MAX_BYTES ||
        imageUrl.protocol !== "https:" ||
        imageUrl.hostname !== "res.cloudinary.com" ||
        !imageUrl.pathname.startsWith(`/${cloudName}/image/upload/`)) {
        const error = new Error("One or more booking photos could not be verified. Upload them again.");
        error.statusCode = 400;
        throw error;
      }
      return imageUrl.href;
    }));
  } catch (error) {
    if (error.statusCode) throw error;
    if (error.http_code === 404 || error.error?.http_code === 404) {
      const invalidPhotoError = new Error("One or more booking photos could not be verified. Upload them again.");
      invalidPhotoError.statusCode = 400;
      throw invalidPhotoError;
    }
    throw error;
  }
}

async function deleteBookingPhoto(publicId) {
  if (!publicId) return null;
  getCredentials();
  return cloudinary.uploader.destroy(publicId, {
    resource_type: "image",
    type: "upload",
    invalidate: true,
  });
}

async function uploadVerificationImage(buffer, userId, side) {
  getCredentials();
  if (!Buffer.isBuffer(buffer) || buffer.length > VERIFICATION_IMAGE_MAX_BYTES) {
    const error = new Error("Identity images must be 8 MB or smaller.");
    error.statusCode = 400;
    throw error;
  }
  const publicId = `taskpanda_verifications/${userId}/${side}_${randomUUID().replace(/-/g, "")}`;
  const result = await new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream({
      allowed_formats: VERIFICATION_IMAGE_FORMATS,
      overwrite: false,
      public_id: publicId,
      resource_type: "image",
      type: "authenticated",
    }, (error, uploadedResource) => error ? reject(error) : resolve(uploadedResource)).end(buffer);
  });
  if (!VERIFICATION_IMAGE_FORMATS.includes(String(result.format || "").toLowerCase()) ||
    result.bytes > VERIFICATION_IMAGE_MAX_BYTES || !result.public_id) {
    await deleteVerificationImage(result.public_id || publicId);
    const error = new Error("Identity images must be 8 MB or smaller and use JPEG, PNG, or WebP format.");
    error.statusCode = 400;
    throw error;
  }
  return { publicId: result.public_id, format: String(result.format).toLowerCase(), bytes: result.bytes };
}

async function fetchAuthenticatedVerificationImage(publicId, format) {
  getCredentials();
  if (!publicId || !VERIFICATION_IMAGE_FORMATS.includes(String(format || "").toLowerCase())) {
    const error = new Error("Verification image is not available.");
    error.statusCode = 404;
    throw error;
  }
  const deliveryUrl = cloudinary.url(publicId, {
    resource_type: "image",
    type: "authenticated",
    sign_url: true,
    secure: true,
    format,
  });
  const response = await fetch(deliveryUrl);
  if (!response.ok) {
    const error = new Error("Could not retrieve this verification image from Cloudinary.");
    error.statusCode = 502;
    throw error;
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("image/")) {
    const error = new Error("Cloudinary returned an invalid verification image.");
    error.statusCode = 502;
    throw error;
  }
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length > VERIFICATION_IMAGE_MAX_BYTES) {
    const error = new Error("Verification image exceeds the permitted file size.");
    error.statusCode = 502;
    throw error;
  }
  return { body, contentType };
}

async function deleteVerificationImage(publicId) {
  if (!publicId) return null;
  getCredentials();
  return cloudinary.uploader.destroy(publicId, {
    resource_type: "image",
    type: "authenticated",
    invalidate: true,
  });
}

async function uploadChatPhoto(buffer, conversationId, userId, mimeType) {
  const format = assertChatPhotoBuffer(buffer, mimeType);
  getCredentials();
  const publicId = `taskpanda_chat_${conversationId}_${userId}_${randomUUID().replace(/-/g, "")}`;
  const result = await new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream({
      allowed_formats: CHAT_PHOTO_FORMATS,
      overwrite: false,
      public_id: publicId,
      resource_type: "image",
      type: "authenticated",
    }, (error, uploadedResource) => error ? reject(error) : resolve(uploadedResource)).end(buffer);
  });
  if (normalizeChatPhotoFormat(result.format) !== format || result.bytes > CHAT_PHOTO_MAX_BYTES) {
    await deleteChatPhoto(publicId);
    const error = new Error("Only valid JPEG, PNG, WebP, or GIF photos up to 4 MB are allowed.");
    error.statusCode = 400;
    throw error;
  }
  return { publicId, format: result.format, bytes: result.bytes, version: result.version };
}

function isOwnedChatPhotoPublicId(publicId, conversationId, userId) {
  const prefix = `taskpanda_chat_${conversationId}_${userId}_`;
  return typeof publicId === "string"
    && publicId.startsWith(prefix)
    && /^[a-f\d]{32}$/i.test(publicId.slice(prefix.length));
}

async function getChatPhotoResource(publicId) {
  const resource = await cloudinary.api.resource(publicId, {
    resource_type: "image",
    type: "authenticated",
  });
  if (!CHAT_PHOTO_FORMATS.includes(String(resource.format || "").toLowerCase()) || resource.bytes > CHAT_PHOTO_MAX_BYTES) {
    const error = new Error("One of the selected photos is too large or uses an unsupported format.");
    error.statusCode = 400;
    throw error;
  }
  return resource;
}

async function verifyChatPhotoUploads(publicIds, conversationId, userId) {
  if (!Array.isArray(publicIds) || publicIds.length > 5 || publicIds.some((photo) => !isOwnedChatPhotoPublicId(photo?.publicId, conversationId, userId))) {
    const error = new Error("One or more photos are invalid for this conversation.");
    error.statusCode = 400;
    throw error;
  }

  try {
    return await Promise.all(publicIds.map(async ({ publicId }) => {
      const resource = await getChatPhotoResource(publicId);
      return { publicId, format: resource.format, bytes: resource.bytes, version: resource.version };
    }));
  } catch (error) {
    if (error.http_code === 404 || error.error?.http_code === 404) {
      const invalidPhotoError = new Error("One or more photos could not be verified. Please upload them again.");
      invalidPhotoError.statusCode = 400;
      throw invalidPhotoError;
    }
    throw error;
  }
}

async function fetchAuthenticatedChatPhoto(publicId, format, version) {
  if (!Number.isSafeInteger(Number(version)) || Number(version) <= 0) {
    const resource = await getChatPhotoResource(publicId);
    format = resource.format;
    version = resource.version;
  }
  if (!CHAT_PHOTO_FORMATS.includes(String(format || "").toLowerCase())) {
    const error = new Error("Chat photo format is invalid.");
    error.statusCode = 404;
    throw error;
  }
  if (!Number.isSafeInteger(Number(version)) || Number(version) <= 0) {
    const error = new Error("Chat photo version is invalid.");
    error.statusCode = 404;
    throw error;
  }
  const deliveryUrl = cloudinary.url(publicId, {
    resource_type: "image",
    type: "authenticated",
    sign_url: true,
    secure: true,
    format,
    version: Number(version),
  });
  const response = await fetch(deliveryUrl);
  if (!response.ok) {
    const error = new Error("Could not retrieve this chat photo from Cloudinary.");
    error.statusCode = 502;
    throw error;
  }
  const body = Buffer.from(await response.arrayBuffer());
  const actualFormat = getChatPhotoFormat(body);
  if (body.length > CHAT_PHOTO_MAX_BYTES || actualFormat !== normalizeChatPhotoFormat(format)) {
    const error = new Error("Cloudinary returned an invalid chat photo.");
    error.statusCode = 502;
    throw error;
  }
  return { body, contentType: CHAT_PHOTO_MIME_TYPES[actualFormat] };
}

async function deleteChatPhoto(publicId) {
  getCredentials();
  return cloudinary.uploader.destroy(publicId, {
    resource_type: "image",
    type: "authenticated",
    invalidate: true,
  });
}

module.exports = {
  BOOKING_PHOTO_MAX_BYTES,
  CHAT_PHOTO_MAX_BYTES,
  deleteBookingPhoto,
  deleteChatPhoto,
  deleteVerificationImage,
  fetchAuthenticatedVerificationImage,
  fetchAuthenticatedChatPhoto,
  getChatPhotoFormat,
  isOwnedChatPhotoPublicId,
  isOwnedBookingPhotoPublicId,
  uploadBookingPhoto,
  uploadProfileImage,
  uploadVerificationImage,
  uploadChatPhoto,
  assertChatPhotoBuffer,
  verifyBookingPhotoUploads,
  verifyChatPhotoUploads,
};