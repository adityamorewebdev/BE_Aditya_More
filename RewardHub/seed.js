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

function toDateFields(doc, fields) {
  const out = { ...doc };
  for (const f of fields) {
    if (out[f]) out[f] = new Date(out[f]);
  }
  return out;
}

async function run() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  const missionsPath = path.join(__dirname, 'data', 'missions.json');
  const dailyRewardsPath = path.join(__dirname, 'data', 'dailyrewards.json');

  const missions = loadJson(missionsPath);
  const dailyrewardsRaw = loadJson(dailyRewardsPath);
  const dailyrewards = dailyrewardsRaw.map((d) =>
    toDateFields(d, ['claimedAt', 'createdAt', 'updatedAt'])
  );

  if (missions.length) {
    await db.collection('missions').deleteMany({});
    await db.collection('missions').insertMany(missions);
  }

  if (dailyrewards.length) {
    await db.collection('dailyrewards').deleteMany({});
    await db.collection('dailyrewards').insertMany(dailyrewards);
  }

  await client.close();
  console.log('Seed complete');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
