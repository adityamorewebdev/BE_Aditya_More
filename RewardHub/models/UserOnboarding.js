const mongoose = require('mongoose');

const userOnboardingSchema = new mongoose.Schema({
  uid:         { type: String, required: true, unique: true, ref: 'User' },
  complete:    { type: Boolean, default: false },
  skipped:     { type: Boolean, default: false },
  completedAt: { type: Date },
  skippedAt:   { type: Date },
});

module.exports = mongoose.model('UserOnboarding', userOnboardingSchema);
