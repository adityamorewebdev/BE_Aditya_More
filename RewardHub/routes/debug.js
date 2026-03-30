const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const UserStats = require('../models/UserStats');
const UserProgress = require('../models/UserProgress');
const GlobalConfig = require('../models/GlobalConfig');
const { awardMission } = require('../utils/missionReward');

if (process.env.NODE_ENV === 'production') {
  router.use((req, res) => res.status(404).json({ error: 'Not found' }));
  module.exports = router;
  return;
}

// POST /api/debug/shift-claim?days=-1
router.post('/shift-claim', verifyToken, async (req, res) => {
  const uid = req.user.uid;
  const days = parseInt(req.query.days ?? '-1', 10);

  if (days === 0) {
    await UserStats.findOneAndUpdate({ uid }, { $unset: { lastClaimedAt: '' } }, { upsert: true });
    return res.json({ message: 'lastClaimedAt cleared' });
  }

  const shifted = new Date();
  shifted.setDate(shifted.getDate() + days);
  await UserStats.findOneAndUpdate({ uid }, { lastClaimedAt: shifted }, { upsert: true });

  res.json({
    message: `lastClaimedAt set to ${shifted.toISOString()} (${Math.abs(days)} day(s) ago)`,
    nextClaimWillBreakStreak: days < -1,
  });
});

// POST /api/debug/reset-missions
router.post('/reset-missions', verifyToken, async (req, res) => {
  const uid = req.user.uid;
  const [result] = await Promise.all([
    UserProgress.deleteMany({ uid }),
    UserStats.findOneAndUpdate({ uid }, { streakCount: 0, bestStreak: 0, $unset: { lastClaimedAt: '' } }, { upsert: true }),
  ]);
  res.json({ message: `Deleted ${result.deletedCount} progress record(s), streak reset to 0` });
});

// POST /api/debug/prepare-day?n=4
router.post('/prepare-day', verifyToken, async (req, res) => {
  const uid = req.user.uid;
  const n = parseInt(req.query.n ?? '1', 10);

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const configs = await GlobalConfig.find({ category: 'mission' }).lean();
  const missions = configs.map(c => c.payload);

  await Promise.all([
    UserProgress.deleteMany({ uid }),
    UserStats.findOneAndUpdate({ uid }, { streakCount: n, lastClaimedAt: yesterday }, { upsert: true }),
  ]);

  await Promise.all(
    missions.map(m =>
      UserProgress.create({
        uid,
        mission_name: m.mission_name,
        type: m.type,
        reward: m.reward,
        count: m.count,
        progress: Math.min(n, m.count - 1),
      })
    )
  );

  res.json({
    message: `Ready. streakCount=${n}, lastClaimedAt=yesterday. Next claim-daily will be day ${n + 1}.`,
    completesOn_nextClaim: missions
      .filter(m => m.count === n + 1)
      .map(m => m.Mission),
  });
});

// POST /api/debug/reset-coins
router.post('/reset-coins', verifyToken, async (req, res) => {
  const uid = req.user.uid;
  await UserStats.findOneAndUpdate({ uid }, { coinBalance: 0, totalCoinsEarned: 0 }, { upsert: true });
  res.json({ message: 'coinBalance and totalCoinsEarned reset to 0' });
});

// POST /api/debug/complete-mission?name=Streak5Days
router.post('/complete-mission', verifyToken, async (req, res) => {
  const uid = req.user.uid;
  const { name } = req.query;
  if (!name) return res.status(400).json({ error: 'Query param ?name= is required' });

  const config = await GlobalConfig.findOne({ category: 'mission', key: name }).lean();
  if (!config) return res.status(404).json({ error: `Mission "${name}" not found` });
  const mission = config.payload;

  let mp = await UserProgress.findOne({ uid, mission_name: name });
  if (!mp) {
    mp = new UserProgress({
      uid,
      mission_name: name,
      type: mission.type,
      reward: mission.reward,
      count: mission.count,
    });
  }

  const coinsEarned = await awardMission(uid, mp, mission);

  const isStreakMission = mission.mission_name.toLowerCase().includes('streak');
  if (isStreakMission) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    await UserStats.findOneAndUpdate(
      { uid },
      { streakCount: mission.count, $max: { bestStreak: mission.count }, lastClaimedAt: yesterday },
      { upsert: true }
    );
  }

  const stats = await UserStats.findOne({ uid }).select('coinBalance streakCount');

  res.json({
    message: `Mission "${mission.Mission}" completed and reset`,
    coinsEarned,
    newBalance: stats?.coinBalance ?? 0,
    streakCount: stats?.streakCount ?? 0,
  });
});

module.exports = router;
