const mongoose = require('mongoose');

const missionSchema = new mongoose.Schema({
  Mission:      { type: String },
  count:        { type: Number },
  type:         { type: String },
  reward:       { type: String },
  Image:        { type: String },
  mission_name: { type: String },
}, { strict: true });

module.exports = mongoose.model('Mission', missionSchema, 'missions');
