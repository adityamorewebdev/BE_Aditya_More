const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const User = require('../models/User');

function rankScore(u) {
  return (u.totalCoinsEarned ?? 0) + (u.bestStreak ?? 0) * 50 + (u.missionsCompleted ?? 0) * 100;
}

// GET /api/leaderboard
router.get('/', verifyToken, async (req, res) => {
  try {
    const all = await User.find({})
      .select('uid displayName playerNumber totalCoinsEarned bestStreak missionsCompleted')
      .lean();

    const sorted = all
      .map(u => ({ ...u, score: rankScore(u) }))
      .sort((a, b) => b.score - a.score);

    const ranked = sorted.map((u, i) => ({ ...u, rank: i + 1 }));

    const leaderboard = ranked.slice(0, 50);
    const me = ranked.find(u => u.uid === req.user.uid);
    const myRank = me?.rank ?? ranked.length + 1;

    res.json({ leaderboard, myRank, myScore: me?.score ?? 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
