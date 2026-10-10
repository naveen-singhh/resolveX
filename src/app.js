const path = require('path');
const express = require('express');
const methodOverride = require('method-override');
const cookieParser = require('cookie-parser');
const { createSessionMiddleware } = require('./config/session');
const { createCsrf } = require('./middleware/csrf');
const { flashMiddleware } = require('./middleware/flash');
const { loadCurrentUser } = require('./middleware/auth');
const { notFound, errorHandler } = require('./middleware/errors');
const asyncRoute = require('./middleware/asyncRoute');
const Notification = require('./models/Notification');

function createApp(config) {
  const app = express();
  const csrf = createCsrf(config);
  app.locals.config = config;
  if (config.nodeEnv === 'production') app.set('trust proxy', 1);
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.disable('x-powered-by');
  app.use(express.static(path.join(__dirname, 'public'), { maxAge: config.nodeEnv === 'production' ? '1d' : 0 }));
  app.use(express.urlencoded({ extended: false, limit: '20kb' }));
  app.use(cookieParser());
  app.use(methodOverride('_method'));
  const sessionMiddleware = createSessionMiddleware(config);
  app.use(sessionMiddleware);
  app.locals.sessionStore = sessionMiddleware.store;
  app.use(flashMiddleware);
  app.use(loadCurrentUser);
  app.use((req, res, next) => {
    req.session.csrfSessionInitialized = true;
    res.locals.csrfToken = csrf.generateCsrfToken(req, res);
    res.locals.unreadCount = 0;
    next();
  });
  app.use(asyncRoute(async (req, res, next) => {
    if (req.user) res.locals.unreadCount = await Notification.countDocuments({ recipient: req.user._id, isRead: false });
    next();
  }));
  app.use(csrf.doubleCsrfProtection);
  app.use('/', require('./routes/authRoutes'));
  app.use('/', require('./routes/complaintRoutes'));
  app.use('/technician', require('./routes/technicianRoutes'));
  app.use('/admin', require('./routes/adminRoutes'));
  app.use('/notifications', require('./routes/notificationRoutes'));
  app.get('/', (req, res) => res.redirect(req.user ? req.user.role === 'ADMIN' ? '/admin/dashboard' : req.user.role === 'TECHNICIAN' ? '/technician/dashboard' : '/dashboard' : '/login'));
  app.use(notFound);
  app.use(errorHandler);
  app.locals.csrf = csrf;
  return app;
}

module.exports = { createApp };
