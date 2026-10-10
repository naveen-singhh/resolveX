const router = require('express').Router();
const asyncRoute = require('../middleware/asyncRoute');
const auth = require('../middleware/auth');
const complaint = require('../controllers/complaintController');

router.get('/dashboard', auth.requireRole('STUDENT'), asyncRoute(complaint.dashboard));
router.get('/complaints', auth.requireAuth, asyncRoute(complaint.list));
router.get('/complaints/new', auth.requireRole('STUDENT'), complaint.newForm);
router.post('/complaints', auth.requireRole('STUDENT'), complaint.complaintRules, asyncRoute(complaint.create));
router.get('/complaints/:id', auth.requireAuth, asyncRoute(complaint.detail));
router.post('/complaints/:id/comments', auth.requireRole('STUDENT', 'ADMIN'), complaint.commentRules, asyncRoute(complaint.comment));
router.post('/complaints/:id/reopen', auth.requireRole('STUDENT'), asyncRoute(complaint.reopen));
router.post('/complaints/:id/close', auth.requireRole('STUDENT'), asyncRoute(complaint.close));

module.exports = router;
