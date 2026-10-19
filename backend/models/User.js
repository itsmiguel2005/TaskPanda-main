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
    referralRewardStatus: {
      type: String,
      enum: ["PENDING_FIRST_BOOKING", "REWARDED"],
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
    firstSettledBookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
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
    verificationVoucherAwarded: {
      type: Boolean,
      default: false,
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
    verificationNotifications: {
      type: [{
        title: { type: String, required: true, trim: true, maxlength: 100 },
        message: { type: String, required: true, trim: true, maxlength: 500 },
        href: { type: String, required: true, trim: true, maxlength: 200 },
        createdAt: { type: Date, default: Date.now },
        readAt: { type: Date },
      }],
      default: [],
    },
    refundNotifications: {
      type: [{
        refundId: { type: String, required: true, trim: true, maxlength: 50 },
        title: { type: String, required: true, trim: true, maxlength: 100 },
        message: { type: String, required: true, trim: true, maxlength: 500 },
        href: { type: String, required: true, trim: true, maxlength: 200 },
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
    pendingMobileNumber: {
      type: String,
      select: false,
    },
    phoneVerified: {
      type: Boolean,
      default: false,
    },
    phoneOtpHash: {
      type: String,
      select: false,
    },
    phoneOtpExpiresAt: {
      type: Date,
      select: false,
    },
    phoneOtpAttempts: {
      type: Number,
      default: 0,
      select: false,
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
    trustedDevices: {
      type: [{
        deviceTokenHash: { type: String, required: true },
        deviceName: { type: String, default: "Unknown device", maxlength: 120 },
        lastLoginAt: { type: Date, default: Date.now },
        _id: false,
      }],
      default: [],
      select: false,
    },
    otpHash: {
      type: String,
      select: false,
    },
    otpExpiresAt: {
      type: Date,
      select: false,
    },
    otpAttempts: {
      type: Number,
      default: 0,
      select: false,
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
    isVerified: {
      type: Boolean,
      default: false,
    },
    verificationStatus: {
      type: String,
      enum: ["unverified", "pending", "verified", "rejected"],
      default: "unverified",
    },
    verificationDetails: {
      idFrontUrl: { type: String, default: "" },
      idBackUrl: { type: String, default: "" },
      tradeCertificate: { type: String, trim: true, maxlength: 200, default: "" },
      ocrConfidence: { type: Number, min: 0, max: 100, default: null },
      verificationScore: { type: Number, min: 0, max: 100, default: null },
      nameMatchAccuracy: { type: Number, min: 0, max: 100, default: null },
      dateOfBirthMatched: { type: Boolean, default: false },
      ageEligible: { type: Boolean, default: false },
      ocrProcessing: { type: Boolean, default: false },
      autoVerified: { type: Boolean, default: false },
      duplicateIdentifier: { type: Boolean, default: false },
      manualReviewReason: { type: String, trim: true, maxlength: 240, default: "" },
      securityFlags: {
        type: [{
          type: String,
          enum: ["AI_OR_EDITED_METADATA_DETECTED", "METADATA_INSPECTION_FAILED"],
        }],
        default: [],
      },
      rejectionReason: { type: String, trim: true, maxlength: 500, default: "" },
      status: { type: String, enum: ["Active", "Pending", "Rejected"], default: undefined },
      submittedAt: { type: Date, default: null },
      reviewedAt: { type: Date, default: null },
      idFrontPublicId: { type: String, select: false },
      idBackPublicId: { type: String, select: false },
      idFrontFormat: { type: String, select: false },
      idBackFormat: { type: String, select: false },
      identifierType: { type: String, enum: ["PSN", "PCN"], select: false },
      identifierCiphertext: { type: String, select: false },
      identifierIv: { type: String, select: false },
      identifierTag: { type: String, select: false },
      identifierKeyVersion: { type: String, select: false },
      identifierHash: { type: String, select: false },
      identifierLastFour: { type: String, select: false },
    },
    registrationComplete: {
      type: Boolean,
      default: true,
    },
    isAvailable: {
      type: Boolean,
      default: true,
    },
    hasCompletedOnboarding: {
      type: Boolean,
      default: false,
    },
    hasCompletedProviderOnboarding: {
      type: Boolean,
      default: false,
    },
    dashboardDensityPreference: {
      type: String,
      enum: ["comfortable", "compact"],
      default: "comfortable",
    },
    providerIncomingRequestsDensityPreference: {
      type: String,
      enum: ["comfortable", "compact"],
      default: "comfortable",
    },
    providerJobsDensityPreference: {
      type: String,
      enum: ["comfortable", "compact"],
      default: "comfortable",
    },
    isSuspended: {
      type: Boolean,
      default: false,
    },
    refundSuspensionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RefundRequest",
      select: false,
    },
    suspendedAt: {
      type: Date,
    },
    adminPasswordResetRequestedAt: {
      type: Date,
      select: false,
    },
    archivedAt: {
      type: Date,
    },
    adminActivity: {
      type: [{
        action: {
          type: String,
          enum: ["suspended", "unsuspended", "archived", "restored", "password_reset_requested", "warned"],
          required: true,
        },
        reason: { type: String, trim: true, maxlength: 500, default: "" },
        actorEmail: { type: String, required: true, trim: true },
        createdAt: { type: Date, default: Date.now },
        _id: false,
      }],
      default: [],
      select: false,
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
    registrationResumeCodeHash: {
      type: String,
      select: false,
    },
    registrationResumeCodeExpiresAt: {
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
    lastActive: {
      type: Date,
      default: null,
      select: false,
    },
    lastOfflineAt: {
      type: Date,
      default: null,
      select: false,
    },
    isOnline: {
      type: Boolean,
      default: false,
      select: false,
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
        trade: { type: String, trim: true, maxlength: 120 },
        status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
        submittedAt: { type: Date, default: Date.now },
        reviewedAt: { type: Date, default: null },
        rejectionReason: { type: String, trim: true, maxlength: 500, default: "" },
        certificateImageUrl: { type: String, default: "" },
        certificateImagePublicId: { type: String, select: false },
        certificateImageFormat: { type: String, select: false },
      }],
      default: [],
    },
    dateOfBirth: {
      type: Date,
    },
  },
  { timestamps: true }
);

userSchema.pre("validate", function removeRetiredCameraMetadataFlag() {
  const securityFlags = this.verificationDetails?.securityFlags;
  if (Array.isArray(securityFlags) && securityFlags.includes("CAMERA_METADATA_MISSING")) {
    this.verificationDetails.securityFlags = securityFlags.filter(
      (flag) => flag !== "CAMERA_METADATA_MISSING",
    );
  }
});

userSchema.index({ geoLocation: "2dsphere" });
userSchema.index({ username: 1 });
userSchema.index({ referralCode: 1 }, { unique: true, sparse: true });
module.exports = mongoose.model("User", userSchema);
