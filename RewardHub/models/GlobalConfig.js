const mongoose = require('mongoose');

// General-purpose config store. Each document has a category + unique key
// so different config types can coexist (e.g. 'mission', 'reward_tiers').
const globalConfigSchema = new mongoose.Schema({
  category:   { type: String, required: true },
  key:        { type: String, required: true },
  payload:    { type: mongoose.Schema.Types.Mixed, required: true },
  updatedAt:  { type: Date, default: Date.now },
}, { strict: true });

globalConfigSchema.index({ category: 1, key: 1 }, { unique: true });

module.exports = mongoose.model('GlobalConfig', globalConfigSchema, 'globalconfig');
