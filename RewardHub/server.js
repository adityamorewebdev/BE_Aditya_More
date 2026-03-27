require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connectDB } = require('./db');

const authRoutes = require('./routes/auth');
const missionsRoutes = require('./routes/missions');
const rewardsRoutes = require('./routes/rewards');
const leaderboardRoutes = require('./routes/leaderboard');
const gamesRoutes = require('./routes/games');

// Import models so Mongoose registers them before createCollection is called
const User = require('./models/User');
const UserOnboarding = require('./models/UserOnboarding');
const UserGamePreferences = require('./models/UserGamePreferences');
const GameSession = require('./models/GameSession');
const MissionProgress = require('./models/MissionProgress');
const Mission = require('./models/Mission');
const missionsData = require('./data/missions.json');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/missions', missionsRoutes);
app.use('/api/rewards', rewardsRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/games', gamesRoutes);

const PORT = process.env.PORT || 5000;

connectDB()
  .then(async () => {
    await Promise.all([
      User.createCollection(),
      UserOnboarding.createCollection(),
      UserGamePreferences.createCollection(),
      GameSession.createCollection(),
      MissionProgress.createCollection(),
      Mission.createCollection(),
    ]);
    await Promise.all(
      missionsData.map(m =>
        Mission.findOneAndUpdate({ mission_name: m.mission_name }, m, { upsert: true })
      )
    );
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('DB connection failed:', err);
    process.exit(1);
  });
