const mongoose = require("mongoose");

const pandaBotUsageSchema = new mongoose.Schema(
  {
    day: { type: Date, required: true },
    model: { type: String, required: true, maxlength: 100 },
    requestCount: { type: Number, default: 0 },
    successCount: { type: Number, default: 0 },
    errorCount: { type: Number, default: 0 },
    tokenUsageRequests: { type: Number, default: 0 },
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    totalTokens: { type: Number, default: 0 },
    totalLatencyMs: { type: Number, default: 0 },
    lastRequestAt: { type: Date, default: null },
    lastSuccessAt: { type: Date, default: null },
    lastErrorAt: { type: Date, default: null },
  },
  { timestamps: true },
);

pandaBotUsageSchema.index({ day: 1, model: 1 }, { unique: true });
pandaBotUsageSchema.index({ day: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

module.exports = mongoose.model("PandaBotUsage", pandaBotUsageSchema);
