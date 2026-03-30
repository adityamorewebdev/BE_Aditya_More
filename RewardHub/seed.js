const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const MONGO_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB_NAME;

function loadJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

async function run() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  const missions = loadJson(path.join(__dirname, 'data', 'missions.json'));
  const dailyRewards = loadJson(path.join(__dirname, 'data', 'dailyrewards.json'));

  // Seed globalconfig with exactly two documents: one for daily_rewards, one for missions
  await db.collection('globalconfig').deleteMany({ category: 'config' });
  await db.collection('globalconfig').insertMany([
    {
      category: 'config',
      key: 'daily_rewards',
      payload: dailyRewards,
      updatedAt: new Date(),
    },
    {
      category: 'config',
      key: 'missions',
      payload: missions,
      updatedAt: new Date(),
    },
  ]);

  await client.close();
  console.log('Seed complete');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
