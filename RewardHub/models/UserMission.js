const mongoose = require('mongoose');

const userMissionSchema = new mongoose.Schema({
  uid:          { type: String, required: true },
  mission_name: { type: String, required: true },
  progress:     { type: Number, default: 0 },
  completed:    { type: Boolean, default: false },
  completedAt:  { type: Date },
  rewardClaimed:{ type: Boolean, default: false },
  claimedAt:    { type: Date },
  createdAt:    { type: Date, default: Date.now },
}, { strict: true });

module.exports = mongoose.model('UserMission', userMissionSchema, 'user_missions');
