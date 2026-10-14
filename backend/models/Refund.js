const mongoose = require("mongoose");

const refundRequestSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      index: true,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    providerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    reason: {
      type: String,
      enum: ["INCOMPLETE_WORK", "POOR_QUALITY", "OVERCHARGED", "OTHER"],
      required: true,
    },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    proofPhotos: { type: [String], default: [] },
    requestedCashAmount: { type: Number, required: true, min: 0 },
    approvedCashAmount: { type: Number, min: 0, default: 0 },
    bookingStatusBeforeRequest: {
      type: String,
      enum: ["complete", "closed", "settled", "disputed"],
      required: true,
    },
    cashPaidConfirmedAtRequest: { type: Boolean, required: true },
    voucherRestored: { type: Boolean, default: false },
    cashRepaymentStatus: {
      type: String,
      enum: [
        "not_required",
        "due_provider_to_client",
        "provider_marked_sent",
        "client_reported_missing",
        "repayment_overdue",
        "confirmed_received",
        "auto_confirmed",
      ],
      default: "not_required",
    },
    providerRepaymentDueAt: { type: Date },
    providerMarkedSentAt: { type: Date },
    clientResponseDueAt: { type: Date },
    clientConfirmedAt: { type: Date },
    clientAutoConfirmedAt: { type: Date },
    clientReportedAt: { type: Date },
    clientReportNote: { type: String, default: "", trim: true, maxlength: 1000 },
    providerSuspensionAppliedAt: { type: Date },
    bookingClosureAppliedAt: { type: Date },
    repaymentReviewedAt: { type: Date },
    repaymentReviewedBy: { type: String, default: "", trim: true, lowercase: true },
    repaymentReviewNotes: { type: String, default: "", trim: true, maxlength: 2000 },
    resolutionAction: {
      type: String,
      enum: ["APPROVE_FULL", "APPROVE_PARTIAL", "REJECT"],
    },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
      index: true,
    },
    adminNotes: { type: String, default: "", trim: true, maxlength: 2000 },
    resolvedBy: { type: String, default: "", trim: true, lowercase: true },
    resolvedAt: { type: Date },
    resolutionLockAt: { type: Date, default: null },
    resolutionLockBy: { type: String, default: "", trim: true, lowercase: true },
    resolutionLockAction: {
      type: String,
      enum: ["APPROVE_FULL", "APPROVE_PARTIAL", "REJECT"],
    },
    resolutionLockAmount: { type: Number, min: 0 },
  },
  { timestamps: true }
);

refundRequestSchema.index({ bookingId: 1, createdAt: -1 });
refundRequestSchema.index({ status: 1, createdAt: -1 });
refundRequestSchema.index({ cashRepaymentStatus: 1, providerRepaymentDueAt: 1, clientResponseDueAt: 1 });

module.exports = mongoose.models.RefundRequest || mongoose.model("RefundRequest", refundRequestSchema);
