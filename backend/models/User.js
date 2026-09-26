const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ["client", "provider", "admin"],
      required: true,
    },
    fullName: {
      type: String,
      default: "",
    },
    username: {
      type: String,
      default: "",
    },
    firstName: {
      type: String,
      default: "",
    },
    middleName: {
      type: String,
      default: "",
    },
    lastName: {
      type: String,
      default: "",
    },
    mobileNumber: {
      type: String,
      default: "",
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    emailVerified: {
      type: Boolean,
      default: true,
    },
    registrationComplete: {
      type: Boolean,
      default: true,
    },
    emailVerificationTokenHash: {
      type: String,
      select: false,
    },
    emailVerificationExpiresAt: {
      type: Date,
      select: false,
    },
    emailVerificationTokens: {
      type: [{
        tokenHash: { type: String, required: true },
        expiresAt: { type: Date, required: true },
        _id: false,
      }],
      default: [],
      select: false,
    },
    registrationExpiresAt: {
      type: Date,
      expires: 0,
    },
    onboardingTokenHash: {
      type: String,
      select: false,
    },
    onboardingTokenExpiresAt: {
      type: Date,
      select: false,
    },
    onboardingTokens: {
      type: [{
        tokenHash: { type: String, required: true },
        expiresAt: { type: Date, required: true },
        _id: false,
      }],
      default: [],
      select: false,
    },
    professions: {
      type: [String],
      default: [],
    },
    province: String,
    city: String,
    barangay: String,
    address: String,
    dateOfBirth: {
      type: Date,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
