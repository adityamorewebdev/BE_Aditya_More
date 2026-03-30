const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const User = require('../models/User');
const UserOnboarding = require('../models/UserOnboarding');
const UserGamePreferences = require('../models/UserGamePreferences');
const DailyReward = require('../models/DailyReward');
const Mission = require('../models/Mission');
const { generateUniquePlayerNumber } = require('../utils/playerNumber');

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function isStreakAlive(claimDate, now) {
  if (!claimDate) return false;
  const d = new Date(claimDate);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  return isSameDay(d, now) || isSameDay(d, yesterday);
}

// Merges onboarding, game preferences, and stats into a plain user object.
// coinBalance, streakCount, bestStreak, missionsCompleted, lastClaimedAt are all
// derived from the dailyrewards and missions collections — no user_stats dependency.
async function withOnboarding(user) {
  const now = new Date();
  const [ob, gp, dailyAgg, missionAgg, latestReward, bestStreakDoc] = await Promise.all([
    UserOnboarding.findOne({ uid: user.uid }).lean(),
    UserGamePreferences.findOne({ uid: user.uid }).lean(),
    DailyReward.aggregate([{ $match: { email: user.email } }, { $group: { _id: null, total: { $sum: '$Amount' } } }]),
    Mission.aggregate([{ $match: { email: user.email } }, { $group: { _id: null, total: { $sum: { $toDouble: '$Amount' } }, count: { $sum: 1 } } }]),
    DailyReward.findOne({ email: user.email }, { streak: 1, ClaimDate: 1 }).sort({ ClaimDate: -1 }).lean(),
    DailyReward.findOne({ email: user.email }, { streak: 1 }).sort({ streak: -1 }).lean(),
  ]);

  const coinBalance = (dailyAgg[0]?.total ?? 0) + (missionAgg[0]?.total ?? 0);
  const alive = isStreakAlive(latestReward?.ClaimDate, now);
  const streakCount = alive ? (latestReward?.streak ?? 0) : 0;
  const bestStreak = bestStreakDoc?.streak ?? 0;
  const missionsCompleted = missionAgg[0]?.count ?? 0;
  const lastClaimedAt = latestReward?.ClaimDate ?? null;

  return {
    ...user,
    coinBalance,
    totalCoinsEarned:  coinBalance,
    streakCount,
    bestStreak,
    missionsCompleted,
    lastClaimedAt,
    onboardingComplete: ob?.complete    ?? false,
    onboardingSkipped:  ob?.skipped     ?? false,
    gamePreferences:    gp?.preferences ?? [],
  };
}

// POST /api/auth/register — idempotent
router.post('/register', verifyToken, async (req, res) => {
  try {
    const { uid, email, name, picture, firebase: fb } = req.user;
    const displayName = name || req.body.displayName || email?.split('@')[0] || 'Player';
    const photoURL = picture || '';
    const provider = fb?.sign_in_provider?.includes('google') ? 'google' : 'email';

    const existing = await User.findOne({ uid }).lean();
    if (existing) return res.json(await withOnboarding(existing));

    const playerNumber = await generateUniquePlayerNumber();
    const user = await User.create({ uid, email, displayName, photoURL, provider, playerNumber });
    res.status(201).json(await withOnboarding(user.toObject()));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await User.findOne({ uid: req.user.uid }).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(await withOnboarding(user));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/auth/update-profile
router.patch('/update-profile', verifyToken, async (req, res) => {
  try {
    const { displayName, gamePreferences } = req.body;

    const userUpdate = {};
    if (displayName !== undefined) userUpdate.displayName = displayName;

    const [user] = await Promise.all([
      Object.keys(userUpdate).length
        ? User.findOneAndUpdate({ uid: req.user.uid }, userUpdate, { new: true }).lean()
        : User.findOne({ uid: req.user.uid }).lean(),
      gamePreferences !== undefined
        ? UserGamePreferences.findOneAndUpdate(
            { uid: req.user.uid },
            { preferences: gamePreferences },
            { upsert: true, new: true }
          )
        : Promise.resolve(),
    ]);

    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(await withOnboarding(user));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/auth/onboarding-complete
router.patch('/onboarding-complete', verifyToken, async (req, res) => {
  try {
    await UserOnboarding.findOneAndUpdate(
      { uid: req.user.uid },
      { complete: true, completedAt: new Date() },
      { upsert: true, new: true }
    );
    const user = await User.findOne({ uid: req.user.uid }).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(await withOnboarding(user));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/auth/onboarding-skip
router.patch('/onboarding-skip', verifyToken, async (req, res) => {
  try {
    await UserOnboarding.findOneAndUpdate(
      { uid: req.user.uid },
      { skipped: true, skippedAt: new Date() },
      { upsert: true, new: true }
    );
    const user = await User.findOne({ uid: req.user.uid }).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(await withOnboarding(user));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
