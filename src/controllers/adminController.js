const mongoose = require('mongoose');
const { body, validationResult } = require('express-validator');
const Complaint = require('../models/Complaint');
const User = require('../models/User');
const SLAPolicy = require('../models/SLAPolicy');
const ComplaintHistory = require('../models/ComplaintHistory');
const { assignComplaint, changePriority, transitionStatus } = require('../services/complaintService');
const { recommendTechnician } = require('../services/assignmentService');
const { recordAudit } = require('../services/auditService');
const { notifyUser } = require('../services/notificationService');

const staffRules = [
  body('name').trim().isLength({ min: 2, max: 80 }).withMessage('Name must be 2–80 characters.'),
  body('email').trim().isEmail().normalizeEmail().withMessage('Enter a valid email address.'),
  body('password').isLength({ min: 10, max: 128 }).withMessage('Password must be at least 10 characters.'),
  body('role').isIn(['TECHNICIAN', 'ADMIN']).withMessage('Choose a staff role.')
];
const priorityRules = [body('priority').isIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).withMessage('Choose a valid priority.')];
const policyRules = [
  body('responseMinutes').isInt({ min: 1, max: 525600 }).withMessage('Response target must be 1–525600 minutes.'),
  body('resolutionMinutes').isInt({ min: 1, max: 525600 }).withMessage('Resolution target must be 1–525600 minutes.')
];

function notFound(res) {
  return res.status(404).render('errors/error', { title: 'Complaint not found', status: 404, message: 'The complaint could not be found.' });
}

async function complaintList(req, res) {
  const complaints = await Complaint.find().sort({ createdAt: -1 }).limit(200).populate('createdBy', 'name').populate('assignedTo', 'name');
  const technicians = await User.find({ role: 'TECHNICIAN', isActive: true }).select('name');
  res.render('admin/complaints', { title: 'All complaints', complaints, technicians });
}

async function assign(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return notFound(res);
  const complaint = await Complaint.findById(req.params.id);
  if (!complaint) return notFound(res);
  let technician;
  if (req.body.technicianId === 'recommend') technician = await recommendTechnician(complaint.category);
  else if (mongoose.isValidObjectId(req.body.technicianId)) technician = await User.findById(req.body.technicianId);
  if (!technician) {
    req.flash('error', 'No eligible technician was found. Check active staff and category support.');
    return res.redirect('/admin/complaints');
  }
  await assignComplaint(complaint, technician, req.user);
  req.flash('success', `${technician.name} assigned to the complaint.`);
  res.redirect(`/complaints/${complaint._id}`);
}

async function setPriority(req, res) {
  const errors = validationResult(req);
  if (!mongoose.isValidObjectId(req.params.id)) return notFound(res);
  const complaint = await Complaint.findById(req.params.id);
  if (!complaint) return notFound(res);
  if (!errors.isEmpty()) {
    req.flash('error', errors.array().map((item) => item.msg).join(' '));
    return res.redirect(`/complaints/${complaint._id}`);
  }
  await changePriority(complaint, req.body.priority, req.user);
  req.flash('success', 'Priority and SLA deadlines updated.');
  res.redirect(`/complaints/${complaint._id}`);
}

async function cancel(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return notFound(res);
  const complaint = await Complaint.findById(req.params.id);
  if (!complaint) return notFound(res);
  await transitionStatus(complaint, 'CANCELLED', req.user, 'Cancelled by administrator.');
  req.flash('success', 'Complaint cancelled.');
  res.redirect(`/complaints/${complaint._id}`);
}

async function createStaff(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const users = await User.find({ role: { $in: ['TECHNICIAN', 'ADMIN'] } }).select('name email role supportedCategories isAvailable isActive');
    return res.status(422).render('admin/staff', { title: 'Staff management', users, errors: errors.array().map((item) => item.msg) });
  }
  if (await User.exists({ email: req.body.email.toLowerCase() })) {
    const users = await User.find({ role: { $in: ['TECHNICIAN', 'ADMIN'] } }).select('name email role supportedCategories isAvailable isActive');
    return res.status(409).render('admin/staff', { title: 'Staff management', users, errors: ['An account with that email already exists.'] });
  }
  const bcrypt = require('bcrypt');
  const passwordHash = await bcrypt.hash(req.body.password, req.app.locals.config.bcryptRounds);
  const requestedCategories = Array.isArray(req.body.supportedCategories)
    ? req.body.supportedCategories
    : req.body.supportedCategories ? [req.body.supportedCategories] : [];
  const supportedCategories = req.body.role === 'TECHNICIAN'
    ? requestedCategories.filter((item) => ['AMENITIES', 'WATER', 'ELECTRICAL', 'CLEANING', 'SECURITY', 'IT', 'OTHER'].includes(item))
    : [];
  const user = await User.create({ name: req.body.name, email: req.body.email, passwordHash, role: req.body.role, supportedCategories });
  await recordAudit({ actor: req.user, action: 'STAFF_CREATED', entityType: 'User', entityId: user._id, details: { role: user.role } });
  req.flash('success', `${user.name} was added as ${user.role.toLowerCase()}.`);
  res.redirect('/admin/staff');
}

async function updateStaff(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return notFound(res);
  const staff = await User.findById(req.params.id);
  if (!staff || !['ADMIN', 'TECHNICIAN'].includes(staff.role) || String(staff._id) === String(req.user._id)) {
    req.flash('error', 'This staff account cannot be changed.');
    return res.redirect('/admin/staff');
  }
  const wasActive = staff.isActive;
  staff.isActive = req.body.isActive === 'true';
  staff.isAvailable = staff.role === 'TECHNICIAN' && req.body.isAvailable === 'true';
  if (req.body.password) {
    if (req.body.password.length < 10 || req.body.password.length > 128) {
      req.flash('error', 'A replacement password must be at least 10 characters.');
      return res.redirect('/admin/staff');
    }
    const bcrypt = require('bcrypt');
    staff.passwordHash = await bcrypt.hash(req.body.password, req.app.locals.config.bcryptRounds);
  }
  await staff.save();
  await recordAudit({ actor: req.user, action: 'STAFF_UPDATED', entityType: 'User', entityId: staff._id, details: { isActive: staff.isActive, isAvailable: staff.isAvailable } });
  if (wasActive && !staff.isActive) {
    const assigned = await Complaint.find({ assignedTo: staff._id, status: { $in: ['ASSIGNED', 'IN_PROGRESS', 'REOPENED'] } }).select('_id title createdBy');
    await Promise.all(assigned.map(async (item) => {
      await item.save();
      await ComplaintHistory.create({ complaint: item._id, actor: req.user._id, eventType: 'STAFF_DEACTIVATED', oldValue: String(staff._id), note: 'Assigned technician was deactivated; administrator reassignment is required.' });
      await notifyUser({ recipient: item.createdBy, complaint: item._id, type: 'ASSIGNEE_UNAVAILABLE', title: 'Complaint needs reassignment', message: `The technician assigned to ${item.title} is no longer active.` });
    }));
  }
  req.flash('success', `${staff.name}'s account was updated.`);
  res.redirect('/admin/staff');
}

async function updatePolicy(req, res) {
  const errors = validationResult(req);
  const priority = req.params.priority;
  if (!['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(priority)) {
    return res.status(404).render('errors/error', { title: 'Policy not found', status: 404, message: 'The SLA policy could not be found.' });
  }
  if (!errors.isEmpty()) {
    req.flash('error', errors.array().map((item) => item.msg).join(' '));
    return res.redirect('/admin/sla-policies');
  }
  const policy = await SLAPolicy.findOneAndUpdate(
    { priority },
    { responseMinutes: Number(req.body.responseMinutes), resolutionMinutes: Number(req.body.resolutionMinutes), isActive: req.body.isActive === 'true' },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );
  await recordAudit({ actor: req.user, action: 'SLA_POLICY_UPDATED', entityType: 'SLAPolicy', entityId: policy._id, details: { priority, responseMinutes: policy.responseMinutes, resolutionMinutes: policy.resolutionMinutes, isActive: policy.isActive } });
  req.flash('success', `${priority} SLA policy updated.`);
  res.redirect('/admin/sla-policies');
}

module.exports = { staffRules, priorityRules, policyRules, complaintList, assign, setPriority, cancel, createStaff, updateStaff, updatePolicy };
