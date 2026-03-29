const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const Mission = require('../models/Mission');
const MissionProgress = require('../models/MissionProgress');
const User = require('../models/User');

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

// GET /api/missions
router.get('/', verifyToken, async (req, res) => {
  try {
    const uid = req.user.uid;
    const [missions, user] = await Promise.all([
      Mission.find({}),
      User.findOne({ uid }).select('lastClaimedAt streakCount').lean(),
    ]);

    const now = new Date();
    const streakAlive = isStreakAlive(user?.lastClaimedAt, now);
    const streakCount = user?.streakCount ?? 0;

    const results = await Promise.all(missions.map(async (m) => {
      const mp = await MissionProgress.findOne({ uid, mission_name: m.mission_name });
      const isStreakMission = m.mission_name.toLowerCase().includes('streak');
      const isStreakSensitive = m.type === 'Daily' || m.type === 'Weekly';

      let effectiveProgress;
      if (mp?.completed) {
        // Keep showing count/count until next claim resets it
        effectiveProgress = m.count;
      } else if (!streakAlive && isStreakSensitive) {
        effectiveProgress = 0;
      } else if (isStreakMission) {
        effectiveProgress = Math.min(streakCount, m.count);
      } else {
        effectiveProgress = mp?.progress ?? 0;
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
        completed: mp?.completed ?? false,
        rewardClaimed: mp?.rewardClaimed ?? false,
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

    const mission = await Mission.findOne({ mission_name });
    if (!mission) return res.status(404).json({ error: 'Mission not found' });

    const mp = await MissionProgress.findOne({ uid, mission_name });
    if (!mp || !mp.completed) return res.status(400).json({ error: 'Mission not completed yet' });
    if (mp.rewardClaimed) return res.status(400).json({ error: 'Reward already claimed' });

    const coinsEarned = Number(mission.reward);
    mp.rewardClaimed = true;
    mp.claimedAt = new Date();
    await mp.save();

    const user = await User.findOneAndUpdate(
      { uid },
      { $inc: { coinBalance: coinsEarned, totalCoinsEarned: coinsEarned, missionsCompleted: 1 } },
      { new: true }
    );

    res.json({ success: true, coinsEarned, newBalance: user.coinBalance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
