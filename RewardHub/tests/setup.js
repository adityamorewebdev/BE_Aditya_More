const mongoose  = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const GlobalConfig = require('../models/GlobalConfig');
const User        = require('../models/User');
const DailyReward = require('../models/DailyReward');
const Mission     = require('../models/Mission');
const dailyRewardsData = require('../data/dailyrewards.json');
const missionsData     = require('../data/missions.json');

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

async function seedConfig() {
  await GlobalConfig.deleteMany({ category: 'config' });
  await GlobalConfig.insertMany([
    { category: 'config', key: 'daily_rewards', payload: dailyRewardsData, updatedAt: new Date() },
    { category: 'config', key: 'missions',      payload: missionsData,     updatedAt: new Date() },
  ]);
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
    DailyReward.deleteMany({ email: TEST_EMAIL }),
    Mission.deleteMany({ email: TEST_EMAIL }),
  ]);
}

module.exports = { TEST_UID, TEST_EMAIL, connectDB, disconnectDB, seedConfig, createTestUser, clearUserData };
