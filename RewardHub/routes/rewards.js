const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const User = require('../models/User');
const DailyReward = require('../models/DailyReward');
const UserMission = require('../models/UserMission');
const Mission = require('../models/Mission');

function getTodayReward(streakDay) {
  const day = ((streakDay - 1) % 7) + 1;
  if (day <= 4) return 25;
  if (day <= 6) return 75;
  return 150;
}

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// GET /api/rewards/daily-status
router.get('/daily-status', verifyToken, async (req, res) => {
  try {
    const user = await User.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const now = new Date();
    const canClaim = !user.lastClaimedAt || !isSameDay(new Date(user.lastClaimedAt), now);
    const nextStreakDay = (user.streakCount ?? 0) + 1;
    const todayReward = getTodayReward(nextStreakDay);

    res.json({
      canClaim,
      streakCount: user.streakCount ?? 0,
      lastClaimedAt: user.lastClaimedAt,
      todayReward,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/rewards/claim-daily
router.post('/claim-daily', verifyToken, async (req, res) => {
  try {
    const uid = req.user.uid;
    const user = await User.findOne({ uid });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const now = new Date();

    if (user.lastClaimedAt && isSameDay(new Date(user.lastClaimedAt), now)) {
      return res.status(400).json({ error: 'Already claimed today' });
    }

    // Determine new streak
    let newStreak;
    if (!user.lastClaimedAt) {
      newStreak = 1;
    } else {
      const hoursSince = (now - new Date(user.lastClaimedAt)) / (1000 * 60 * 60);
      newStreak = hoursSince > 24 ? 1 : (user.streakCount ?? 0) + 1;
    }

    const coinsEarned = getTodayReward(newStreak);
    const newBalance = (user.coinBalance ?? 0) + coinsEarned;

    await DailyReward.create({
      email: user.email,
      day: newStreak,
      reward: coinsEarned,
      claimedAt: now,
      status: 'claimed',
      createdAt: now,
      updatedAt: now,
    });

    await User.findOneAndUpdate(
      { uid },
      {
        streakCount: newStreak,
        lastClaimedAt: now,
        coinBalance: newBalance,
        $inc: { totalCoinsEarned: coinsEarned },
        $max: { bestStreak: newStreak },
      }
    );

    // Update missions
    const missions = await Mission.find({});
    const missionsUpdated = [];

    for (const mission of missions) {
      let um = await UserMission.findOne({ uid, mission_name: mission.mission_name });
      if (!um) {
        um = new UserMission({ uid, mission_name: mission.mission_name });
      }
      if (um.completed) continue;

      const isStreakMission = mission.mission_name.toLowerCase().includes('streak');

      if (isStreakMission) {
        um.progress = newStreak;
      } else {
        um.progress = (um.progress ?? 0) + 1;
      }

      if (um.progress >= mission.count) {
        um.completed = true;
        um.completedAt = now;
        if (!um.rewardClaimed) missionsUpdated.push(mission.mission_name);
      }

      await um.save();
    }

    res.json({ success: true, coinsEarned, newStreak, newBalance, missionsUpdated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
