const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');

const attempts = new Map();
const windowMs = 15 * 60 * 1000;
const maxAttempts = 10;

function loginThrottle(req, res, next) {
  const key = req.ip;
  const now = Date.now();
  const record = attempts.get(key);
  if (record && record.resetAt <= now) attempts.delete(key);
  const current = attempts.get(key);
  if (current && current.count >= maxAttempts) {
    return res.status(429).render('auth/login', { title: 'Sign in', errors: ['Too many attempts. Please wait 15 minutes and try again.'], email: '' });
  }
  next();
}

const registerRules = [
  body('name').trim().isLength({ min: 2, max: 80 }).withMessage('Name must be between 2 and 80 characters.'),
  body('email').trim().isEmail().normalizeEmail().withMessage('Enter a valid email address.'),
  body('password').isLength({ min: 10, max: 128 }).withMessage('Password must be at least 10 characters.')
];
const loginRules = [
  body('email').trim().isEmail().normalizeEmail().withMessage('Enter a valid email address.'),
  body('password').isLength({ min: 1, max: 128 }).withMessage('Enter your password.')
];

function showRegister(req, res) {
  res.render('auth/register', { title: 'Create account', errors: [], values: {} });
}

async function register(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).render('auth/register', { title: 'Create account', errors: errors.array().map((item) => item.msg), values: req.body });
  const email = req.body.email.toLowerCase();
  if (await User.exists({ email })) return res.status(409).render('auth/register', { title: 'Create account', errors: ['An account with that email already exists.'], values: { name: req.body.name, email } });
  const passwordHash = await bcrypt.hash(req.body.password, req.app.locals.config.bcryptRounds);
  await User.create({ name: req.body.name, email, passwordHash, role: 'STUDENT' });
  req.flash('success', 'Your student account is ready. Please sign in.');
  res.redirect('/login');
}

function showLogin(req, res) {
  res.render('auth/login', { title: 'Sign in', errors: [], email: '' });
}

async function login(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).render('auth/login', { title: 'Sign in', errors: errors.array().map((item) => item.msg), email: req.body.email || '' });
  const key = req.ip;
  const current = attempts.get(key) || { count: 0, resetAt: Date.now() + windowMs };
  const user = await User.findOne({ email: req.body.email.toLowerCase() }).select('+passwordHash');
  const valid = user && user.isActive && await bcrypt.compare(req.body.password, user.passwordHash);
  if (!valid) {
    current.count += 1;
    attempts.set(key, current);
    return res.status(401).render('auth/login', { title: 'Sign in', errors: ['Email or password is incorrect.'], email: req.body.email });
  }
  attempts.delete(key);
  await new Promise((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()));
  req.session.userId = String(user._id);
  req.flash('success', `Welcome back, ${user.name}.`);
  res.redirect(user.role === 'ADMIN' ? '/admin/dashboard' : user.role === 'TECHNICIAN' ? '/technician/dashboard' : '/dashboard');
}

function logout(req, res, next) {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie('resolvex.sid');
    res.redirect('/login');
  });
}

module.exports = { registerRules, loginRules, loginThrottle, showRegister, register, showLogin, login, logout };
