const mongoose = require("mongoose");
const User = require("../models/User");
const { geocodeAddress } = require("../services/geocoder");
const { uploadProfileImage } = require("../services/cloudinaryMedia");
const { ensureReferralCode } = require("../services/rewards");

function profileFromUser(user) {
  return {
    id: user._id,
    role: user.role,
    hasCompletedOnboarding: user.hasCompletedOnboarding === true,
    hasCompletedProviderOnboarding: user.hasCompletedProviderOnboarding === true,
    isVerified: user.isVerified === true,
    verificationStatus: user.verificationStatus || "unverified",
    verificationDetailsStatus: user.verificationDetails?.status || null,
    verificationRejectionReason: user.verificationDetails?.rejectionReason || "",
    tesdaCertificates: (user.tesdaCertificates || []).map((certificate) => ({
      id: String(certificate._id),
      trade: certificate.trade || "",
      status: String(certificate.status || "pending").toLowerCase(),
      submittedAt: certificate.submittedAt || null,
      reviewedAt: certificate.reviewedAt || null,
      rejectionReason: certificate.rejectionReason || "",
    })),
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
    const coordinates = user.geoLocation?.coordinates;
    if (
      user.role === "client" &&
      (!Array.isArray(coordinates) || coordinates.length !== 2) &&
      user.barangay &&
      user.city &&
      user.province
    ) {
      const registeredLocation = await geocodeAddress(user.address || "", {
        barangay: user.barangay,
        city: user.city,
        province: user.province,
      });
      if (registeredLocation) {
        user.geoLocation = registeredLocation;
        await user.save();
      }
    }
    if (user.role === "client" && !user.referralCode) {
      await ensureReferralCode(user);
    }
    return res.json({ user: profileFromUser(user) });
  } catch (error) {
    console.error("Get profile error:", error);
    return res.status(500).json({ message: "Could not load your profile." });
  }
}

async function handleCompleteOnboarding(req, res) {
  try {
    if (req.user.role === "provider") {
      req.user.hasCompletedProviderOnboarding = true;
    } else {
      req.user.hasCompletedOnboarding = true;
    }
    await req.user.save();
    return res.json(req.user.role === "provider"
      ? { hasCompletedProviderOnboarding: true }
      : { hasCompletedOnboarding: true });
  } catch (error) {
    console.error("Complete onboarding error:", error);
    return res.status(500).json({ message: "Could not save your onboarding progress. Please try again." });
  }
}

function handleGetVerificationStatus(req, res) {
  const user = req.user;
  return res.json({
    isVerified: user.isVerified === true,
    verificationStatus: user.verificationStatus || "unverified",
    verificationDetailsStatus: user.verificationDetails?.status || null,
    verificationRejectionReason: user.verificationDetails?.rejectionReason || "",
  });
}

async function handleUpdateProfile(req, res) {
  try {
    const user = req.user;

    const requestFirstName = String(req.body.firstName || "").trim();
    const requestMiddleName = String(req.body.middleName || "").trim();
    const requestLastName = String(req.body.lastName || "").trim();
    const fullNameFromBody = String(req.body.fullName || "").trim();
    const username = String(req.body.username || "").trim();
    const mobileNumber = String(req.body.mobileNumber || "").trim();
    const province = String(req.body.province || user.province || "").trim();
    const city = String(req.body.city || user.city || "").trim();
    const barangay = String(req.body.barangay || user.barangay || "").trim();
    const address = String(req.body.address || [barangay, city, province].filter(Boolean).join(", ")).trim();
    const geoLocationInput = req.body.geoLocation;
    const bio = String(req.body.bio || "").trim();
    const hasStructuredName = ["firstName", "middleName", "lastName"].some((field) =>
      Object.prototype.hasOwnProperty.call(req.body, field)
    );
    const legacyNameParts = fullNameFromBody.split(/\s+/).filter(Boolean);
    const firstName = hasStructuredName ? requestFirstName : legacyNameParts[0] || user.firstName || "";
    const middleName = hasStructuredName ? requestMiddleName : "";
    const lastName = hasStructuredName
      ? requestLastName
      : legacyNameParts.length > 1
        ? legacyNameParts.slice(1).join(" ")
        : user.lastName || "";
    const fullName = [firstName, middleName, lastName].filter(Boolean).join(" ").trim();
    if (!firstName || !lastName || fullName.length > 100) {
      return res.status(400).json({ message: firstName && lastName ? "Enter a full name under 100 characters." : "First name and last name are required.", field: firstName && lastName ? "fullName" : (firstName ? "lastName" : "firstName") });
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
    const locationChanged = province !== user.province
      || city !== user.city
      || barangay !== user.barangay
      || address !== user.address;
    let geoLocation = null;
    if (geoLocationInput != null) {
      if (geoLocationInput.type !== "Point" || !Array.isArray(geoLocationInput.coordinates) || geoLocationInput.coordinates.length !== 2) {
        return res.status(400).json({ message: "Choose a valid map location.", field: "location" });
      }
      const [longitude, latitude] = geoLocationInput.coordinates.map(Number);
      if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180 || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
        return res.status(400).json({ message: "Choose a valid map location.", field: "location" });
      }
      geoLocation = {
        type: "Point",
        coordinates: [Number(longitude.toFixed(6)), Number(latitude.toFixed(6))],
      };
    } else if (locationChanged && address) {
      geoLocation = await geocodeAddress(address, { barangay, city, province });
    } else {
      geoLocation = user.geoLocation || null;
    }
    if (!geoLocation) {
      return res.status(400).json({ message: "Pin your exact location on the map before saving.", field: "location" });
    }
    if (bio.length > 500) {
      return res.status(400).json({ message: "Bio must be 500 characters or fewer.", field: "bio" });
    }

    const existingUsername = await User.findOne({ username, _id: mongoose.trusted({ $ne: user._id }) }).select("_id");
    if (existingUsername) {
      return res.status(409).json({ message: "This username is already taken.", field: "username" });
    }

    const professions = user.role === "provider"
      ? [...new Set((Array.isArray(req.body.professions) ? req.body.professions : [])
          .map((profession) => String(profession).trim())
          .filter(Boolean))].slice(0, 10)
      : user.professions;
    if (user.role === "provider" && !professions.length) {
      return res.status(400).json({ message: "Add at least one service you offer.", field: "professions" });
    }

    user.fullName = fullName;
    user.firstName = firstName;
    user.middleName = middleName;
    user.lastName = lastName;
    user.username = username;
    user.mobileNumber = mobileNumber;
    user.address = address;
    user.geoLocation = geoLocation;
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

module.exports = { handleGetProfile, handleGetVerificationStatus, handleCompleteOnboarding, handleUpdateProfile, handleUploadProfilePhoto };
