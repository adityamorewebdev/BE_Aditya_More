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
const UserStats = require('./models/UserStats');
const UserOnboarding = require('./models/UserOnboarding');
const UserGamePreferences = require('./models/UserGamePreferences');
const GameSession = require('./models/GameSession');
const UserProgress = require('./models/UserProgress');
const GlobalConfig = require('./models/GlobalConfig');
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
      UserStats.createCollection(),
      UserOnboarding.createCollection(),
      UserGamePreferences.createCollection(),
      GameSession.createCollection(),
      UserProgress.createCollection(),
      GlobalConfig.createCollection(),
    ]);

    // Sync mission definitions into globalconfig
    await Promise.all(
      missionsData.map(m =>
        GlobalConfig.findOneAndUpdate(
          { category: 'mission', key: m.mission_name },
          { category: 'mission', key: m.mission_name, payload: m, updatedAt: new Date() },
          { upsert: true }
        )
      )
    );
    const activeNames = missionsData.map(m => m.mission_name);
    await GlobalConfig.deleteMany({ category: 'mission', key: { $nin: activeNames } });
    await UserProgress.deleteMany({ mission_name: { $nin: activeNames } });

    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('DB connection failed:', err);
    process.exit(1);
  });
