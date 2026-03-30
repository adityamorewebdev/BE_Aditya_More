const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const User = require('../models/User');
const UserStats = require('../models/UserStats');
const DailyReward = require('../models/DailyReward');
const UserProgress = require('../models/UserProgress');
const GlobalConfig = require('../models/GlobalConfig');
const { awardMission } = require('../utils/missionReward');

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

function isYesterday(date, now) {
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  return isSameDay(date, yesterday);
}

function getWeekStart(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d;
}

function isSameWeek(a, b) {
  return getWeekStart(a).getTime() === getWeekStart(b).getTime();
}

function isStreakAlive(lastClaimedAt, now) {
  if (!lastClaimedAt) return false;
  const d = new Date(lastClaimedAt);
  return isSameDay(d, now) || isYesterday(d, now);
}

// GET /api/rewards/daily-status
router.get('/daily-status', verifyToken, async (req, res) => {
  try {
    const stats = await UserStats.findOne({ uid: req.user.uid }).lean();

    const now = new Date();
    const canClaim = !stats?.lastClaimedAt || !isSameDay(new Date(stats.lastClaimedAt), now);
    const effectiveStreak = isStreakAlive(stats?.lastClaimedAt, now) ? (stats?.streakCount ?? 0) : 0;
    const nextStreakDay = effectiveStreak + 1;
    const todayReward = getTodayReward(nextStreakDay);

    res.json({
      canClaim,
      streakCount: effectiveStreak,
      lastClaimedAt: stats?.lastClaimedAt ?? null,
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
    const [user, stats] = await Promise.all([
      User.findOne({ uid }).lean(),
      UserStats.findOne({ uid }).lean(),
    ]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const now = new Date();

    if (stats?.lastClaimedAt && isSameDay(new Date(stats.lastClaimedAt), now)) {
      return res.status(400).json({ error: 'Already claimed today' });
    }

    let newStreak;
    if (!stats?.lastClaimedAt) {
      newStreak = 1;
    } else if (isYesterday(new Date(stats.lastClaimedAt), now)) {
      newStreak = (stats.streakCount ?? 0) + 1;
    } else {
      newStreak = 1;
    }

    const coinsEarned = getTodayReward(newStreak);
    const currentBalance = stats?.coinBalance ?? 0;
    const newBalance = currentBalance + coinsEarned;

    await DailyReward.create({
      email: user.email,
      day: newStreak,
      reward: coinsEarned,
      claimedAt: now,
      status: 'claimed',
      createdAt: now,
      updatedAt: now,
    });

    await UserStats.findOneAndUpdate(
      { uid },
      {
        streakCount: newStreak,
        lastClaimedAt: now,
        coinBalance: newBalance,
        $inc: { totalCoinsEarned: coinsEarned },
        $max: { bestStreak: newStreak },
      },
      { upsert: true }
    );

    const configs = await GlobalConfig.find({ category: 'mission' }).lean();
    const missions = configs.map(c => c.payload);
    const missionsUpdated = [];
    let missionCoins = 0;
    const streakBroke = !!(stats?.lastClaimedAt && !isYesterday(new Date(stats.lastClaimedAt), now));
    const currentWeekStart = getWeekStart(now);

    for (const mission of missions) {
      let mp = await UserProgress.findOne({ uid, mission_name: mission.mission_name });
      if (!mp) {
        mp = new UserProgress({
          uid,
          mission_name: mission.mission_name,
          type: mission.type,
          reward: mission.reward,
          count: mission.count,
        });
      }

      const isWeeklyMission = mission.type === 'Weekly';
      const isStreakMission = mission.mission_name.toLowerCase().includes('streak');

      if (isWeeklyMission) {
        const inCurrentWeek = mp.weekOf && isSameWeek(mp.weekOf, now);
        if (!inCurrentWeek) {
          mp.progress = 0;
          mp.completed = false;
          mp.rewardClaimed = false;
          mp.weekOf = currentWeekStart;
        }
        if (mp.completed) {
          await mp.save();
          continue;
        }
        mp.progress = (mp.progress ?? 0) + 1;
      } else {
        if (mp.completed && mp.rewardClaimed) {
          mp.progress = 0;
          mp.completed = false;
          mp.rewardClaimed = false;
        }
        if (streakBroke) mp.progress = 0;
        if (mp.completed) {
          await mp.save();
          continue;
        }
        if (isStreakMission) {
          mp.progress = newStreak;
        } else {
          mp.progress = (mp.progress ?? 0) + 1;
        }
      }

      if (mp.progress >= mission.count) {
        missionCoins += await awardMission(uid, mp, mission);
        missionsUpdated.push(mission.mission_name);
      } else {
        await mp.save();
      }
    }

    res.json({ success: true, coinsEarned, missionCoins, newStreak, newBalance: newBalance + missionCoins, missionsUpdated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
