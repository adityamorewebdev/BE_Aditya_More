const express = require('express');
const router = express.Router();
const { randomUUID } = require('crypto');
const verifyToken = require('../middleware/verifyToken');
const DailyReward = require('../models/DailyReward');
const Mission = require('../models/Mission');
const User = require('../models/User');
const { getScorer } = require('../utils/scoring');

// POST /api/games/start
// Returns a session ID for the client to reference on completion (stateless — not persisted).
router.post('/start', verifyToken, async (req, res) => {
  try {
    const { gameType } = req.body;
    try {
      getScorer(gameType);
    } catch {
      return res.status(400).json({ error: `Unknown gameType: ${gameType}` });
    }
    res.json({ sessionId: randomUUID() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/games/complete
router.post('/complete', verifyToken, async (req, res) => {
  try {
    const { gameType, result, accuracy, timeRemaining } = req.body;

    if (result === 'failure') {
      return res.json({ success: false, coinsEarned: 0 });
    }

    const scorer = getScorer(gameType ?? 'dalgona');
    const coinsEarned = scorer.calculateCoins(accuracy, timeRemaining);

    // Coin balance = aggregate from dailyrewards + missions only (per spec)
    const user = await User.findOne({ uid: req.user.uid }).lean();
    const email = user?.email;
    const [dailyAgg, missionAgg] = await Promise.all([
      DailyReward.aggregate([{ $match: { email } }, { $group: { _id: null, total: { $sum: '$Amount' } } }]),
      Mission.aggregate([{ $match: { email } }, { $group: { _id: null, total: { $sum: { $toDouble: '$Amount' } } } }]),
    ]);
    const newBalance = (dailyAgg[0]?.total ?? 0) + (missionAgg[0]?.total ?? 0);

    res.json({ success: true, coinsEarned, missionCoins: 0, newBalance, missionsUpdated: [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
