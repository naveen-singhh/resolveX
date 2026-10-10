const User = require('../models/User');
const asyncRoute = require('./asyncRoute');

const loadCurrentUser = asyncRoute(async (req, res, next) => {
  if (!req.session.userId) {
    res.locals.currentUser = null;
    return next();
  }
  const user = await User.findById(req.session.userId).select('name email role isActive supportedCategories isAvailable');
  if (!user || !user.isActive) {
    await new Promise((resolve, reject) => req.session.destroy((error) => error ? reject(error) : resolve()));
    res.clearCookie('resolvex.sid');
    next();
    return;
  }
  req.user = user;
  res.locals.currentUser = user;
  next();
});

function requireAuth(req, res, next) {
  if (req.user) return next();
  req.flash('error', 'Please sign in to continue.');
  return res.redirect('/login');
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return requireAuth(req, res, next);
    if (!roles.includes(req.user.role)) return res.status(403).render('errors/error', { title: 'Access denied', status: 403, message: 'You do not have permission to access this page.' });
    next();
  };
}

module.exports = { loadCurrentUser, requireAuth, requireRole };
