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
    referralCode: {
      type: String,
      trim: true,
      uppercase: true,
    },
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    referralVoucherAwarded: {
      type: Boolean,
      default: false,
    },
    referralRewardedClientIds: {
      type: [mongoose.Schema.Types.ObjectId],
      default: [],
    },
    stampProgress: {
      type: Number,
      min: 0,
      max: 5,
      default: 0,
    },
    completedBookings: {
      type: Number,
      min: 0,
      default: 0,
    },
    vouchers: {
      type: [{
        kind: { type: String, enum: ["referral", "milestone", "promotion"], required: true },
        title: { type: String, required: true, trim: true, maxlength: 100 },
        origin: { type: String, enum: ["referral", "stamp-card", "promotion"], required: true },
        amount: { type: Number, required: true, min: 0 },
        status: { type: String, enum: ["active", "reserved", "redeemed", "expired"], default: "active" },
        awardedAt: { type: Date, default: Date.now },
        expiresAt: { type: Date },
        redeemedAt: { type: Date },
        bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "Booking" },
        reservationId: { type: String, select: false },
        reservationExpiresAt: { type: Date },
      }],
      default: [],
    },
    rewardNotifications: {
      type: [{
        title: { type: String, required: true, trim: true, maxlength: 100 },
        message: { type: String, required: true, trim: true, maxlength: 240 },
        createdAt: { type: Date, default: Date.now },
        readAt: { type: Date },
      }],
      default: [],
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
    passwordResetTokenHash: {
      type: String,
      select: false,
    },
    passwordResetExpiresAt: {
      type: Date,
      select: false,
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
    profileImage: {
      type: String,
      default: "",
    },
    averageRating: {
      type: Number,
      min: 0,
      max: 5,
      default: 0,
    },
    totalReviews: {
      type: Number,
      min: 0,
      default: 0,
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
userSchema.index({ username: 1 });
userSchema.index({ referralCode: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("User", userSchema);
