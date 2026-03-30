const mongoose = require('mongoose');

// Gamification stats split out of the User document.
// Kept in a separate collection so the core identity record stays lean.
const userStatsSchema = new mongoose.Schema({
  uid:               { type: String, required: true, unique: true },
  coinBalance:       { type: Number, default: 0 },
  totalCoinsEarned:  { type: Number, default: 0 },
  streakCount:       { type: Number, default: 0 },
  bestStreak:        { type: Number, default: 0 },
  missionsCompleted: { type: Number, default: 0 },
  lastClaimedAt:     { type: Date },
}, { strict: true });

module.exports = mongoose.model('UserStats', userStatsSchema, 'user_stats');
