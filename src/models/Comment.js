const mongoose = require('mongoose');
const commentSchema = new mongoose.Schema({
  complaint: { type: mongoose.Schema.Types.ObjectId, ref: 'Complaint', required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  message: { type: String, required: true, trim: true, minlength: 2, maxlength: 2000 }
}, { timestamps: true });
commentSchema.index({ complaint: 1, createdAt: 1 });
module.exports = mongoose.model('Comment', commentSchema);
