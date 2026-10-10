const mongoose = require('mongoose');
const Complaint = require('../models/Complaint');
const ComplaintHistory = require('../models/ComplaintHistory');
const Comment = require('../models/Comment');
const User = require('../models/User');
const { calculateDeadlines } = require('./slaService');
const { notifyUser, notifyComplaintParticipants } = require('./notificationService');
const { recordAudit } = require('./auditService');

const transitions = {
  OPEN: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['IN_PROGRESS', 'OPEN', 'CANCELLED'],
  IN_PROGRESS: ['RESOLVED', 'ASSIGNED', 'CANCELLED'],
  RESOLVED: ['CLOSED', 'REOPENED'],
  CLOSED: ['REOPENED'],
  REOPENED: ['ASSIGNED', 'IN_PROGRESS', 'CANCELLED'],
  CANCELLED: []
};

function idOf(value) {
  return value && (value._id || value);
}

function canViewComplaint(complaint, user) {
  if (user.role === 'ADMIN') return true;
  const creatorId = idOf(complaint.createdBy);
  const technicianId = idOf(complaint.assignedTo);
  if (user.role === 'STUDENT') return String(creatorId) === String(user._id);
  return user.role === 'TECHNICIAN' && String(technicianId) === String(user._id);
}

async function findVisibleComplaint(id, user) {
  if (!mongoose.isValidObjectId(id)) return null;
  const complaint = await Complaint.findById(id)
    .populate('createdBy', 'name email')
    .populate('assignedTo', 'name email');
  return complaint && canViewComplaint(complaint, user) ? complaint : null;
}

async function createComplaint(data, student) {
  const createdAt = new Date();
  const deadlines = await calculateDeadlines('MEDIUM', createdAt);
  const complaint = await Complaint.create({
    title: data.title,
    description: data.description,
    category: data.category,
    location: data.location,
    priority: 'MEDIUM',
    status: 'OPEN',
    createdBy: student._id,
    ...deadlines
  });
  await ComplaintHistory.create({ complaint: complaint._id, actor: student._id, eventType: 'CREATED', newValue: 'OPEN', note: 'Complaint submitted.' });
  const admins = await User.find({ role: 'ADMIN', isActive: true }).select('_id');
  await Promise.all(admins.map((admin) => notifyUser({
    recipient: admin._id,
    complaint: complaint._id,
    type: 'COMPLAINT_SUBMITTED',
    title: 'New complaint submitted',
    message: `${complaint.title} was submitted and is awaiting assignment.`
  })));
  return complaint;
}

async function assignComplaint(complaint, technician, actor) {
  if (actor.role !== 'ADMIN') throw Object.assign(new Error('Only an administrator can assign technicians.'), { status: 403 });
  if (!technician || technician.role !== 'TECHNICIAN' || !technician.isActive) throw Object.assign(new Error('Select an active technician.'), { status: 400 });
  if (['RESOLVED', 'CLOSED', 'CANCELLED'].includes(complaint.status)) throw Object.assign(new Error('A completed or cancelled complaint cannot be assigned.'), { status: 400 });
  if (technician.supportedCategories.length && !technician.supportedCategories.includes(complaint.category)) {
    throw Object.assign(new Error('This technician does not support the complaint category.'), { status: 400 });
  }
  const previous = complaint.assignedTo ? String(complaint.assignedTo._id || complaint.assignedTo) : null;
  const oldStatus = complaint.status;
  complaint.assignedTo = technician._id;
  if (['OPEN', 'REOPENED'].includes(complaint.status)) complaint.status = 'ASSIGNED';
  await complaint.save();
  await ComplaintHistory.create({ complaint: complaint._id, actor: actor._id, eventType: previous ? 'REASSIGNED' : 'ASSIGNED', oldValue: previous, newValue: String(technician._id), note: `Assigned to ${technician.name}.` });
  if (oldStatus !== complaint.status) {
    await ComplaintHistory.create({ complaint: complaint._id, actor: actor._id, eventType: 'STATUS_CHANGED', oldValue: oldStatus, newValue: complaint.status });
  }
  await notifyUser({
    recipient: technician._id,
    complaint: complaint._id,
    type: previous ? 'COMPLAINT_REASSIGNED' : 'COMPLAINT_ASSIGNED',
    title: previous ? 'Complaint reassigned to you' : 'Complaint assigned to you',
    message: complaint.title
  });
  if (String(complaint.createdBy) !== String(actor._id)) {
    await notifyUser({ recipient: complaint.createdBy, complaint: complaint._id, type: 'COMPLAINT_ASSIGNED', title: 'Technician assigned', message: `${technician.name} was assigned to ${complaint.title}.` });
  }
  await recordAudit({ actor, action: previous ? 'COMPLAINT_REASSIGNED' : 'COMPLAINT_ASSIGNED', entityType: 'Complaint', entityId: complaint._id, details: { previousTechnicianId: previous, technicianId: String(technician._id) } });
  return complaint;
}

async function transitionStatus(complaint, nextStatus, actor, note = '') {
  if (!transitions[complaint.status] || !transitions[complaint.status].includes(nextStatus)) {
    throw Object.assign(new Error(`Transition from ${complaint.status} to ${nextStatus} is not allowed.`), { status: 400 });
  }
  const allowed = {
    IN_PROGRESS: actor.role === 'TECHNICIAN' && String(idOf(complaint.assignedTo)) === String(actor._id),
    RESOLVED: actor.role === 'TECHNICIAN' && String(idOf(complaint.assignedTo)) === String(actor._id),
    CLOSED: actor.role === 'STUDENT' && String(idOf(complaint.createdBy)) === String(actor._id),
    REOPENED: actor.role === 'STUDENT' && String(idOf(complaint.createdBy)) === String(actor._id),
    CANCELLED: actor.role === 'ADMIN',
    OPEN: actor.role === 'ADMIN',
    ASSIGNED: actor.role === 'ADMIN'
  };
  if (!allowed[nextStatus]) throw Object.assign(new Error('You are not allowed to make this status change.'), { status: 403 });
  const oldStatus = complaint.status;
  complaint.status = nextStatus;
  if (nextStatus === 'IN_PROGRESS' && !complaint.firstResponseAt) complaint.firstResponseAt = new Date();
  if (nextStatus === 'RESOLVED') complaint.resolvedAt = new Date();
  if (nextStatus === 'CLOSED') complaint.closedAt = new Date();
  if (nextStatus === 'REOPENED') {
    complaint.resolvedAt = null;
    complaint.closedAt = null;
    complaint.resolutionSummary = null;
    complaint.firstResponseAt = null;
    const deadlines = await calculateDeadlines(complaint.priority, new Date());
    complaint.responseDeadlineAt = deadlines.responseDeadlineAt;
    complaint.resolutionDeadlineAt = deadlines.resolutionDeadlineAt;
    complaint.responseEscalationRecordedAt = null;
    complaint.resolutionEscalationRecordedAt = null;
    complaint.escalationRecordedAt = null;
  }
  await complaint.save();
  await ComplaintHistory.create({ complaint: complaint._id, actor: actor._id, eventType: 'STATUS_CHANGED', oldValue: oldStatus, newValue: nextStatus, note });
  await notifyComplaintParticipants(complaint, actor, {
    type: `STATUS_${nextStatus}`,
    title: `Complaint ${nextStatus.toLowerCase().replace('_', ' ')}`,
    message: note || `${complaint.title} is now ${nextStatus.toLowerCase().replace('_', ' ')}.`
  });
  return complaint;
}

async function addComment(complaint, actor, message) {
  const comment = await Comment.create({ complaint: complaint._id, author: actor._id, message });
  await notifyComplaintParticipants(complaint, actor, {
    type: 'NEW_COMMENT',
    title: 'New complaint update',
    message: `${actor.name} added an update to ${complaint.title}.`
  });
  return comment;
}

async function changePriority(complaint, priority, actor) {
  if (actor.role !== 'ADMIN') throw Object.assign(new Error('Only an administrator can change complaint priority.'), { status: 403 });
  const active = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'REOPENED'].includes(complaint.status);
  const deadlines = await calculateDeadlines(priority, active ? new Date() : complaint.createdAt);
  const oldPriority = complaint.priority;
  complaint.priority = priority;
  complaint.responseDeadlineAt = deadlines.responseDeadlineAt;
  complaint.resolutionDeadlineAt = deadlines.resolutionDeadlineAt;
  complaint.responseEscalationRecordedAt = null;
  complaint.resolutionEscalationRecordedAt = null;
  complaint.escalationRecordedAt = null;
  await complaint.save();
  await ComplaintHistory.create({ complaint: complaint._id, actor: actor._id, eventType: 'PRIORITY_CHANGED', oldValue: oldPriority, newValue: priority });
  await recordAudit({ actor, action: 'COMPLAINT_PRIORITY_CHANGED', entityType: 'Complaint', entityId: complaint._id, details: { oldPriority, newPriority: priority } });
}

module.exports = { transitions, canViewComplaint, findVisibleComplaint, createComplaint, assignComplaint, transitionStatus, addComment, changePriority };
