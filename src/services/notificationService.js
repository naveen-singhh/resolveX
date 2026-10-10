const Notification = require('../models/Notification');
const User = require('../models/User');

async function notifyUser({ recipient, complaint, type, title, message, dedupeKey }) {
  if (!recipient) return null;
  if (dedupeKey) {
    return Notification.findOneAndUpdate(
      { dedupeKey },
      { $setOnInsert: { recipient, complaint: complaint || null, type, title, message, dedupeKey } },
      { upsert: true, new: true }
    );
  }
  return Notification.create({ recipient, complaint: complaint || null, type, title, message });
}

async function notifyComplaintParticipants(complaint, actor, payload) {
  const creator = complaint.createdBy && (complaint.createdBy._id || complaint.createdBy);
  const assigned = complaint.assignedTo && (complaint.assignedTo._id || complaint.assignedTo);
  const recipients = new Set([String(creator), assigned && String(assigned)].filter(Boolean));
  recipients.delete(String(actor._id));
  await Promise.all([...recipients].map((recipient) => notifyUser({ recipient, complaint: complaint._id, ...payload })));
}

async function notifyAdmins(payload) {
  const admins = await User.find({ role: 'ADMIN', isActive: true }).select('_id');
  await Promise.all(admins.map((admin) => notifyUser({
    recipient: admin._id,
    ...payload,
    dedupeKey: payload.dedupeKey ? `${payload.dedupeKey}:${admin._id}` : undefined
  })));
}

module.exports = { notifyUser, notifyComplaintParticipants, notifyAdmins };
