const mongoose = require('mongoose');
const historySchema = new mongoose.Schema({
  complaint: { type: mongoose.Schema.Types.ObjectId, ref: 'Complaint', required: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  eventType: { type: String, required: true, maxlength: 50 },
  oldValue: { type: mongoose.Schema.Types.Mixed, default: null },
  newValue: { type: mongoose.Schema.Types.Mixed, default: null },
  note: { type: String, maxlength: 2000, default: '' },
  idempotencyKey: { type: String, default: undefined }
}, { timestamps: { createdAt: true, updatedAt: false } });
historySchema.index({ complaint: 1, createdAt: 1 });
historySchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });
module.exports = mongoose.model('ComplaintHistory', historySchema);
