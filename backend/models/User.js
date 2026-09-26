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
    registrationSessionTokenHash: {
      type: String,
      select: false,
    },
    registrationSessionExpiresAt: {
      type: Date,
      select: false,
    },
    registrationVerificationClosedAt: {
      type: Date,
      select: false,
    },
    registrationResumeClaimedAt: {
      type: Date,
      select: false,
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
    bio: {
      type: String,
      default: "",
    },
    accountTokens: {
      type: [{
        tokenHash: { type: String, required: true },
        expiresAt: { type: Date, required: true },
        _id: false,
      }],
      default: [],
      select: false,
    },
    province: String,
    city: String,
    barangay: String,
    address: String,
    geoLocation: {
      type: {
        type: String,
        enum: ["Point"],
      },
      coordinates: {
        type: [Number],
        default: undefined,
      },
    },
    tesdaCertificates: {
      type: [{
        trade: { type: String, trim: true },
        status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
        submittedAt: { type: Date, default: Date.now },
      }],
      default: [],
    },
    dateOfBirth: {
      type: Date,
    },
  },
  { timestamps: true }
);

userSchema.index({ geoLocation: "2dsphere" });

module.exports = mongoose.model("User", userSchema);
