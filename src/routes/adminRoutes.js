const router = require('express').Router();
const { body } = require('express-validator');
const asyncRoute = require('../middleware/asyncRoute');
const { requireRole } = require('../middleware/auth');
const dashboard = require('../controllers/dashboardController');
const admin = require('../controllers/adminController');

router.use(requireRole('ADMIN'));
router.get('/dashboard', asyncRoute(dashboard.adminDashboard));
router.get('/complaints', asyncRoute(admin.complaintList));
router.post('/complaints/:id/assign', asyncRoute(admin.assign));
router.post('/complaints/:id/priority', admin.priorityRules, asyncRoute(admin.setPriority));
router.post('/complaints/:id/cancel', asyncRoute(admin.cancel));
router.get('/staff', asyncRoute(dashboard.staff));
router.post('/staff', admin.staffRules, asyncRoute(admin.createStaff));
router.post('/staff/:id', asyncRoute(admin.updateStaff));
router.get('/sla-policies', asyncRoute(dashboard.slaPolicies));
router.post('/sla-policies/:priority', admin.policyRules, asyncRoute(admin.updatePolicy));
router.get('/audit-logs', asyncRoute(dashboard.auditLogs));

module.exports = router;
