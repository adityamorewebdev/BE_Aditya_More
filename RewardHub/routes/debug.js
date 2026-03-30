const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const User = require('../models/User');
const DailyReward = require('../models/DailyReward');
const Mission = require('../models/Mission');
const GlobalConfig = require('../models/GlobalConfig');

if (process.env.NODE_ENV === 'production') {
  router.use((req, res) => res.status(404).json({ error: 'Not found' }));
  module.exports = router;
} else {

// ─── helpers ─────────────────────────────────────────────────────────────────

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

async function getMissionDefs() {
  const doc = await GlobalConfig.findOne({ category: 'config', key: 'missions' }).lean();
  return doc?.payload ?? [];
}

async function getUserByUid(uid, res) {
  const user = await User.findOne({ uid }).lean();
  if (!user) { res.status(404).json({ error: 'User not found' }); return null; }
  return user;
}

// ─── inspection ──────────────────────────────────────────────────────────────

/*
  GET /api/debug/state
  Full snapshot: user identity, last 10 daily rewards, and mission completion state.
*/
router.get('/state', verifyToken, async (req, res) => {
  try {
    const user = await getUserByUid(req.user.uid, res);
    if (!user) return;

    const [missionDefs, completedMissions, recentRewards] = await Promise.all([
      getMissionDefs(),
      Mission.find({ email: user.email }).lean(),
      DailyReward.find({ email: user.email }).sort({ ClaimDate: -1 }).limit(10).lean(),
    ]);

    const completedSet = new Set(completedMissions.map(m => m.mission_name));
    const missionState = missionDefs.map(m => ({
      mission_name: m.mission_name,
      type: m.type,
      count: m.count,
      completed: completedSet.has(m.mission_name),
    }));

    res.json({
      user: { uid: user.uid, displayName: user.displayName, email: user.email },
      recentRewards,
      missions: missionState,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── primitives ──────────────────────────────────────────────────────────────

/*
  POST /api/debug/shift-claim?days=-1
    days=-1  → latest DailyReward ClaimDate = yesterday  (next claim continues streak)
    days=-2  → latest DailyReward ClaimDate = 2 days ago (next claim breaks streak)
    days=0   → deletes all DailyReward docs for this user (fresh start)
*/
router.post('/shift-claim', verifyToken, async (req, res) => {
  try {
    const user = await getUserByUid(req.user.uid, res);
    if (!user) return;
    const email = user.email;
    const days = parseInt(req.query.days ?? '-1', 10);

    if (days === 0) {
      await DailyReward.deleteMany({ email });
      return res.json({ message: 'All DailyReward docs cleared — next claim starts streak at 1' });
    }

    const shifted = daysAgo(-days);
    await DailyReward.findOneAndUpdate(
      { email },
      { $set: { ClaimDate: shifted } },
      { sort: { ClaimDate: -1 } }
    );
    res.json({
      message: `Latest DailyReward ClaimDate → ${shifted.toISOString()}`,
      nextClaimWillBreakStreak: days < -1,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*
  POST /api/debug/reset-missions
  Deletes all Mission docs for this user.
*/
router.post('/reset-missions', verifyToken, async (req, res) => {
  try {
    const user = await getUserByUid(req.user.uid, res);
    if (!user) return;
    const result = await Mission.deleteMany({ email: user.email });
    res.json({ message: `Deleted ${result.deletedCount} mission record(s)` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*
  POST /api/debug/reset-coins
  Deletes all DailyReward and Mission docs — coin balance becomes 0.
*/
router.post('/reset-coins', verifyToken, async (req, res) => {
  try {
    const user = await getUserByUid(req.user.uid, res);
    if (!user) return;
    const [dr, ms] = await Promise.all([
      DailyReward.deleteMany({ email: user.email }),
      Mission.deleteMany({ email: user.email }),
    ]);
    res.json({ message: `Deleted ${dr.deletedCount} daily reward(s) and ${ms.deletedCount} mission(s) — coin balance is now 0` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*
  POST /api/debug/complete-mission?name=X
  Force-inserts a Mission completion record for the given mission name.
*/
router.post('/complete-mission', verifyToken, async (req, res) => {
  try {
    const { name } = req.query;
    if (!name) return res.status(400).json({ error: '?name= is required' });

    const user = await getUserByUid(req.user.uid, res);
    if (!user) return;

    const missionDefs = await getMissionDefs();
    const mission = missionDefs.find(m => m.mission_name === name);
    if (!mission) return res.status(404).json({ error: `Mission "${name}" not found` });

    const existing = await Mission.findOne({ email: user.email, mission_name: name }).lean();
    if (existing) return res.status(400).json({ error: 'Mission already completed' });

    await Mission.create({
      email: user.email,
      status: 'claimed',
      Amount: mission.reward,
      mission_name: name,
      claimed_date: new Date(),
    });

    res.json({ mission_name: name, coinsEarned: Number(mission.reward) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*
  POST /api/debug/prepare-day?n=N
  Inserts N fake DailyReward docs (days 1..N) so the next real claim will be day N+1.
  n=0 clears all DailyReward docs.
*/
router.post('/prepare-day', verifyToken, async (req, res) => {
  try {
    const n = parseInt(req.query.n ?? '0', 10);
    const user = await getUserByUid(req.user.uid, res);
    if (!user) return;
    const email = user.email;

    await DailyReward.deleteMany({ email });

    if (n > 0) {
      const configDoc = await GlobalConfig.findOne({ category: 'config', key: 'daily_rewards' }).lean();
      const rewards = configDoc?.payload?.rewards ?? [];

      const docs = [];
      for (let i = 1; i <= n; i++) {
        const cycleDay = ((i - 1) % 7) + 1;
        const amount = (rewards.find(r => r.day === cycleDay) ?? {}).reward ?? 0;
        docs.push({ email, status: 'claimed', Day: cycleDay, ClaimDate: daysAgo(n - i + 1), Amount: amount, streak: i });
      }
      await DailyReward.insertMany(docs);
    }

    const missionDefs = await getMissionDefs();
    const completesNext = missionDefs.filter(m => m.count === n + 1).map(m => m.mission_name);
    res.json({
      message: `Ready at day ${n}. Next claim-daily will be day ${n + 1}.`,
      streakCount: n,
      lastClaimedAt: n > 0 ? daysAgo(1) : null,
      completesOn_nextClaim: completesNext,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── mission testing ─────────────────────────────────────────────────────────

function getWeekBounds(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { start: monday, end: sunday };
}

function isSameDayLocal(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/*
  GET /api/debug/missions/progress
  Shows live counters (totalClaims, streak, weeklyCount) and per-mission status:
    - progress    : how far the user is toward that mission's count
    - completed   : whether a Mission doc already exists
    - would_complete: true if progress >= count AND not yet completed (triggers on next claim)
*/
router.get('/missions/progress', verifyToken, async (req, res) => {
  try {
    const user = await getUserByUid(req.user.uid, res);
    if (!user) return;
    const email = user.email;
    const now = new Date();
    const { start: weekStart, end: weekEnd } = getWeekBounds(now);

    const [missionDefs, completedMissions, latestReward, totalClaims, weeklyCount] = await Promise.all([
      getMissionDefs(),
      Mission.find({ email }).lean(),
      DailyReward.findOne({ email }).sort({ ClaimDate: -1 }).lean(),
      DailyReward.countDocuments({ email }),
      DailyReward.countDocuments({ email, ClaimDate: { $gte: weekStart, $lte: weekEnd } }),
    ]);

    const streakAlive = latestReward && (
      isSameDayLocal(new Date(latestReward.ClaimDate), now) ||
      isSameDayLocal(new Date(latestReward.ClaimDate), daysAgo(1))
    );
    const currentStreak = streakAlive ? latestReward.streak : 0;
    const completedSet = new Set(completedMissions.map(m => m.mission_name));

    const missions = missionDefs.map(m => {
      const isStreak  = m.mission_name.toLowerCase().includes('streak');
      const isWeekly  = m.type === 'Weekly';
      const counter   = isStreak ? currentStreak : isWeekly ? weeklyCount : totalClaims;
      const completed = completedSet.has(m.mission_name);
      return {
        mission_name:   m.mission_name,
        type:           m.type,
        required:       m.count,
        reward:         m.reward,
        counter_used:   isStreak ? 'streak' : isWeekly ? 'weeklyCount' : 'totalClaims',
        progress:       Math.min(counter, m.count),
        completed,
        would_complete: !completed && counter >= m.count,
      };
    });

    res.json({
      counters: { totalClaims, currentStreak, weeklyCount, weekStart, weekEnd },
      missions,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*
  GET /api/debug/rewards/history
  Full DailyReward history (newest first) + all Mission completions.
  Includes coin totals so you can verify accumulation at a glance.
*/
router.get('/rewards/history', verifyToken, async (req, res) => {
  try {
    const user = await getUserByUid(req.user.uid, res);
    if (!user) return;

    const [rewards, missionDocs] = await Promise.all([
      DailyReward.find({ email: user.email }).sort({ ClaimDate: -1 }).lean(),
      Mission.find({ email: user.email }).lean(),
    ]);

    const totalDailyCoins   = rewards.reduce((s, r) => s + r.Amount, 0);
    const totalMissionCoins = missionDocs.reduce((s, m) => s + Number(m.Amount), 0);

    res.json({
      totalClaims: rewards.length,
      totalDailyCoins,
      totalMissionCoins,
      coinBalance: totalDailyCoins + totalMissionCoins,
      rewards,
      completedMissions: missionDocs,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*
  POST /api/debug/missions/run-detection
  Runs the exact same detection logic as claim-daily but WITHOUT inserting a new
  DailyReward. Awards any qualifying missions based on current state.
  Workflow: POST prepare-day?n=N  →  POST missions/run-detection  →  GET missions/progress
*/
router.post('/missions/run-detection', verifyToken, async (req, res) => {
  try {
    const user = await getUserByUid(req.user.uid, res);
    if (!user) return;
    const email = user.email;
    const now = new Date();
    const { start: weekStart, end: weekEnd } = getWeekBounds(now);

    const [missionDefs, latestReward, totalClaims, weeklyCount] = await Promise.all([
      getMissionDefs(),
      DailyReward.findOne({ email }).sort({ ClaimDate: -1 }).lean(),
      DailyReward.countDocuments({ email }),
      DailyReward.countDocuments({ email, ClaimDate: { $gte: weekStart, $lte: weekEnd } }),
    ]);

    const streakAlive = latestReward && (
      isSameDayLocal(new Date(latestReward.ClaimDate), now) ||
      isSameDayLocal(new Date(latestReward.ClaimDate), daysAgo(1))
    );
    const currentStreak = streakAlive ? latestReward.streak : 0;

    const awarded = [];
    const skipped = [];

    for (const mission of missionDefs) {
      const existing = await Mission.findOne({ email, mission_name: mission.mission_name }).lean();
      if (existing) { skipped.push({ mission_name: mission.mission_name, reason: 'already_completed' }); continue; }

      const isStreak = mission.mission_name.toLowerCase().includes('streak');
      const isWeekly = mission.type === 'Weekly';
      const count    = isStreak ? currentStreak : isWeekly ? weeklyCount : totalClaims;

      if (count >= mission.count) {
        await Mission.create({
          email,
          status: 'claimed',
          Amount: mission.reward,
          mission_name: mission.mission_name,
          claimed_date: now,
        });
        awarded.push({ mission_name: mission.mission_name, reward: mission.reward, counter: count });
      } else {
        skipped.push({ mission_name: mission.mission_name, reason: 'not_yet', counter: count, required: mission.count });
      }
    }

    const totalAwarded = awarded.reduce((s, m) => s + Number(m.reward), 0);
    res.json({ awarded, skipped, totalAwarded });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*
  POST /api/debug/missions/uncomplete?name=X
  Deletes the Mission completion doc for one mission so it can be re-tested.
  Omit ?name= to delete ALL Mission docs for this user.
*/
router.post('/missions/uncomplete', verifyToken, async (req, res) => {
  try {
    const user = await getUserByUid(req.user.uid, res);
    if (!user) return;
    const { name } = req.query;

    if (!name) {
      const result = await Mission.deleteMany({ email: user.email });
      return res.json({ message: `All ${result.deletedCount} mission completion(s) deleted` });
    }

    const result = await Mission.deleteOne({ email: user.email, mission_name: name });
    if (result.deletedCount === 0) return res.status(404).json({ error: `No completion record found for "${name}"` });
    res.json({ message: `Mission "${name}" reset — it can be earned again` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
}
