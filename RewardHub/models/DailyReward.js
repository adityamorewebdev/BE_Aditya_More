const mongoose = require('mongoose');

const dailyRewardSchema = new mongoose.Schema({
  email:     { type: String, required: true },
  status:    { type: String, default: 'claimed' },
  Day:       { type: Number, required: true },   // cycle day 1–7; resets after day 7 or missed claim
  ClaimDate: { type: Date, required: true },
  Amount:    { type: Number, required: true },   // coin reward for this Day (from GlobalConfig)
  streak:    { type: Number, required: true },   // consecutive claim count; only resets on missed day
}, { strict: true });

module.exports = mongoose.model('DailyReward', dailyRewardSchema, 'dailyrewards');
