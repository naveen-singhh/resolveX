const router = require('express').Router();
const asyncRoute = require('../middleware/asyncRoute');
const { requireAuth } = require('../middleware/auth');
const notifications = require('../controllers/notificationController');

router.use(requireAuth);
router.get('/', asyncRoute(notifications.list));
router.post('/:id/read', asyncRoute(notifications.markRead));
router.post('/read-all', asyncRoute(notifications.markAllRead));

module.exports = router;
