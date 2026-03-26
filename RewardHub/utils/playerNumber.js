const User = require('../models/User');

async function generateUniquePlayerNumber() {
  const num = Math.floor(Math.random() * 9000) + 1000;
  const exists = await User.findOne({ playerNumber: num });
  if (exists) return generateUniquePlayerNumber();
  return num;
}

module.exports = { generateUniquePlayerNumber };
