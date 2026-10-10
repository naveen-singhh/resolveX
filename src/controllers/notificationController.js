const mongoose = require('mongoose');
const Notification = require('../models/Notification');

async function list(req, res) {
  const notifications = await Notification.find({ recipient: req.user._id }).sort({ createdAt: -1 }).limit(100).populate('complaint', 'title');
  res.render('notifications/list', { title: 'Notifications', notifications });
}

async function markRead(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).render('errors/error', { title: 'Notification not found', status: 404, message: 'The notification could not be found.' });
  }
  const notification = await Notification.findOneAndUpdate({ _id: req.params.id, recipient: req.user._id }, { isRead: true }, { new: true });
  if (!notification) return res.status(404).render('errors/error', { title: 'Notification not found', status: 404, message: 'The notification could not be found.' });
  res.redirect(notification.complaint ? `/complaints/${notification.complaint}` : '/notifications');
}

async function markAllRead(req, res) {
  await Notification.updateMany({ recipient: req.user._id, isRead: false }, { isRead: true });
  req.flash('success', 'All notifications marked as read.');
  res.redirect('/notifications');
}

module.exports = { list, markRead, markAllRead };
