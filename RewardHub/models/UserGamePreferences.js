const mongoose = require('mongoose');

const userGamePreferencesSchema = new mongoose.Schema({
  uid:         { type: String, required: true, unique: true, ref: 'User' },
  preferences: { type: [String], default: [] },
});

module.exports = mongoose.model('UserGamePreferences', userGamePreferencesSchema);
