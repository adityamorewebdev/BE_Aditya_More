require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connectDB } = require('./db');

const authRoutes = require('./routes/auth');
const missionsRoutes = require('./routes/missions');
const rewardsRoutes = require('./routes/rewards');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/missions', missionsRoutes);
app.use('/api/rewards', rewardsRoutes);

const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => {
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('DB connection failed:', err);
    process.exit(1);
  });
