const mongoose = require('mongoose');

// Stores one document per user per mission — written only when a mission is completed.
// Before inserting, always check for an existing email + mission_name pair and skip if found.
const missionSchema = new mongoose.Schema({
  email:        { type: String, required: true },
  status:       { type: String, default: 'claimed' },
  Amount:       { type: String, required: true },   // mission reward from GlobalConfig
  mission_name: { type: String, required: true },
  claimed_date: { type: Date, required: true },
}, { strict: true });

missionSchema.index({ email: 1, mission_name: 1 }, { unique: true });

module.exports = mongoose.model('Mission', missionSchema, 'missions');
