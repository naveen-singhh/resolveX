const mongoose = require('mongoose');
const { body, validationResult } = require('express-validator');
const Complaint = require('../models/Complaint');
const ComplaintHistory = require('../models/ComplaintHistory');
const Comment = require('../models/Comment');
const User = require('../models/User');
const { createComplaint, findVisibleComplaint, transitionStatus, addComment } = require('../services/complaintService');

const complaintRules = [
  body('title').trim().isLength({ min: 5, max: 120 }).withMessage('Title must be 5–120 characters.'),
  body('description').trim().isLength({ min: 10, max: 5000 }).withMessage('Description must be 10–5000 characters.'),
  body('category').isIn(['AMENITIES', 'WATER', 'ELECTRICAL', 'CLEANING', 'SECURITY', 'IT', 'OTHER']).withMessage('Choose a valid category.'),
  body('location').trim().isLength({ min: 2, max: 120 }).withMessage('Enter a location between 2 and 120 characters.')
];
const commentRules = [body('message').trim().isLength({ min: 2, max: 2000 }).withMessage('Update must be 2–2000 characters.')];

function notFound(res) {
  return res.status(404).render('errors/error', { title: 'Complaint not found', status: 404, message: 'The complaint could not be found.' });
}

async function list(req, res) {
  const query = req.user.role === 'ADMIN' ? {} : req.user.role === 'TECHNICIAN' ? { assignedTo: req.user._id } : { createdBy: req.user._id };
  const filter = req.query.status && ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REOPENED', 'CANCELLED'].includes(req.query.status)
    ? { ...query, status: req.query.status } : query;
  const complaints = await Complaint.find(filter).sort({ createdAt: -1 }).limit(100).populate('createdBy', 'name').populate('assignedTo', 'name');
  res.render('complaints/list', { title: 'Complaints', complaints, selectedStatus: req.query.status || '' });
}

function newForm(req, res) {
  res.render('complaints/new', { title: 'New complaint', errors: [], values: {} });
}

async function create(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).render('complaints/new', { title: 'New complaint', errors: errors.array().map((item) => item.msg), values: req.body });
  const complaint = await createComplaint(req.body, req.user);
  req.flash('success', `Complaint ${complaint._id.toString().slice(-7).toUpperCase()} submitted.`);
  res.redirect(`/complaints/${complaint._id}`);
}

async function detail(req, res) {
  const complaint = await findVisibleComplaint(req.params.id, req.user);
  if (!complaint) return notFound(res);
  const [history, comments, technicians] = await Promise.all([
    ComplaintHistory.find({ complaint: complaint._id }).sort({ createdAt: 1 }).populate('actor', 'name role'),
    Comment.find({ complaint: complaint._id }).sort({ createdAt: 1 }).populate('author', 'name role'),
    req.user.role === 'ADMIN' ? User.find({ role: 'TECHNICIAN', isActive: true }).select('name supportedCategories isAvailable') : []
  ]);
  res.render('complaints/detail', { title: complaint.title, complaint, history, comments, technicians });
}

async function comment(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    req.flash('error', errors.array().map((item) => item.msg).join(' '));
    return res.redirect(`/complaints/${req.params.id}`);
  }
  const complaint = await findVisibleComplaint(req.params.id, req.user);
  if (!complaint) return notFound(res);
  await addComment(complaint, req.user, req.body.message);
  req.flash('success', 'Your update was added.');
  res.redirect(`/complaints/${complaint._id}`);
}

async function technicianComment(req, res) {
  const errors = validationResult(req);
  const complaint = mongoose.isValidObjectId(req.params.id) ? await Complaint.findById(req.params.id) : null;
  if (!complaint || String(complaint.assignedTo) !== String(req.user._id)) return notFound(res);
  if (!errors.isEmpty()) {
    req.flash('error', errors.array().map((item) => item.msg).join(' '));
    return res.redirect(`/complaints/${complaint._id}`);
  }
  await addComment(complaint, req.user, req.body.message);
  await ComplaintHistory.create({ complaint: complaint._id, actor: req.user._id, eventType: 'WORK_NOTE', note: req.body.message });
  req.flash('success', 'Progress note added.');
  res.redirect(`/complaints/${complaint._id}`);
}

async function reopen(req, res) {
  const complaint = await findVisibleComplaint(req.params.id, req.user);
  if (!complaint) return notFound(res);
  await transitionStatus(complaint, 'REOPENED', req.user, 'Student requested that this complaint be reopened.');
  req.flash('success', 'Complaint reopened for follow-up.');
  res.redirect(`/complaints/${complaint._id}`);
}

async function close(req, res) {
  const complaint = await findVisibleComplaint(req.params.id, req.user);
  if (!complaint) return notFound(res);
  await transitionStatus(complaint, 'CLOSED', req.user, 'Student confirmed resolution.');
  req.flash('success', 'Resolution confirmed. The complaint is closed.');
  res.redirect(`/complaints/${complaint._id}`);
}

async function dashboard(req, res) {
  const filter = { createdBy: req.user._id };
  const [total, open, resolved, recent] = await Promise.all([
    Complaint.countDocuments(filter),
    Complaint.countDocuments({ ...filter, status: { $in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'REOPENED'] } }),
    Complaint.countDocuments({ ...filter, status: { $in: ['RESOLVED', 'CLOSED'] } }),
    Complaint.find(filter).sort({ createdAt: -1 }).limit(6).populate('assignedTo', 'name')
  ]);
  res.render('student/dashboard', { title: 'Student dashboard', stats: { total, open, resolved }, complaints: recent });
}

module.exports = { complaintRules, commentRules, list, newForm, create, detail, comment, technicianComment, reopen, close, dashboard };
