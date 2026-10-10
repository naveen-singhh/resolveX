const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const asyncRoute = require('../middleware/asyncRoute');
const { requireRole } = require('../middleware/auth');
const dashboard = require('../controllers/dashboardController');
const complaintController = require('../controllers/complaintController');
const Complaint = require('../models/Complaint');
const ComplaintHistory = require('../models/ComplaintHistory');
const { transitionStatus } = require('../services/complaintService');

router.use(requireRole('TECHNICIAN'));
router.get('/dashboard', asyncRoute(dashboard.technicianDashboard));
router.post('/complaints/:id/start', asyncRoute(async (req, res) => {
  const complaint = mongoose.isValidObjectId(req.params.id) ? await Complaint.findById(req.params.id) : null;
  if (!complaint || String(complaint.assignedTo) !== String(req.user._id)) return res.status(404).render('errors/error', { title: 'Complaint not found', status: 404, message: 'The complaint could not be found.' });
  await transitionStatus(complaint, 'IN_PROGRESS', req.user, 'Technician started work.');
  await Complaint.updateOne({ _id: complaint._id, firstResponseAt: null }, { firstResponseAt: new Date() });
  await ComplaintHistory.create({ complaint: complaint._id, actor: req.user._id, eventType: 'FIRST_RESPONSE', note: 'Technician acknowledged the complaint.' });
  req.flash('success', 'Work started.');
  res.redirect(`/complaints/${complaint._id}`);
}));
router.post('/complaints/:id/resolve', body('resolutionSummary').trim().isLength({ min: 5, max: 2000 }).withMessage('Resolution summary must be 5–2000 characters.'), asyncRoute(async (req, res) => {
  const errors = validationResult(req);
  const complaint = mongoose.isValidObjectId(req.params.id) ? await Complaint.findById(req.params.id) : null;
  if (!complaint || String(complaint.assignedTo) !== String(req.user._id)) return res.status(404).render('errors/error', { title: 'Complaint not found', status: 404, message: 'The complaint could not be found.' });
  if (!errors.isEmpty()) {
    req.flash('error', errors.array().map((item) => item.msg).join(' '));
    return res.redirect(`/complaints/${complaint._id}`);
  }
  complaint.resolutionSummary = req.body.resolutionSummary;
  await transitionStatus(complaint, 'RESOLVED', req.user, req.body.resolutionSummary);
  await ComplaintHistory.create({ complaint: complaint._id, actor: req.user._id, eventType: 'RESOLUTION_DETAILS', newValue: req.body.resolutionSummary, note: req.body.resolutionSummary });
  req.flash('success', 'Complaint marked resolved.');
  res.redirect(`/complaints/${complaint._id}`);
}));
router.post('/complaints/:id/comments', complaintController.commentRules, asyncRoute(complaintController.technicianComment));

module.exports = router;
