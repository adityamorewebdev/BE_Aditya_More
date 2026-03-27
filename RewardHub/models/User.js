const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  uid:                { type: String, required: true, unique: true },
  playerNumber:       { type: Number, required: true, unique: true },
  displayName:        { type: String, required: true },
  email:              { type: String, required: true },
  photoURL:           { type: String },
  provider:           { type: String },
  coinBalance:        { type: Number, default: 0 },
  totalCoinsEarned:   { type: Number, default: 0 },
  streakCount:        { type: Number, default: 0 },
  bestStreak:         { type: Number, default: 0 },
  missionsCompleted:  { type: Number, default: 0 },
  lastClaimedAt:      { type: Date },
  createdAt:          { type: Date, default: Date.now },
}, { strict: true });

module.exports = mongoose.model('User', userSchema);
