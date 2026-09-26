const { createHash } = require("crypto");
const mongoose = require("mongoose");
const User = require("../models/User");

const hashToken = (token) => createHash("sha256").update(token).digest("hex");

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
    province: user.province,
    city: user.city,
    barangay: user.barangay,
    professions: user.professions || [],
    bio: user.bio || "",
    createdAt: user.createdAt,
  };
}

async function getAuthenticatedUser(req) {
  const authorization = String(req.get("authorization") || "");
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!/^[a-f\d]{64}$/i.test(token)) return null;

  return User.findOne(mongoose.trusted({
    accountTokens: mongoose.trusted({
      $elemMatch: {
        tokenHash: hashToken(token),
        expiresAt: mongoose.trusted({ $gt: new Date() }),
      },
    }),
    registrationComplete: true,
  })).select("+accountTokens");
}

async function handleGetProfile(req, res) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ message: "Your session expired. Sign in again." });
    return res.json({ user: profileFromUser(user) });
  } catch (error) {
    console.error("Get profile error:", error);
    return res.status(500).json({ message: "Could not load your profile." });
  }
}

async function handleUpdateProfile(req, res) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ message: "Your session expired. Sign in again." });

    const fullName = String(req.body.fullName || "").trim();
    const username = String(req.body.username || "").trim();
    const mobileNumber = String(req.body.mobileNumber || "").trim();
    const address = String(req.body.address || "").trim();
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

    user.fullName = fullName;
    user.firstName = nameParts[0] || "";
    user.middleName = "";
    user.lastName = nameParts.slice(1).join(" ");
    user.username = username;
    user.mobileNumber = mobileNumber;
    user.address = address;
    user.bio = bio;
    if (user.role === "provider") user.professions = professions;
    await user.save();

    return res.json({ message: "Profile saved.", user: profileFromUser(user) });
  } catch (error) {
    if (error?.code === 11000 && error?.keyPattern?.username) {
      return res.status(409).json({ message: "This username is already taken.", field: "username" });
    }
    console.error("Update profile error:", error);
    return res.status(500).json({ message: "Could not save your profile." });
  }
}

module.exports = { handleGetProfile, handleUpdateProfile };
