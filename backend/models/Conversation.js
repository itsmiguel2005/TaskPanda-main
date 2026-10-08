const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
  {
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true, unique: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    providerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    lastMessage: { type: String, default: "", trim: true, maxlength: 2000 },
    lastMessageAt: { type: Date, default: Date.now },
    archivedAt: { type: Date },
    isArchivedByClient: { type: Boolean, default: false },
    isArchivedByProvider: { type: Boolean, default: false },
    lastReadAtClient: { type: Date },
    lastReadAtProvider: { type: Date },
    clientTypingUntil: { type: Date },
    providerTypingUntil: { type: Date },
    unreadCountClient: { type: Number, min: 0, default: 0 },
    unreadCountProvider: { type: Number, min: 0, default: 0 },
    supportReports: [{
      reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      reporterRole: { type: String, enum: ["client", "provider"], required: true },
      details: { type: String, required: true, trim: true, maxlength: 1000 },
      createdAt: { type: Date, default: Date.now },
      status: { type: String, enum: ["open", "resolved"], default: "open" },
      resolvedAt: { type: Date },
      resolvedByAdmin: { type: String, trim: true, maxlength: 254 },
      adminNotes: { type: String, trim: true, maxlength: 2000, default: "" },
      adminNotesUpdatedAt: { type: Date },
      adminNotesUpdatedBy: { type: String, trim: true, maxlength: 254 },
      moderationHistory: [{
        action: { type: String, enum: ["resolved", "reopened", "suspended", "warned", "notes_updated"], required: true },
        reason: { type: String, trim: true, maxlength: 2000, default: "" },
        actorEmail: { type: String, trim: true, maxlength: 254, required: true },
        createdAt: { type: Date, default: Date.now },
      }],
    }],
  },
  { timestamps: true }
);

conversationSchema.index({ clientId: 1, updatedAt: -1 });
conversationSchema.index({ providerId: 1, updatedAt: -1 });
conversationSchema.index({ "supportReports.status": 1, "supportReports.createdAt": -1 });

module.exports = mongoose.model("Conversation", conversationSchema);