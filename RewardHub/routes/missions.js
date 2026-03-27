const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const Mission = require('../models/Mission');
const UserMission = require('../models/UserMission');
const User = require('../models/User');

// GET /api/missions
router.get('/', verifyToken, async (req, res) => {
  try {
    const uid = req.user.uid;
    const missions = await Mission.find({});
    const results = await Promise.all(missions.map(async (m) => {
      const um = await UserMission.findOne({ uid, mission_name: m.mission_name });
      return {
        _id: m._id,
        Mission: m.Mission,
        count: m.count,
        type: m.type,
        reward: m.reward,
        Image: m.Image,
        mission_name: m.mission_name,
        progress: um?.progress ?? 0,
        completed: um?.completed ?? false,
        rewardClaimed: um?.rewardClaimed ?? false,
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

    const um = await UserMission.findOne({ uid, mission_name });
    if (!um || !um.completed) return res.status(400).json({ error: 'Mission not completed yet' });
    if (um.rewardClaimed) return res.status(400).json({ error: 'Reward already claimed' });

    const coinsEarned = Number(mission.reward);
    um.rewardClaimed = true;
    um.claimedAt = new Date();
    await um.save();

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
