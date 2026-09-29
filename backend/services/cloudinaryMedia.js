const { randomUUID } = require("crypto");
const cloudinary = require("cloudinary").v2;

const CHAT_PHOTO_MAX_BYTES = 4 * 1024 * 1024;
const CHAT_PHOTO_FORMATS = ["jpg", "jpeg", "png", "webp", "gif"];

function getCredentials() {
  const cloudName = String(process.env.CLOUDINARY_CLOUD_NAME || "").trim();
  const apiKey = String(process.env.CLOUDINARY_API_KEY || "").trim();
  const apiSecret = String(process.env.CLOUDINARY_API_SECRET || "").trim();
  if (!cloudName || !apiKey || !apiSecret) {
    const error = new Error("Chat photo uploads are not configured. Set the Cloudinary environment variables.");
    error.statusCode = 503;
    throw error;
  }
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
  return { cloudName, apiKey, apiSecret };
}

async function uploadChatPhoto(buffer, conversationId, userId) {
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
  if (!CHAT_PHOTO_FORMATS.includes(String(result.format || "").toLowerCase()) || result.bytes > CHAT_PHOTO_MAX_BYTES) {
    await deleteChatPhoto(publicId);
    const error = new Error("The photo must be 4 MB or smaller and use JPEG, PNG, WebP, or GIF format.");
    error.statusCode = 400;
    throw error;
  }
  return { publicId, format: result.format, bytes: result.bytes };
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
      return { publicId, format: resource.format, bytes: resource.bytes };
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

async function fetchAuthenticatedChatPhoto(publicId, format) {
  if (!CHAT_PHOTO_FORMATS.includes(String(format || "").toLowerCase())) {
    const error = new Error("Chat photo format is invalid.");
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
    const error = new Error("Could not retrieve this chat photo from Cloudinary.");
    error.statusCode = 502;
    throw error;
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("image/")) {
    const error = new Error("Cloudinary returned an invalid chat photo.");
    error.statusCode = 502;
    throw error;
  }
  return { body: Buffer.from(await response.arrayBuffer()), contentType };
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
  CHAT_PHOTO_MAX_BYTES,
  deleteChatPhoto,
  fetchAuthenticatedChatPhoto,
  isOwnedChatPhotoPublicId,
  uploadChatPhoto,
  verifyChatPhotoUploads,
};