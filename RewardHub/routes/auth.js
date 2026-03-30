const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const User = require('../models/User');
const UserStats = require('../models/UserStats');
const UserOnboarding = require('../models/UserOnboarding');
const UserGamePreferences = require('../models/UserGamePreferences');
const { generateUniquePlayerNumber } = require('../utils/playerNumber');

// Merges onboarding, game preferences, and stats into a plain user object so
// the frontend keeps receiving all fields without knowing about split collections.
async function withOnboarding(user) {
  const [ob, gp, stats] = await Promise.all([
    UserOnboarding.findOne({ uid: user.uid }).lean(),
    UserGamePreferences.findOne({ uid: user.uid }).lean(),
    UserStats.findOne({ uid: user.uid }).lean(),
  ]);
  return {
    ...user,
    coinBalance:       stats?.coinBalance       ?? 0,
    totalCoinsEarned:  stats?.totalCoinsEarned  ?? 0,
    streakCount:       stats?.streakCount       ?? 0,
    bestStreak:        stats?.bestStreak        ?? 0,
    missionsCompleted: stats?.missionsCompleted ?? 0,
    lastClaimedAt:     stats?.lastClaimedAt     ?? null,
    onboardingComplete: ob?.complete     ?? false,
    onboardingSkipped:  ob?.skipped      ?? false,
    gamePreferences:    gp?.preferences  ?? [],
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
