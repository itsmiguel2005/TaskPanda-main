const mongoose = require("mongoose");

const adminNotificationSchema = new mongoose.Schema({
  eventKey: { type: String, required: true, unique: true, trim: true, maxlength: 255 },
  event: { type: String, required: true, trim: true, maxlength: 100 },
  title: { type: String, required: true, trim: true, maxlength: 100 },
  message: { type: String, required: true, trim: true, maxlength: 240 },
  targetUrl: { type: String, required: true, trim: true, maxlength: 500 },
  readBy: { type: [String], default: [] },
  dismissedBy: { type: [String], default: [] },
}, {
  timestamps: true,
});

adminNotificationSchema.index({ updatedAt: -1 });
adminNotificationSchema.index({ readBy: 1, updatedAt: -1 });

module.exports = mongoose.model("AdminNotification", adminNotificationSchema);
