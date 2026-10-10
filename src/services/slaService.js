const Complaint = require('../models/Complaint');
const ComplaintHistory = require('../models/ComplaintHistory');
const SLAPolicy = require('../models/SLAPolicy');
const { notifyAdmins } = require('./notificationService');

const DEFAULT_POLICIES = [
  { priority: 'CRITICAL', responseMinutes: 15, resolutionMinutes: 120 },
  { priority: 'HIGH', responseMinutes: 60, resolutionMinutes: 480 },
  { priority: 'MEDIUM', responseMinutes: 240, resolutionMinutes: 1440 },
  { priority: 'LOW', responseMinutes: 1440, resolutionMinutes: 4320 }
];

async function ensureDefaultPolicies() {
  await Promise.all(DEFAULT_POLICIES.map(({ priority, responseMinutes, resolutionMinutes }) =>
    SLAPolicy.updateOne({ priority }, { $setOnInsert: { priority, responseMinutes, resolutionMinutes, isActive: true } }, { upsert: true })
  ));
}

async function calculateDeadlines(priority, createdAt = new Date()) {
  const policy = await SLAPolicy.findOne({ priority, isActive: true });
  if (!policy) throw Object.assign(new Error(`No active SLA policy exists for ${priority}.`), { status: 503 });
  return {
    responseDeadlineAt: new Date(createdAt.getTime() + policy.responseMinutes * 60000),
    resolutionDeadlineAt: new Date(createdAt.getTime() + policy.resolutionMinutes * 60000)
  };
}

async function monitorOverdueComplaints(now = new Date()) {
  const activeStatuses = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'REOPENED'];
  const complaints = await Complaint.find({
    status: { $in: activeStatuses },
    $or: [
      { firstResponseAt: null, responseDeadlineAt: { $lte: now }, responseEscalationRecordedAt: null },
      { status: { $in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'REOPENED'] }, resolvedAt: null, resolutionDeadlineAt: { $lte: now }, resolutionEscalationRecordedAt: null }
    ]
  }).select('_id title priority createdBy assignedTo responseDeadlineAt resolutionDeadlineAt firstResponseAt resolvedAt responseEscalationRecordedAt resolutionEscalationRecordedAt');

  let escalations = 0;
  for (const complaint of complaints) {
    const breaches = [];
    if (!complaint.firstResponseAt && complaint.responseDeadlineAt <= now && !complaint.responseEscalationRecordedAt) breaches.push('RESPONSE');
    if (!complaint.resolvedAt && complaint.resolutionDeadlineAt <= now && !complaint.resolutionEscalationRecordedAt) breaches.push('RESOLUTION');
    for (const breach of breaches) {
      const idempotencyKey = `sla:${complaint._id}:${breach}`;
      const note = `${breach.toLowerCase()} deadline exceeded`;
      await ComplaintHistory.updateOne(
        { idempotencyKey },
        { $setOnInsert: { complaint: complaint._id, actor: null, eventType: 'SLA_ESCALATION', oldValue: null, newValue: breach, note, idempotencyKey } },
        { upsert: true }
      );
      await notifyAdmins({
        complaint: complaint._id,
        type: 'SLA_ESCALATION',
        title: `${breach === 'RESPONSE' ? 'Response' : 'Resolution'} SLA exceeded`,
        message: `${complaint.title} (${complaint.priority}) has exceeded its ${breach.toLowerCase()} deadline.`,
        dedupeKey: `${idempotencyKey}:admin`
      });
      const marker = breach === 'RESPONSE' ? 'responseEscalationRecordedAt' : 'resolutionEscalationRecordedAt';
      await Complaint.updateOne({ _id: complaint._id, [marker]: null }, { $set: { [marker]: now, escalationRecordedAt: now } });
      escalations += 1;
    }
  }
  return escalations;
}

module.exports = { DEFAULT_POLICIES, ensureDefaultPolicies, calculateDeadlines, monitorOverdueComplaints };
