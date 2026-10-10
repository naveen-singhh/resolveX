const Complaint = require('../models/Complaint');
const User = require('../models/User');
const SLAPolicy = require('../models/SLAPolicy');
const AuditLog = require('../models/AuditLog');

async function technicianDashboard(req, res) {
  const assigned = { assignedTo: req.user._id, status: { $in: ['ASSIGNED', 'IN_PROGRESS', 'REOPENED'] } };
  const [complaints, total, byPriority] = await Promise.all([
    Complaint.find(assigned).sort({ priority: -1, createdAt: 1 }).populate('createdBy', 'name'),
    Complaint.countDocuments(assigned),
    Complaint.aggregate([{ $match: assigned }, { $group: { _id: '$priority', count: { $sum: 1 } } }])
  ]);
  res.render('technician/dashboard', { title: 'Technician dashboard', complaints, total, byPriority });
}

async function adminDashboard(req, res) {
  const [total, open, inProgress, resolved, overdue, categories, priorities, recent] = await Promise.all([
    Complaint.countDocuments(),
    Complaint.countDocuments({ status: { $in: ['OPEN', 'ASSIGNED', 'REOPENED'] } }),
    Complaint.countDocuments({ status: 'IN_PROGRESS' }),
    Complaint.countDocuments({ status: { $in: ['RESOLVED', 'CLOSED'] } }),
    Complaint.countDocuments({
      status: { $in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'REOPENED'] },
      resolvedAt: null,
      $or: [
        { resolutionDeadlineAt: { $lt: new Date() } },
        { firstResponseAt: null, responseDeadlineAt: { $lt: new Date() } }
      ]
    }),
    Complaint.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    Complaint.aggregate([{ $group: { _id: '$priority', count: { $sum: 1 } } }]),
    Complaint.find().sort({ createdAt: -1 }).limit(8).populate('createdBy', 'name').populate('assignedTo', 'name')
  ]);
  res.render('admin/dashboard', {
    title: 'Administration overview',
    stats: { total, open, inProgress, resolved, overdue },
    categories,
    priorities,
    complaints: recent
  });
}

async function staff(req, res) {
  const users = await User.find({ role: { $in: ['TECHNICIAN', 'ADMIN'] } }).select('name email role supportedCategories isAvailable isActive').sort({ role: 1, name: 1 });
  res.render('admin/staff', { title: 'Staff management', users, errors: [] });
}

async function slaPolicies(req, res) {
  const policies = await SLAPolicy.find().sort({ priority: 1 });
  res.render('admin/sla-policies', { title: 'SLA policies', policies, errors: [] });
}

async function auditLogs(req, res) {
  const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(100).populate('actor', 'name role');
  res.render('admin/audit-logs', { title: 'Audit log', logs });
}

module.exports = { technicianDashboard, adminDashboard, staff, slaPolicies, auditLogs };
