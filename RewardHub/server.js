require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connectDB } = require('./db');

const authRoutes = require('./routes/auth');
const missionsRoutes = require('./routes/missions');
const rewardsRoutes = require('./routes/rewards');
const leaderboardRoutes = require('./routes/leaderboard');
const gamesRoutes = require('./routes/games');
const debugRoutes = require('./routes/debug');

// Import models so Mongoose registers them before createCollection is called
const User = require('./models/User');
const UserOnboarding = require('./models/UserOnboarding');
const UserGamePreferences = require('./models/UserGamePreferences');
const DailyReward = require('./models/DailyReward');
const Mission = require('./models/Mission');
const GlobalConfig = require('./models/GlobalConfig');
const dailyRewardsData = require('./data/dailyrewards.json');
const missionsData = require('./data/missions.json');

const app = express();
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:5174'], credentials: true }));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/missions', missionsRoutes);
app.use('/api/rewards', rewardsRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/games', gamesRoutes);
app.use('/api/debug', debugRoutes);

const PORT = process.env.PORT || 5000;

connectDB()
  .then(async () => {
    await Promise.all([
      User.createCollection(),
      UserOnboarding.createCollection(),
      UserGamePreferences.createCollection(),
      DailyReward.createCollection(),
      Mission.createCollection(),
      GlobalConfig.createCollection(),
    ]);

    // Sync config into globalconfig as exactly two documents
    await Promise.all([
      GlobalConfig.findOneAndUpdate(
        { category: 'config', key: 'daily_rewards' },
        { category: 'config', key: 'daily_rewards', payload: dailyRewardsData, updatedAt: new Date() },
        { upsert: true }
      ),
      GlobalConfig.findOneAndUpdate(
        { category: 'config', key: 'missions' },
        { category: 'config', key: 'missions', payload: missionsData, updatedAt: new Date() },
        { upsert: true }
      ),
    ]);

    // Remove old per-mission documents left from previous schema
    await GlobalConfig.deleteMany({ category: 'mission' });

    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('DB connection failed:', err);
    process.exit(1);
  });
