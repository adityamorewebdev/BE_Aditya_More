const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const User = require('../models/User');
const DailyReward = require('../models/DailyReward');
const Mission = require('../models/Mission');
const GlobalConfig = require('../models/GlobalConfig');

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

function getDayReward(cycleDay, rewards) {
  const entry = rewards.find(r => r.day === cycleDay);
  return entry ? entry.reward : 0;
}

// GET /api/rewards/daily-status
router.get('/daily-status', verifyToken, async (req, res) => {
  try {
    const user = await User.findOne({ uid: req.user.uid }).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const latest = await DailyReward.findOne({ email: user.email }).sort({ ClaimDate: -1 }).lean();
    const now = new Date();
    const canClaim = !latest || !isSameDay(new Date(latest.ClaimDate), now);

    let currentStreak = 0;
    let nextCycleDay = 1;
    if (latest) {
      const streakAlive = isSameDay(new Date(latest.ClaimDate), now) || isYesterday(new Date(latest.ClaimDate), now);
      if (streakAlive) {
        currentStreak = latest.streak;
        nextCycleDay = canClaim ? (latest.Day % 7) + 1 : latest.Day;
      }
    }

    const [configDoc, dailyAgg, missionAgg] = await Promise.all([
      GlobalConfig.findOne({ category: 'config', key: 'daily_rewards' }).lean(),
      DailyReward.aggregate([{ $match: { email: user.email } }, { $group: { _id: null, total: { $sum: '$Amount' } } }]),
      Mission.aggregate([{ $match: { email: user.email } }, { $group: { _id: null, total: { $sum: { $toDouble: '$Amount' } } } }]),
    ]);
    const rewards = configDoc?.payload?.rewards ?? [];
    const todayReward = getDayReward(nextCycleDay, rewards);
    const coinBalance = (dailyAgg[0]?.total ?? 0) + (missionAgg[0]?.total ?? 0);

    res.json({
      canClaim,
      streakCount: currentStreak,
      lastClaimedAt: latest?.ClaimDate ?? null,
      todayReward,
      coinBalance,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/rewards/claim-daily
router.post('/claim-daily', verifyToken, async (req, res) => {
  try {
    const uid = req.user.uid;
    const user = await User.findOne({ uid }).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    const email = user.email;

    const now = new Date();
    const latest = await DailyReward.findOne({ email }).sort({ ClaimDate: -1 }).lean();

    if (latest && isSameDay(new Date(latest.ClaimDate), now)) {
      return res.status(400).json({ error: 'Already claimed today' });
    }

    // Determine new streak and cycle day
    let newStreak;
    let newDay;
    if (!latest) {
      newStreak = 1;
      newDay = 1;
    } else if (isYesterday(new Date(latest.ClaimDate), now)) {
      newStreak = latest.streak + 1;
      newDay = (latest.Day % 7) + 1;
    } else {
      // Missed a day — reset streak and cycle
      newStreak = 1;
      newDay = 1;
    }

    // Load reward amount from GlobalConfig
    const configDoc = await GlobalConfig.findOne({ category: 'config', key: 'daily_rewards' }).lean();
    const rewards = configDoc?.payload?.rewards ?? [];
    const coinsEarned = getDayReward(newDay, rewards);

    await DailyReward.create({
      email,
      status: 'claimed',
      Day: newDay,
      ClaimDate: now,
      Amount: coinsEarned,
      streak: newStreak,
    });

    // ── Mission detection ─────────────────────────────────────────────────────
    const missionConfigDoc = await GlobalConfig.findOne({ category: 'config', key: 'missions' }).lean();
    const missionDefs = missionConfigDoc?.payload ?? [];

    const { start: weekStart, end: weekEnd } = getWeekBounds(now);
    const [totalClaims, weeklyCount] = await Promise.all([
      DailyReward.countDocuments({ email }),
      DailyReward.countDocuments({ email, ClaimDate: { $gte: weekStart, $lte: weekEnd } }),
    ]);

    const missionsUpdated = [];
    let missionCoins = 0;

    for (const mission of missionDefs) {
      // Each email+mission_name pair is written at most once
      const existing = await Mission.findOne({ email, mission_name: mission.mission_name }).lean();
      if (existing) continue;

      const isStreak = mission.mission_name.toLowerCase().includes('streak');
      const isWeekly = mission.type === 'Weekly';
      const count = isStreak ? newStreak : isWeekly ? weeklyCount : totalClaims;

      if (count >= mission.count) {
        await Mission.create({
          email,
          status: 'claimed',
          Amount: mission.reward,
          mission_name: mission.mission_name,
          claimed_date: now,
        });
        const coins = Number(mission.reward);
        missionCoins += coins;
        missionsUpdated.push(mission.mission_name);
      }
    }

    // Coin balance = aggregate of all DailyReward.Amount + Mission.Amount for this email
    const [dailyAgg, missionAgg] = await Promise.all([
      DailyReward.aggregate([{ $match: { email } }, { $group: { _id: null, total: { $sum: '$Amount' } } }]),
      Mission.aggregate([{ $match: { email } }, { $group: { _id: null, total: { $sum: { $toDouble: '$Amount' } } } }]),
    ]);
    const newBalance = (dailyAgg[0]?.total ?? 0) + (missionAgg[0]?.total ?? 0);

    res.json({ success: true, coinsEarned, missionCoins, newStreak, newBalance, missionsUpdated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
