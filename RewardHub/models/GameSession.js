const mongoose = require('mongoose');

const gameSessionSchema = new mongoose.Schema({
  sessionId:     { type: String, required: true, unique: true },
  uid:           { type: String, required: true },
  gameType:      { type: String, required: true },
  metadata:      { type: Object },
  startedAt:     { type: Date, default: Date.now },
  completedAt:   { type: Date },
  status:        { type: String, default: 'active' },
  result:        { type: String },
  accuracy:      { type: Number },
  timeRemaining: { type: Number },
  coinsEarned:   { type: Number },
  rewardGranted: { type: Boolean, default: false },
});

module.exports = mongoose.model('GameSession', gameSessionSchema, 'game_sessions');
