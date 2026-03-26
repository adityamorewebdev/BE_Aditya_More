const mongoose = require('mongoose');

const dailyRewardSchema = new mongoose.Schema({
  email:     { type: String },
  day:       { type: Number },
  reward:    { type: Number },
  claimedAt: { type: Date },
  status:    { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { strict: true });

module.exports = mongoose.model('DailyReward', dailyRewardSchema, 'dailyrewards');
