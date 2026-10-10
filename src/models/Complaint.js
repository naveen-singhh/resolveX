const mongoose = require('mongoose');
const priorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const statuses = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REOPENED', 'CANCELLED'];

const complaintSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, minlength: 5, maxlength: 120 },
  description: { type: String, required: true, trim: true, minlength: 10, maxlength: 5000 },
  category: { type: String, enum: ['AMENITIES', 'WATER', 'ELECTRICAL', 'CLEANING', 'SECURITY', 'IT', 'OTHER'], required: true },
  location: { type: String, required: true, trim: true, maxlength: 120 },
  priority: { type: String, enum: priorities, default: 'MEDIUM', required: true },
  status: { type: String, enum: statuses, default: 'OPEN', required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  responseDeadlineAt: { type: Date, required: true },
  resolutionDeadlineAt: { type: Date, required: true },
  firstResponseAt: { type: Date, default: null },
  resolvedAt: { type: Date, default: null },
  closedAt: { type: Date, default: null },
  resolutionSummary: { type: String, trim: true, maxlength: 2000, default: null },
  responseEscalationRecordedAt: { type: Date, default: null },
  resolutionEscalationRecordedAt: { type: Date, default: null },
  escalationRecordedAt: { type: Date, default: null }
}, { timestamps: true, optimisticConcurrency: true });

complaintSchema.index({ createdBy:  1, createdAt: -1 });
complaintSchema.index({ assignedTo: 1, status: 1 });
complaintSchema.index({ status: 1, priority: 1 });
complaintSchema.index({ responseDeadlineAt: 1, status: 1 });
complaintSchema.index({ resolutionDeadlineAt: 1, status: 1 });
module.exports = mongoose.model('Complaint', complaintSchema);
