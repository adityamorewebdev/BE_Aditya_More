const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const User = require('../models/User');
const UserStats = require('../models/UserStats');
const UserProgress = require('../models/UserProgress');
const GlobalConfig = require('../models/GlobalConfig');
const { awardMission } = require('../utils/missionReward');

if (process.env.NODE_ENV === 'production') {
  router.use((req, res) => res.status(404).json({ error: 'Not found' }));
  module.exports = router;
} else {

// ─── helpers ─────────────────────────────────────────────────────────────────

function getWeekStart(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d;
}

function lastWeekStart() {
  const s = getWeekStart(new Date());
  s.setDate(s.getDate() - 7);
  return s;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

async function getMissions() {
  const configs = await GlobalConfig.find({ category: 'mission' }).lean();
  return configs.map(c => c.payload);
}

// ─── inspection ──────────────────────────────────────────────────────────────

/*
  GET /api/debug/state
  Full snapshot: user identity, stats, and every mission's stored + display-ready state.
  Use this before/after any other debug call to verify what changed.
*/
router.get('/state', verifyToken, async (req, res) => {
  try {
    const uid = req.user.uid;
    const [user, stats, progressDocs, missions] = await Promise.all([
      User.findOne({ uid }).lean(),
      UserStats.findOne({ uid }).lean(),
      UserProgress.find({ uid }).lean(),
      getMissions(),
    ]);

    const progressMap = Object.fromEntries(progressDocs.map(p => [p.mission_name, p]));
    const now = new Date();

    const missionState = missions.map(m => {
      const p = progressMap[m.mission_name] ?? {};
      const isStaleWeek = p.weekOf && getWeekStart(p.weekOf).getTime() !== getWeekStart(now).getTime();
      return {
        mission_name: m.mission_name,
        type: m.type,
        count: m.count,
        stored_progress: p.progress ?? 0,
        stored_completed: p.completed ?? false,
        stored_rewardClaimed: p.rewardClaimed ?? false,
        stored_weekOf: p.weekOf ?? null,
        week_is_stale: m.type === 'Weekly' ? isStaleWeek : undefined,
      };
    });

    res.json({
      user: { uid: user?.uid, displayName: user?.displayName, status: user?.status },
      stats: stats ?? { note: 'no stats doc yet' },
      missions: missionState,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── primitives ──────────────────────────────────────────────────────────────

/*
  POST /api/debug/shift-claim?days=-1
    days=-1  → lastClaimedAt = yesterday  (next claim continues streak)
    days=-2  → lastClaimedAt = 2 days ago (next claim breaks streak)
    days=0   → clears lastClaimedAt       (fresh user, no streak history)
*/
router.post('/shift-claim', verifyToken, async (req, res) => {
  try {
    const uid = req.user.uid;
    const days = parseInt(req.query.days ?? '-1', 10);

    if (days === 0) {
      await UserStats.findOneAndUpdate({ uid }, { $unset: { lastClaimedAt: '' } }, { upsert: true });
      return res.json({ message: 'lastClaimedAt cleared — next claim starts streak at 1' });
    }

    const shifted = daysAgo(-days);
    await UserStats.findOneAndUpdate({ uid }, { lastClaimedAt: shifted }, { upsert: true });
    res.json({
      message: `lastClaimedAt → ${shifted.toISOString()}`,
      nextClaimWillBreakStreak: days < -1,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*
  POST /api/debug/set-streak?n=5
  Directly overwrite streakCount (and bestStreak if n is higher).
  Does NOT touch lastClaimedAt — combine with shift-claim for full control.
*/
router.post('/set-streak', verifyToken, async (req, res) => {
  try {
    const uid = req.user.uid;
    const n = parseInt(req.query.n ?? '0', 10);
    const stats = await UserStats.findOneAndUpdate(
      { uid },
      { streakCount: n, $max: { bestStreak: n } },
      { upsert: true, new: true }
    );
    res.json({ message: `streakCount set to ${n}`, streakCount: stats.streakCount, bestStreak: stats.bestStreak });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*
  POST /api/debug/reset-missions
  Wipes all UserProgress and resets streak/lastClaimedAt for a clean slate.
*/
router.post('/reset-missions', verifyToken, async (req, res) => {
  try {
    const uid = req.user.uid;
    const [result] = await Promise.all([
      UserProgress.deleteMany({ uid }),
      UserStats.findOneAndUpdate(
        { uid },
        { streakCount: 0, bestStreak: 0, $unset: { lastClaimedAt: '' } },
        { upsert: true }
      ),
    ]);
    res.json({ message: `Deleted ${result.deletedCount} progress record(s), streak reset to 0` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*
  POST /api/debug/reset-coins
  Zero out coinBalance and totalCoinsEarned.
*/
router.post('/reset-coins', verifyToken, async (req, res) => {
  try {
    const uid = req.user.uid;
    await UserStats.findOneAndUpdate({ uid }, { coinBalance: 0, totalCoinsEarned: 0 }, { upsert: true });
    res.json({ message: 'coinBalance and totalCoinsEarned reset to 0' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*
  POST /api/debug/set-mission?name=X[&progress=N][&completed=true][&rewardClaimed=true][&weekExpired=true]
  Fine-grained control over a single mission's stored state.
  weekExpired=true sets weekOf to last Monday (triggers week-boundary reset on next GET /api/missions).
*/
router.post('/set-mission', verifyToken, async (req, res) => {
  try {
    const uid = req.user.uid;
    const { name, progress, completed, rewardClaimed, weekExpired } = req.query;
    if (!name) return res.status(400).json({ error: '?name= is required' });

    const config = await GlobalConfig.findOne({ category: 'mission', key: name }).lean();
    if (!config) return res.status(404).json({ error: `Mission "${name}" not found` });
    const mission = config.payload;

    const update = {};
    if (progress     !== undefined) update.progress      = Number(progress);
    if (completed    !== undefined) update.completed     = completed === 'true';
    if (rewardClaimed !== undefined) update.rewardClaimed = rewardClaimed === 'true';
    if (mission.type === 'Weekly') {
      update.weekOf = weekExpired === 'true' ? lastWeekStart() : getWeekStart(new Date());
    }

    const mp = await UserProgress.findOneAndUpdate(
      { uid, mission_name: name },
      {
        $set: update,
        $setOnInsert: { type: mission.type, reward: mission.reward, count: mission.count },
      },
      { upsert: true, new: true }
    );
    res.json({ mission_name: name, stored: mp });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*
  POST /api/debug/expire-week
  Sets weekOf to last Monday on ALL weekly UserProgress records.
  Triggers the week-boundary reset on the next GET /api/missions or claim-daily.
*/
router.post('/expire-week', verifyToken, async (req, res) => {
  try {
    const uid = req.user.uid;
    const stale = lastWeekStart();
    const result = await UserProgress.updateMany({ uid, type: 'Weekly' }, { weekOf: stale });
    res.json({ message: `${result.modifiedCount} weekly mission(s) set to stale week`, staleWeekOf: stale });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*
  POST /api/debug/prepare-day?n=N
  Puts every mission in the state it would be after N days of consecutive claiming.
  The NEXT claim-daily will be "day N+1", completing missions whose count === N+1.

  Cheat sheet:
    n=0  → fresh user (no progress), next claim is day 1
    n=2  → next claim completes DailyClaim3Days (count=3)
    n=4  → next claim completes Streak5Days (count=5)
    n=6  → next claim completes DailyClaim7Days (count=7) and gives 150-coin reward tier
    n=9  → next claim completes Streak10Days (count=10)
    n=29 → next claim completes Streak30Days (count=30)
*/
router.post('/prepare-day', verifyToken, async (req, res) => {
  try {
    const uid = req.user.uid;
    const n = parseInt(req.query.n ?? '0', 10);
    const currentWeekStart = getWeekStart(new Date());
    const missions = await getMissions();

    await Promise.all([
      UserProgress.deleteMany({ uid }),
      UserStats.findOneAndUpdate(
        { uid },
        { streakCount: n, lastClaimedAt: n > 0 ? daysAgo(1) : undefined, $max: { bestStreak: n } },
        { upsert: true }
      ),
    ]);

    await Promise.all(
      missions.map(m => {
        let progressFields;
        if (m.type === 'Weekly') {
          progressFields = n >= m.count
            ? { progress: m.count, completed: true, rewardClaimed: true }
            : { progress: n };
        } else {
          // n % count gives current-cycle position for both cumulative and streak missions
          progressFields = { progress: n === 0 ? 0 : n % m.count };
        }

        return UserProgress.create({
          uid,
          mission_name: m.mission_name,
          type: m.type,
          reward: m.reward,
          count: m.count,
          ...progressFields,
          ...(m.type === 'Weekly' ? { weekOf: currentWeekStart } : {}),
        });
      })
    );

    const completesNext = missions.filter(m => m.count === n + 1).map(m => m.mission_name);
    res.json({
      message: `Ready at day ${n}. Next claim-daily will be day ${n + 1}.`,
      streakCount: n,
      lastClaimedAt: n > 0 ? daysAgo(1) : null,
      nextDayRewardCoins: (() => {
        const day = ((n % 7) + 1);
        return day <= 4 ? 25 : day <= 6 ? 75 : 150;
      })(),
      completesOn_nextClaim: completesNext,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*
  POST /api/debug/complete-mission?name=X
  Force-awards a specific mission regardless of current progress.
*/
router.post('/complete-mission', verifyToken, async (req, res) => {
  try {
    const uid = req.user.uid;
    const { name } = req.query;
    if (!name) return res.status(400).json({ error: '?name= is required' });

    const config = await GlobalConfig.findOne({ category: 'mission', key: name }).lean();
    if (!config) return res.status(404).json({ error: `Mission "${name}" not found` });
    const mission = config.payload;

    let mp = await UserProgress.findOne({ uid, mission_name: name });
    if (!mp) {
      mp = new UserProgress({ uid, mission_name: name, type: mission.type, reward: mission.reward, count: mission.count });
    }

    const coinsEarned = await awardMission(uid, mp, mission);

    const isStreakMission = mission.mission_name.toLowerCase().includes('streak');
    if (isStreakMission) {
      await UserStats.findOneAndUpdate(
        { uid },
        { streakCount: mission.count, $max: { bestStreak: mission.count }, lastClaimedAt: daysAgo(1) },
        { upsert: true }
      );
    }

    const stats = await UserStats.findOne({ uid }).lean();
    res.json({ mission_name: name, coinsEarned, newBalance: stats?.coinBalance ?? 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── scenario presets ─────────────────────────────────────────────────────────
// Each scenario endpoint sets up a specific edge-case state so you can hit
// POST /api/rewards/claim-daily (or GET /api/missions) and observe the result.

/*
  POST /api/debug/scenario/streak-continue?from=N
  Streak at N, claimed yesterday → next claim continues to N+1.
  Edge: bestStreak update, streak mission progression.
*/
router.post('/scenario/streak-continue', verifyToken, async (req, res) => {
  try {
    const uid = req.user.uid;
    const from = parseInt(req.query.from ?? '4', 10);
    // delegate to prepare-day logic
    const missions = await getMissions();
    await Promise.all([
      UserProgress.deleteMany({ uid }),
      UserStats.findOneAndUpdate(
        { uid },
        { streakCount: from, lastClaimedAt: daysAgo(1), $max: { bestStreak: from } },
        { upsert: true }
      ),
    ]);
    await Promise.all(
      missions.map(m => UserProgress.create({
        uid, mission_name: m.mission_name, type: m.type, reward: m.reward, count: m.count,
        ...(m.type === 'Weekly'
          ? { progress: from >= m.count ? m.count : from, ...(from >= m.count ? { completed: true, rewardClaimed: true } : {}), weekOf: getWeekStart(new Date()) }
          : { progress: from % m.count }),
      }))
    );
    res.json({
      scenario: 'streak-continue',
      setup: `streakCount=${from}, lastClaimedAt=yesterday`,
      action: 'POST /api/rewards/claim-daily',
      expect: `streak → ${from + 1}, Streak${from + 1}Days completes if it exists`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*
  POST /api/debug/scenario/streak-break?from=N
  Streak at N, last claimed 2 days ago → next claim resets streak to 1.
  Edge: all streak missions reset, DailyClaim* missions do NOT reset.
*/
router.post('/scenario/streak-break', verifyToken, async (req, res) => {
  try {
    const uid = req.user.uid;
    const from = parseInt(req.query.from ?? '5', 10);
    const missions = await getMissions();
    await Promise.all([
      UserProgress.deleteMany({ uid }),
      UserStats.findOneAndUpdate(
        { uid },
        { streakCount: from, lastClaimedAt: daysAgo(2), $max: { bestStreak: from } },
        { upsert: true }
      ),
    ]);
    await Promise.all(
      missions.map(m => UserProgress.create({
        uid, mission_name: m.mission_name, type: m.type, reward: m.reward, count: m.count,
        ...(m.type === 'Weekly'
          ? { progress: from >= m.count ? m.count : from, ...(from >= m.count ? { completed: true, rewardClaimed: true } : {}), weekOf: getWeekStart(new Date()) }
          : { progress: from % m.count }),
      }))
    );
    res.json({
      scenario: 'streak-break',
      setup: `streakCount=${from}, lastClaimedAt=2 days ago`,
      action: 'POST /api/rewards/claim-daily',
      expect: {
        streak: 1,
        streakMissions: 'reset to 0, then set to 1 (new streak)',
        cumulativeDailyMissions: 'NOT reset — progress preserved',
        weeklyMissions: 'NOT reset (same week)',
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*
  POST /api/debug/scenario/week-boundary
  Sets weekly missions to last week, leaves daily missions intact.
  Edge: on next GET /api/missions all weeklies display 0; on next claim-daily they reset.
*/
router.post('/scenario/week-boundary', verifyToken, async (req, res) => {
  try {
    const uid = req.user.uid;
    const stale = lastWeekStart();
    await UserProgress.updateMany({ uid, type: 'Weekly' }, { weekOf: stale });
    res.json({
      scenario: 'week-boundary',
      setup: 'weekOf set to last Monday for all weekly missions',
      action: 'GET /api/missions  OR  POST /api/rewards/claim-daily',
      expect: {
        'GET /api/missions': 'all weekly missions show 0/count',
        'claim-daily': 'weekly missions reset and re-increment to 1/count',
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*
  POST /api/debug/scenario/perfect-week-break
  PerfectWeek at 3/7 this week, streak last claimed 2 days ago.
  Edge: claim-daily should reset PerfectWeek but leave other weekly missions intact.
*/
router.post('/scenario/perfect-week-break', verifyToken, async (req, res) => {
  try {
    const uid = req.user.uid;
    const currentWeekStart = getWeekStart(new Date());
    const missions = await getMissions();

    await Promise.all([
      UserProgress.deleteMany({ uid }),
      UserStats.findOneAndUpdate(
        { uid },
        { streakCount: 3, lastClaimedAt: daysAgo(2) },
        { upsert: true }
      ),
    ]);

    await Promise.all(
      missions.map(m => {
        const isWeekly = m.type === 'Weekly';
        return UserProgress.create({
          uid, mission_name: m.mission_name, type: m.type, reward: m.reward, count: m.count,
          progress: isWeekly ? Math.min(3, m.count) : 3 % m.count,
          ...(isWeekly ? { weekOf: currentWeekStart } : {}),
        });
      })
    );

    res.json({
      scenario: 'perfect-week-break',
      setup: 'all weekly missions at 3/count, lastClaimedAt=2 days ago (streak will break)',
      action: 'POST /api/rewards/claim-daily',
      expect: {
        PerfectWeek: 'resets to 0 (streak broke mid-week)',
        WeeklyClaim3_5_7_AlmostPerfect: 'increments from 3 → 4 (streak break does not affect these)',
        streakMissions: 'reset to 0, then set to 1',
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*
  POST /api/debug/scenario/reward-tier?day=N
  Sets up lastClaimedAt=yesterday and streakCount=N-1 so the next claim is day N.
  Edge: verify coin amounts per tier (days 1-4: 25, days 5-6: 75, day 7: 150, repeating).
  Try day=5, day=6, day=7, day=8.
*/
router.post('/scenario/reward-tier', verifyToken, async (req, res) => {
  try {
    const uid = req.user.uid;
    const day = parseInt(req.query.day ?? '7', 10);
    const streakBefore = day - 1;

    await UserStats.findOneAndUpdate(
      { uid },
      { streakCount: streakBefore, lastClaimedAt: daysAgo(1), $max: { bestStreak: streakBefore } },
      { upsert: true }
    );

    const cyclicDay = ((streakBefore % 7) + 1);
    const expectedCoins = cyclicDay <= 4 ? 25 : cyclicDay <= 6 ? 75 : 150;

    res.json({
      scenario: 'reward-tier',
      setup: `streakCount=${streakBefore}, lastClaimedAt=yesterday`,
      action: 'POST /api/rewards/claim-daily',
      expect: { newStreak: day, coinsEarned: expectedCoins },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*
  POST /api/debug/scenario/cumulative-cycle
  DailyClaim7Days at 6/7, other missions at neutral state.
  Edge: next claim completes DailyClaim7Days, resets it, other cumulative missions unaffected.
*/
router.post('/scenario/cumulative-cycle', verifyToken, async (req, res) => {
  try {
    const uid = req.user.uid;
    const missions = await getMissions();

    await Promise.all([
      UserProgress.deleteMany({ uid }),
      UserStats.findOneAndUpdate(
        { uid },
        { streakCount: 6, lastClaimedAt: daysAgo(1) },
        { upsert: true }
      ),
    ]);

    await Promise.all(
      missions.map(m => UserProgress.create({
        uid, mission_name: m.mission_name, type: m.type, reward: m.reward, count: m.count,
        progress: m.type === 'Weekly' ? Math.min(6, m.count - 1)
          : m.mission_name === 'DailyClaim7Days' ? 6
          : 6 % m.count,
        ...(m.type === 'Weekly' ? { weekOf: getWeekStart(new Date()) } : {}),
      }))
    );

    res.json({
      scenario: 'cumulative-cycle',
      setup: 'DailyClaim7Days at 6/7, streak=6, lastClaimedAt=yesterday',
      action: 'POST /api/rewards/claim-daily',
      expect: {
        DailyClaim7Days: 'completes (7/7), auto-awarded, resets for next cycle',
        DailyClaim3Days: 'progress = 6%3=0 → increments to 1/3',
        DailyClaim1: 'progress = 6%1=0 → increments to 1/1, auto-awards, resets',
        Streak7Days_doesNotExist: 'Streak5Days progress → 7 (past threshold, auto-awarded)',
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
}
