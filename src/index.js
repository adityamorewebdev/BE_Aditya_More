import "dotenv/config";
import express from "express";
import cors from "cors";
import connectDB from "./config/db.js";
import contactRoutes from "./routes/contacts.js";
import authRoutes from "./routes/auth.js";
import errorHandler from "./middleware/errorHandler.js";
import env from './config/env.js'
import { connectRedis } from './config/redis.js'
import { sessionMiddleware } from './config/session.js'
import passport from './config/passport.js'

const { PORT, CLIENT_URL } = env;
const app = express();

app.use(cors({
  origin: CLIENT_URL,
  credentials: true
}));

app.use(express.json());
app.use(sessionMiddleware)
app.use(passport.initialize())
app.use(passport.session())

app.use("/api/contacts", contactRoutes);
app.use("/api/auth", authRoutes);

app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

app.use(errorHandler);

connectRedis().then(()=>{
  console.log("Connected to Redis");
});
connectDB().then(() => {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});
