const mongoose  = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const GlobalConfig = require('../models/GlobalConfig');
const User        = require('../models/User');
const UserStats   = require('../models/UserStats');
const UserProgress = require('../models/UserProgress');
const DailyReward = require('../models/DailyReward');
const missionsData = require('../data/missions.json');

const TEST_UID   = 'test-uid-001';
const TEST_EMAIL = 'test@rewardhub.dev';

let mongoServer;

async function connectDB() {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
}

async function disconnectDB() {
  await mongoose.disconnect();
  await mongoServer.stop();
}

async function seedMissions() {
  await GlobalConfig.deleteMany({ category: 'mission' });
  await GlobalConfig.insertMany(
    missionsData.map(m => ({
      category: 'mission',
      key: m.mission_name,
      payload: m,
      updatedAt: new Date(),
    }))
  );
}

async function createTestUser() {
  await User.findOneAndUpdate(
    { uid: TEST_UID },
    { uid: TEST_UID, playerNumber: 9999, displayName: 'Test Player', email: TEST_EMAIL, provider: 'email', status: 'active' },
    { upsert: true }
  );
}

async function clearUserData() {
  await Promise.all([
    UserStats.deleteOne({ uid: TEST_UID }),
    UserProgress.deleteMany({ uid: TEST_UID }),
    DailyReward.deleteMany({ email: TEST_EMAIL }),
  ]);
}

module.exports = { TEST_UID, connectDB, disconnectDB, seedMissions, createTestUser, clearUserData };
