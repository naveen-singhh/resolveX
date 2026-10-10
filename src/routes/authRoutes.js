const router = require('express').Router();
const asyncRoute = require('../middleware/asyncRoute');
const auth = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');

router.get('/register', (req, res) => auth.showRegister(req, res));
router.post('/register', auth.registerRules, asyncRoute(auth.register));
router.get('/login', (req, res) => auth.showLogin(req, res));
router.post('/login', auth.loginThrottle, auth.loginRules, asyncRoute(auth.login));
router.post('/logout', requireAuth, auth.logout);

module.exports = router;
