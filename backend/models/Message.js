const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    senderRole: { type: String, enum: ["client", "provider", "system"], required: true },
    text: { type: String, default: "", trim: true, maxlength: 2000 },
    photos: { type: [mongoose.Schema.Types.Mixed], default: [] },
    eventType: { type: String, enum: ["booking_request", "booking_status", "counter_offer", "payment", "digital_receipt", "provider_update", "running_late", "late_response", "cancellation", "revision_request", "revision_response", "review", "system"], default: "system" },
    eventData: { type: mongoose.Schema.Types.Mixed, default: undefined },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

messageSchema.index({ conversationId: 1, createdAt: 1 });

module.exports = mongoose.model("Message", messageSchema);