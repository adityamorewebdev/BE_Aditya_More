const express = require('express');
const router = express.Router();
const { randomUUID } = require('crypto');
const verifyToken = require('../middleware/verifyToken');
const GameSession = require('../models/GameSession');
const UserStats = require('../models/UserStats');
const GlobalConfig = require('../models/GlobalConfig');
const UserProgress = require('../models/UserProgress');
const { getScorer } = require('../utils/scoring');
const { awardMission } = require('../utils/missionReward');

// POST /api/games/start
router.post('/start', verifyToken, async (req, res) => {
  try {
    const { gameType, metadata } = req.body;

    try {
      getScorer(gameType);
    } catch {
      return res.status(400).json({ error: `Unknown gameType: ${gameType}` });
    }

    const sessionId = randomUUID();
    await GameSession.create({
      sessionId,
      uid: req.user.uid,
      gameType,
      metadata,
      status: 'active',
    });

    res.json({ sessionId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/games/complete
router.post('/complete', verifyToken, async (req, res) => {
  try {
    const { sessionId, result, accuracy, timeRemaining } = req.body;

    const session = await GameSession.findOne({ sessionId });
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.uid !== req.user.uid) return res.status(403).json({ error: 'Forbidden' });

    const scorer = getScorer(session.gameType);
    if (!scorer.isValidSession(session)) {
      return res.status(400).json({ error: 'Session invalid or expired' });
    }

    if (result === 'failure') {
      session.status = 'completed';
      session.result = 'failure';
      session.completedAt = new Date();
      await session.save();
      return res.json({ success: false, coinsEarned: 0 });
    }

    const coinsEarned = scorer.calculateCoins(accuracy, timeRemaining);

    session.status = 'completed';
    session.result = result;
    session.completedAt = new Date();
    session.accuracy = accuracy;
    session.timeRemaining = timeRemaining;
    session.coinsEarned = coinsEarned;
    session.rewardGranted = true;
    await session.save();

    const stats = await UserStats.findOneAndUpdate(
      { uid: req.user.uid },
      { $inc: { coinBalance: coinsEarned, totalCoinsEarned: coinsEarned } },
      { upsert: true, new: true }
    );

    const configs = await GlobalConfig.find({ category: 'mission' }).lean();
    const missions = configs.map(c => c.payload);
    const missionsUpdated = [];
    let missionCoins = 0;

    for (const mission of missions) {
      if (mission.type !== session.gameType) continue;

      let mp = await UserProgress.findOne({ uid: req.user.uid, mission_name: mission.mission_name });
      if (!mp) {
        mp = new UserProgress({
          uid: req.user.uid,
          mission_name: mission.mission_name,
          type: mission.type,
          reward: mission.reward,
          count: mission.count,
        });
      }
      if (mp.completed) continue;

      mp.progress = (mp.progress ?? 0) + 1;
      if (mp.progress >= mission.count) {
        missionCoins += await awardMission(req.user.uid, mp, mission);
        missionsUpdated.push(mission.mission_name);
      } else {
        await mp.save();
      }
    }

    res.json({ success: true, coinsEarned, missionCoins, newBalance: stats.coinBalance + missionCoins, missionsUpdated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/games/history
router.get('/history', verifyToken, async (req, res) => {
  try {
    const sessions = await GameSession.find({ uid: req.user.uid })
      .sort({ startedAt: -1 })
      .select('gameType result coinsEarned accuracy completedAt');
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
