const mongoose = require('mongoose');

// Tracks each user's progress toward individual missions.
// Stores only the fields necessary for progress tracking plus
// the three mission-definition fields (type, reward, count) so
// the UI can render without always joining back to globalconfig.
const userProgressSchema = new mongoose.Schema({
  uid:           { type: String, required: true },
  mission_name:  { type: String, required: true },
  type:          { type: String, required: true },   // 'Daily' | 'Weekly'
  reward:        { type: String, required: true },   // coin amount string
  count:         { type: Number, required: true },   // completion threshold
  progress:      { type: Number, default: 0 },
  completed:     { type: Boolean, default: false },
  rewardClaimed: { type: Boolean, default: false },
  weekOf:        { type: Date },
}, { strict: true });

userProgressSchema.index({ uid: 1, mission_name: 1 }, { unique: true });

module.exports = mongoose.model('UserProgress', userProgressSchema, 'user_progress');
