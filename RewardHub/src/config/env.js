const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

function requireEnv(key) {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env variable: ${key}`);
  return value;
}

module.exports = {
  MONGODB_URI: requireEnv('MONGODB_URI'),
  MONGODB_DB_NAME: requireEnv('MONGODB_DB_NAME'),
};
