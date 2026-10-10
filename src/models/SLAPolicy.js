const mongoose = require('mongoose');
const policySchema = new mongoose.Schema({
  priority: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], unique: true, required: true },
  responseMinutes: { type: Number, min: 1, max: 525600, required: true },
  resolutionMinutes: { type: Number, min: 1, max: 525600, required: true },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });
module.exports = mongoose.model('SLAPolicy', policySchema);
