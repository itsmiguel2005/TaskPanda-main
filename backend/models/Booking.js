const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
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
    repairDescription: { type: String, required: true, trim: true, maxlength: 2000 },
    address: { type: String, default: "", trim: true, maxlength: 300 },
    photoUrl: { type: String, default: "", trim: true, maxlength: 500 },
    urgency: { type: String, enum: ["Emergency", "Flexible"], default: "Flexible" },
    serviceDate: { type: Date, required: true },
    timeSlot: {
      type: String,
      enum: ["7:30 AM", "9:00 AM", "10:30 AM", "1:30 PM", "3:00 PM", "4:30 PM", "6:00 PM"],
      required: true,
    },
    offeredPrice: { type: Number, required: true, min: 100 },
    status: {
      type: String,
      enum: ["pending", "approved", "en_route", "in_progress", "cancel_requested", "canceled", "complete"],
      default: "pending",
      index: true,
    },
    cancellationReason: { type: String, default: "", trim: true, maxlength: 500 },
    cancellationRequestedBy: { type: String, enum: ["client", "provider"], default: undefined },
    cancellationRequestedAt: { type: Date },
    cancellationExpiresAt: { type: Date },
    cancellationPreviousStatus: { type: String, enum: ["pending", "approved", "en_route", "in_progress"] },
    cancellationResolvedAt: { type: Date },
    cancellationOutcome: { type: String, enum: ["instant", "approved", "rejected", "expired"] },
    clientRating: { type: Number, min: 1, max: 5 },
    clientReview: { type: String, default: "", trim: true, maxlength: 1000 },
    clientReviewPhotos: { type: [String], default: [] },
    reviewedAt: { type: Date },
    statusHistory: [{
      status: { type: String, enum: ["pending", "approved", "en_route", "in_progress", "complete", "cancel_requested", "canceled"] },
      at: { type: Date, default: Date.now },
    }],
    providerUpdates: [{
      type: { type: String, enum: ["note", "reschedule"], required: true },
      note: { type: String, required: true, trim: true, maxlength: 500 },
      proposedServiceDate: { type: Date },
      proposedTimeSlot: { type: String, enum: ["7:30 AM", "9:00 AM", "10:30 AM", "1:30 PM", "3:00 PM", "4:30 PM", "6:00 PM"] },
      status: { type: String, enum: ["sent", "pending", "accepted", "rejected"], required: true },
      requestedAt: { type: Date, default: Date.now },
      respondedAt: { type: Date },
    }],
  },
  { timestamps: true }
);

bookingSchema.index({ clientId: 1, createdAt: -1 });
bookingSchema.index({ providerId: 1, createdAt: -1 });

module.exports = mongoose.model("Booking", bookingSchema);
