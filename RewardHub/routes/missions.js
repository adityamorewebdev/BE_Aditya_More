const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const GlobalConfig = require('../models/GlobalConfig');
const DailyReward = require('../models/DailyReward');
const Mission = require('../models/Mission');
const User = require('../models/User');

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isYesterday(date, now) {
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  return isSameDay(date, yesterday);
}

function getWeekBounds(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { start: monday, end: sunday };
}

// GET /api/missions
router.get('/', verifyToken, async (req, res) => {
  try {
    const user = await User.findOne({ uid: req.user.uid }).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    const email = user.email;
    const now = new Date();

    const [missionConfigDoc, latestReward, completedMissions] = await Promise.all([
      GlobalConfig.findOne({ category: 'config', key: 'missions' }).lean(),
      DailyReward.findOne({ email }).sort({ ClaimDate: -1 }).lean(),
      Mission.find({ email }).lean(),
    ]);

    const missionDefs = missionConfigDoc?.payload ?? [];
    const completedSet = new Set(completedMissions.map(m => m.mission_name));

    // Current streak — alive only if last claim was today or yesterday
    let currentStreak = 0;
    if (latestReward) {
      const streakAlive = isSameDay(new Date(latestReward.ClaimDate), now) || isYesterday(new Date(latestReward.ClaimDate), now);
      currentStreak = streakAlive ? latestReward.streak : 0;
    }

    const { start: weekStart, end: weekEnd } = getWeekBounds(now);
    const [totalClaims, weeklyCount] = await Promise.all([
      DailyReward.countDocuments({ email }),
      DailyReward.countDocuments({ email, ClaimDate: { $gte: weekStart, $lte: weekEnd } }),
    ]);

    const results = missionDefs.map(m => {
      const completed = completedSet.has(m.mission_name);
      const isStreak = m.mission_name.toLowerCase().includes('streak');
      const isWeekly = m.type === 'Weekly';

      let progress;
      if (completed) {
        progress = m.count;
      } else if (isStreak) {
        progress = Math.min(currentStreak, m.count);
      } else if (isWeekly) {
        progress = Math.min(weeklyCount, m.count);
      } else {
        progress = Math.min(totalClaims, m.count);
      }

      return {
        Mission: m.Mission,
        count: m.count,
        type: m.type,
        reward: m.reward,
        Image: m.Image,
        mission_name: m.mission_name,
        progress,
        completed,
        rewardClaimed: completed,
      };
    });

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
