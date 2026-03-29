const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const User = require('../models/User');
const Mission = require('../models/Mission');
const MissionProgress = require('../models/MissionProgress');
const { awardMission } = require('../utils/missionReward');

if (process.env.NODE_ENV === 'production') {
  router.use((req, res) => res.status(404).json({ error: 'Not found' }));
  module.exports = router;
  return;
}

// POST /api/debug/shift-claim?days=-2
// days=-1 → claimed yesterday (next claim continues streak)
// days=-2 → claimed 2 days ago (next claim breaks streak)
// days=0  → clears lastClaimedAt (fresh user)
router.post('/shift-claim', verifyToken, async (req, res) => {
  const uid = req.user.uid;
  const days = parseInt(req.query.days ?? '-1', 10);

  if (days === 0) {
    await User.findOneAndUpdate({ uid }, { $unset: { lastClaimedAt: '' } });
    return res.json({ message: 'lastClaimedAt cleared' });
  }

  const shifted = new Date();
  shifted.setDate(shifted.getDate() + days);
  await User.findOneAndUpdate({ uid }, { lastClaimedAt: shifted });

  res.json({
    message: `lastClaimedAt set to ${shifted.toISOString()} (${Math.abs(days)} day(s) ago)`,
    nextClaimWillBreakStreak: days < -1,
  });
});

// POST /api/debug/reset-missions
// Wipes MissionProgress + resets streak/lastClaimedAt for a clean slate
router.post('/reset-missions', verifyToken, async (req, res) => {
  const uid = req.user.uid;
  const [result] = await Promise.all([
    MissionProgress.deleteMany({ uid }),
    User.findOneAndUpdate({ uid }, { streakCount: 0, bestStreak: 0, $unset: { lastClaimedAt: '' } }),
  ]);
  res.json({ message: `Deleted ${result.deletedCount} mission record(s), streak reset to 0` });
});

// POST /api/debug/prepare-day?n=4
// Sets streakCount=N, lastClaimedAt=yesterday, and mission progress=N for all incomplete missions.
// The NEXT claim-daily call will be "day N+1", completing any mission with count === N+1.
//
// Cheat sheet:
//   n=2  → next claim completes "Claim daily reward 3 days"
//   n=4  → next claim completes "Maintain 5-day reward streak"
//   n=9  → next claim completes "Maintain 10-day reward streak"
//   n=29 → next claim completes "Maintain 30-day reward streak"
router.post('/prepare-day', verifyToken, async (req, res) => {
  const uid = req.user.uid;
  const n = parseInt(req.query.n ?? '1', 10);

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const missions = await Mission.find({});

  await Promise.all([
    MissionProgress.deleteMany({ uid }),
    User.findOneAndUpdate({ uid }, { streakCount: n, lastClaimedAt: yesterday }),
  ]);

  await Promise.all(
    missions.map(m =>
      MissionProgress.create({
        uid,
        mission_name: m.mission_name,
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
// Zeroes out coinBalance and totalCoinsEarned
router.post('/reset-coins', verifyToken, async (req, res) => {
  const uid = req.user.uid;
  await User.findOneAndUpdate({ uid }, { coinBalance: 0, totalCoinsEarned: 0 });
  res.json({ message: 'coinBalance and totalCoinsEarned reset to 0' });
});

// POST /api/debug/complete-mission?name=Streak5Days
// Directly awards the mission reward and resets its progress (simulates completion).
// Use this to test any mission without going through the full N-day process.
//
// Available mission_names:
//   DailyClaim1, DailyClaim3Days, DailyClaim7Days
//   Streak5Days, Streak10Days, Streak30Days
//   WeeklyClaim3, WeeklyClaim5, WeeklyClaim7, PerfectWeek, AlmostPerfectWeek
router.post('/complete-mission', verifyToken, async (req, res) => {
  const uid = req.user.uid;
  const { name } = req.query;
  if (!name) return res.status(400).json({ error: 'Query param ?name= is required' });

  const mission = await Mission.findOne({ mission_name: name });
  if (!mission) return res.status(404).json({ error: `Mission "${name}" not found` });

  let mp = await MissionProgress.findOne({ uid, mission_name: name });
  if (!mp) mp = new MissionProgress({ uid, mission_name: name });

  const coinsEarned = await awardMission(uid, mp, mission);

  // For streak missions, set streakCount to mission.count so the UI reflects the correct value
  const isStreakMission = mission.mission_name.toLowerCase().includes('streak');
  if (isStreakMission) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    await User.findOneAndUpdate(
      { uid },
      { streakCount: mission.count, $max: { bestStreak: mission.count }, lastClaimedAt: yesterday }
    );
  }

  const user = await User.findOne({ uid }).select('coinBalance streakCount');

  res.json({
    message: `Mission "${mission.Mission}" completed and reset`,
    coinsEarned,
    newBalance: user.coinBalance,
    streakCount: user.streakCount,
  });
});

module.exports = router;
