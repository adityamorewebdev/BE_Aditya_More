const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const User = require('../models/User');
const UserStats = require('../models/UserStats');

function rankScore(s) {
  return (s.totalCoinsEarned ?? 0) + (s.bestStreak ?? 0) * 50 + (s.missionsCompleted ?? 0) * 100;
}

// GET /api/leaderboard
router.get('/', verifyToken, async (req, res) => {
  try {
    const [users, allStats] = await Promise.all([
      User.find({}).select('uid displayName playerNumber').lean(),
      UserStats.find({}).lean(),
    ]);

    const statsMap = Object.fromEntries(allStats.map(s => [s.uid, s]));

    const sorted = users
      .map(u => {
        const s = statsMap[u.uid] ?? {};
        return {
          uid:               u.uid,
          displayName:       u.displayName,
          playerNumber:      u.playerNumber,
          coinBalance:       s.coinBalance       ?? 0,
          totalCoinsEarned:  s.totalCoinsEarned  ?? 0,
          streakCount:       s.streakCount       ?? 0,
          bestStreak:        s.bestStreak        ?? 0,
          missionsCompleted: s.missionsCompleted ?? 0,
          score: rankScore(s),
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
      streakCount:  me.streakCount,
      coinBalance:  me.coinBalance,
    } : null;

    res.set('Cache-Control', 'no-store');
    res.json({ leaderboard, currentUser, myRank, myScore: me?.score ?? 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
