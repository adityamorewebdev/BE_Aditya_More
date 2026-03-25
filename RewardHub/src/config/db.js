const { MongoClient } = require('mongodb');
const config = require('./env');

const { MONGODB_URI, MONGODB_DB_NAME } = config;

let client;
let db;

async function connectDB() {
  if (db) return db;
  client = new MongoClient(MONGODB_URI);
  await client.connect();
  db = client.db(MONGODB_DB_NAME);
  return db;
}

async function closeDB() {
  if (client) await client.close();
  client = null;
  db = null;
}

module.exports = { connectDB, closeDB };
