const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const GlobalConfig = require('../models/GlobalConfig');
const UserProgress = require('../models/UserProgress');
const UserStats = require('../models/UserStats');

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function isStreakAlive(lastClaimedAt, now) {
  if (!lastClaimedAt) return false;
  const d = new Date(lastClaimedAt);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  return isSameDay(d, now) || isSameDay(d, yesterday);
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

// GET /api/missions
router.get('/', verifyToken, async (req, res) => {
  try {
    const uid = req.user.uid;
    const [configs, stats] = await Promise.all([
      GlobalConfig.find({ category: 'mission' }).lean(),
      UserStats.findOne({ uid }).lean(),
    ]);

    const missions = configs.map(c => c.payload);
    const now = new Date();
    const streakAlive = isStreakAlive(stats?.lastClaimedAt, now);
    const streakCount = stats?.streakCount ?? 0;

    const results = await Promise.all(missions.map(async (m) => {
      const mp = await UserProgress.findOne({ uid, mission_name: m.mission_name });
      const isStreakMission = m.mission_name.toLowerCase().includes('streak');
      const isWeeklyMission = m.type === 'Weekly';

      let effectiveProgress;
      let effectiveCompleted;
      let effectiveRewardClaimed;

      if (isWeeklyMission) {
        const inCurrentWeek = mp?.weekOf && isSameWeek(mp.weekOf, now);
        if (!inCurrentWeek) {
          effectiveProgress = 0;
          effectiveCompleted = false;
          effectiveRewardClaimed = false;
        } else if (mp?.completed) {
          effectiveProgress = m.count;
          effectiveCompleted = true;
          effectiveRewardClaimed = mp.rewardClaimed ?? false;
        } else {
          effectiveProgress = mp?.progress ?? 0;
          effectiveCompleted = false;
          effectiveRewardClaimed = false;
        }
      } else {
        effectiveCompleted = mp?.completed ?? false;
        effectiveRewardClaimed = mp?.rewardClaimed ?? false;
        if (mp?.completed) {
          effectiveProgress = m.count;
        } else if (!streakAlive) {
          effectiveProgress = 0;
        } else if (isStreakMission) {
          effectiveProgress = Math.min(streakCount, m.count);
        } else {
          effectiveProgress = mp?.progress ?? 0;
        }
      }

      return {
        _id: m._id,
        Mission: m.Mission,
        count: m.count,
        type: m.type,
        reward: m.reward,
        Image: m.Image,
        mission_name: m.mission_name,
        progress: effectiveProgress,
        completed: effectiveCompleted,
        rewardClaimed: effectiveRewardClaimed,
      };
    }));
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/missions/claim/:mission_name
router.post('/claim/:mission_name', verifyToken, async (req, res) => {
  try {
    const { mission_name } = req.params;
    const uid = req.user.uid;

    const config = await GlobalConfig.findOne({ category: 'mission', key: mission_name }).lean();
    if (!config) return res.status(404).json({ error: 'Mission not found' });
    const mission = config.payload;

    const mp = await UserProgress.findOne({ uid, mission_name });
    if (!mp || !mp.completed) return res.status(400).json({ error: 'Mission not completed yet' });
    if (mp.rewardClaimed) return res.status(400).json({ error: 'Reward already claimed' });

    const coinsEarned = Number(mission.reward);
    mp.rewardClaimed = true;
    await mp.save();

    const stats = await UserStats.findOneAndUpdate(
      { uid },
      { $inc: { coinBalance: coinsEarned, totalCoinsEarned: coinsEarned, missionsCompleted: 1 } },
      { upsert: true, new: true }
    );

    res.json({ success: true, coinsEarned, newBalance: stats.coinBalance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
