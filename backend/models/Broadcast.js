const mongoose = require("mongoose");

const broadcastSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 100 },
    message: { type: String, required: true, trim: true, maxlength: 240 },
    createdBy: { type: String, trim: true, lowercase: true, default: "" },
  },
  { timestamps: true }
);

broadcastSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Broadcast", broadcastSchema);
