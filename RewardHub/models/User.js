const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  uid:          { type: String, required: true, unique: true },
  playerNumber: { type: Number, required: true, unique: true },
  displayName:  { type: String, required: true },
  email:        { type: String, required: true },
  photoURL:     { type: String },
  provider:     { type: String },
  status:       { type: String, default: 'active' },  // 'active' | 'banned'
  createdAt:    { type: Date, default: Date.now },
}, { strict: true });

module.exports = mongoose.model('User', userSchema);
