const mongoose = require("mongoose");
const User = require("../models/User");
const { geocodeAddress } = require("../services/geocoder");
const { uploadProfileImage } = require("../services/cloudinaryMedia");
const { ensureReferralCode } = require("../services/rewards");

function profileFromUser(user) {
  return {
    id: user._id,
    role: user.role,
    fullName: user.fullName,
    firstName: user.firstName,
    middleName: user.middleName,
    lastName: user.lastName,
    username: user.username,
    email: user.email,
    mobileNumber: user.mobileNumber,
    address: user.address,
    geoLocation: user.geoLocation || null,
    province: user.province,
    city: user.city,
    barangay: user.barangay,
    professions: user.professions || [],
    bio: user.bio || "",
    profileImage: user.profileImage || "",
    averageRating: user.averageRating ?? 0,
    totalReviews: user.totalReviews ?? 0,
    createdAt: user.createdAt,
    referralCode: user.referralCode || "",
    stampProgress: Number(user.stampProgress || 0),
    completedBookings: Number(user.completedBookings || 0),
    vouchers: (user.vouchers || []).map((voucher) => ({
      id: String(voucher._id),
      kind: voucher.kind,
      title: voucher.title,
      origin: voucher.origin,
      amount: Number(voucher.amount || 0),
      status: voucher.status,
      awardedAt: voucher.awardedAt,
      expiresAt: voucher.expiresAt || null,
      redeemedAt: voucher.redeemedAt || null,
    })),
  };
}

async function handleUploadProfilePhoto(req, res) {
  if (!req.file?.buffer?.length) return res.status(400).json({ message: "Choose an image to upload." });
  try {
    const { secureUrl } = await uploadProfileImage(req.file.buffer, String(req.user._id));
    req.user.profileImage = secureUrl;
    await req.user.save();
    return res.status(201).json({ user: profileFromUser(req.user) });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    console.error("Upload profile photo error:", error.message);
    return res.status(502).json({ message: "Could not upload your photo. Check Cloudinary configuration and try again." });
  }
}

async function handleGetProfile(req, res) {
  try {
    const user = req.user;
    if (user.role === "client" && !user.referralCode) {
      await ensureReferralCode(user);
    }
    return res.json({ user: profileFromUser(user) });
  } catch (error) {
    console.error("Get profile error:", error);
    return res.status(500).json({ message: "Could not load your profile." });
  }
}

async function handleUpdateProfile(req, res) {
  try {
    const user = req.user;

    const fullName = String(req.body.fullName || "").trim();
    const username = String(req.body.username || "").trim();
    const mobileNumber = String(req.body.mobileNumber || "").trim();
    const province = String(req.body.province || user.province || "").trim();
    const city = String(req.body.city || user.city || "").trim();
    const barangay = String(req.body.barangay || user.barangay || "").trim();
    const address = [barangay, city, province].filter(Boolean).join(", ");
    const geoLocationInput = req.body.geoLocation;
    const bio = String(req.body.bio || "").trim();
    if (!fullName || fullName.length > 100) {
      return res.status(400).json({ message: "Enter a full name under 100 characters.", field: "fullName" });
    }
    if (!/^[A-Za-z0-9_.-]{3,30}$/.test(username) || /^\S+@\S+\.\S+$/.test(username)) {
      return res.status(400).json({ message: "Username must be 3-30 characters and cannot be an email.", field: "username" });
    }
    if (mobileNumber && !/^09\d{9}$/.test(mobileNumber)) {
      return res.status(400).json({ message: "Enter a valid 11-digit mobile number starting with 09.", field: "phone" });
    }
    if (address.length > 300) {
      return res.status(400).json({ message: "Location must be under 300 characters.", field: "location" });
    }
    const locationChanged = province !== user.province || city !== user.city || barangay !== user.barangay;
    let geoLocation = locationChanged && address
      ? await geocodeAddress(address, { barangay, city, province })
      : null;
    if (geoLocationInput != null) {
      if (geoLocationInput.type === "Point" && Array.isArray(geoLocationInput.coordinates) && geoLocationInput.coordinates.length === 2) {
        const [longitude, latitude] = geoLocationInput.coordinates.map(Number);
          if (!geoLocation && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180 && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90) {
          geoLocation = {
            type: "Point",
            coordinates: [Number(longitude.toFixed(6)), Number(latitude.toFixed(6))],
          };
        }
      } else if (!geoLocation) {
        return res.status(400).json({ message: "Choose a valid map location.", field: "geoLocation" });
      }
    }
    if (!geoLocation && !locationChanged) {
      return res.status(400).json({ message: "Set your location using the selectors or current location pin.", field: "location" });
    }
    if (bio.length > 500) {
      return res.status(400).json({ message: "Bio must be 500 characters or fewer.", field: "bio" });
    }

    const existingUsername = await User.findOne({ username, _id: mongoose.trusted({ $ne: user._id }) }).select("_id");
    if (existingUsername) {
      return res.status(409).json({ message: "This username is already taken.", field: "username" });
    }

    const nameParts = fullName.split(/\s+/);
    const professions = user.role === "provider"
      ? [...new Set((Array.isArray(req.body.professions) ? req.body.professions : [])
          .map((profession) => String(profession).trim())
          .filter(Boolean))].slice(0, 10)
      : user.professions;
    if (user.role === "provider" && !professions.length) {
      return res.status(400).json({ message: "Add at least one service you offer.", field: "professions" });
    }

    user.fullName = fullName;
    user.firstName = nameParts[0] || "";
    user.middleName = "";
    user.lastName = nameParts.slice(1).join(" ");
    user.username = username;
    user.mobileNumber = mobileNumber;
    user.address = address;
    if (geoLocation) user.geoLocation = geoLocation;
    else if (locationChanged) user.geoLocation = undefined;
    user.province = province;
    user.city = city;
    user.barangay = barangay;
    user.bio = bio;
    if (user.role === "provider") user.professions = professions;
    await user.save();

    return res.json({
      message: "Profile saved.",
      locationWarning: !geoLocation ? "Location saved, but it could not be mapped for distance matching. Set your current location pin to find nearby providers." : "",
      user: profileFromUser(user),
    });
  } catch (error) {
    if (error?.code === 11000 && error?.keyPattern?.username) {
      return res.status(409).json({ message: "This username is already taken.", field: "username" });
    }
    console.error("Update profile error:", error);
    return res.status(500).json({ message: "Could not save your profile." });
  }
}

module.exports = { handleGetProfile, handleUpdateProfile, handleUploadProfilePhoto };
