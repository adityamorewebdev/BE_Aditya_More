const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const User = require('../models/User');
const DailyReward = require('../models/DailyReward');
const Mission = require('../models/Mission');

// GET /api/leaderboard
router.get('/', verifyToken, async (req, res) => {
  try {
    const [users, dailyAggAll, missionAggAll] = await Promise.all([
      User.find({}).select('uid email displayName playerNumber').lean(),
      DailyReward.aggregate([{ $group: { _id: '$email', coins: { $sum: '$Amount' } } }]),
      Mission.aggregate([{ $group: { _id: '$email', coins: { $sum: { $toDouble: '$Amount' } }, count: { $sum: 1 } } }]),
    ]);

    const dailyMap  = Object.fromEntries(dailyAggAll.map(d => [d._id, d.coins]));
    const missionMap = Object.fromEntries(missionAggAll.map(m => [m._id, { coins: m.coins, count: m.count }]));

    const sorted = users
      .map(u => {
        const dailyCoins   = dailyMap[u.email]    ?? 0;
        const missionData  = missionMap[u.email]  ?? { coins: 0, count: 0 };
        const coinBalance  = dailyCoins + missionData.coins;
        const missionsCompleted = missionData.count;
        return {
          uid:               u.uid,
          displayName:       u.displayName,
          playerNumber:      u.playerNumber,
          coinBalance,
          totalCoinsEarned:  coinBalance,
          missionsCompleted,
          score:             coinBalance + missionsCompleted * 100,
        };
      })
      .sort((a, b) => b.score - a.score);

    const ranked = sorted.map((u, i) => ({ ...u, rank: i + 1 }));
    const leaderboard = ranked.slice(0, 50);
    const me = ranked.find(u => u.uid === req.user.uid);
    const myRank = me?.rank ?? ranked.length + 1;

    const currentUser = me ? {
      rank:         me.rank,
      uid:          me.uid,
      playerNumber: me.playerNumber,
      displayName:  me.displayName,
      score:        me.score,
      coinBalance:  me.coinBalance,
    } : null;

    res.set('Cache-Control', 'no-store');
    res.json({ leaderboard, currentUser, myRank, myScore: me?.score ?? 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
