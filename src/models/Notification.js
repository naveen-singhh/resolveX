const mongoose = require('mongoose');
const notificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  complaint: { type: mongoose.Schema.Types.ObjectId, ref: 'Complaint', default: null },
  type: { type: String, required: true, maxlength: 50 },
  title: { type: String, required: true, maxlength: 120 },
  message: { type: String, required: true, maxlength: 500 },
  isRead: { type: Boolean, default: false },
  dedupeKey: { type: String, default: undefined }
}, { timestamps: { createdAt: true, updatedAt: false } });
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ dedupeKey: 1 }, { unique: true, sparse: true });
module.exports = mongoose.model('Notification', notificationSchema);
