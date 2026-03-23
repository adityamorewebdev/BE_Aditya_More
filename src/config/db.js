import mongoose from "mongoose";
import config from "./env.js";

const { MONGODB_URI } = config;

async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('[MongoDB] Connected to Atlas')
  } catch (err) {
    console.error('[MongoDB] Connection failed:', err)
    process.exit(1)
  }

  mongoose.connection.on('disconnected', () => {
    console.warn('[MongoDB] Disconnected')
  })
}

export default connectDB;
