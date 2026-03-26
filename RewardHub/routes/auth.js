const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const User = require('../models/User');
const { generateUniquePlayerNumber } = require('../utils/playerNumber');

// POST /api/auth/register — idempotent
router.post('/register', verifyToken, async (req, res) => {
  try {
    const { uid, email, name, picture, firebase: fb } = req.user;
    const displayName = name || req.body.displayName || email?.split('@')[0] || 'Player';
    const photoURL = picture || '';
    const provider = fb?.sign_in_provider?.includes('google') ? 'google' : 'email';

    const existing = await User.findOne({ uid });
    if (existing) return res.json(existing);

    const playerNumber = await generateUniquePlayerNumber();
    const user = await User.create({ uid, email, displayName, photoURL, provider, playerNumber });
    res.status(201).json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await User.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/auth/update-profile
router.patch('/update-profile', verifyToken, async (req, res) => {
  try {
    const { displayName, gamePreferences } = req.body;
    const update = {};
    if (displayName !== undefined) update.displayName = displayName;
    if (gamePreferences !== undefined) update.gamePreferences = gamePreferences;
    const user = await User.findOneAndUpdate({ uid: req.user.uid }, update, { new: true });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/auth/onboarding-complete
router.patch('/onboarding-complete', verifyToken, async (req, res) => {
  try {
    const user = await User.findOneAndUpdate(
      { uid: req.user.uid },
      { onboardingComplete: true },
      { new: true }
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/auth/onboarding-skip
router.patch('/onboarding-skip', verifyToken, async (req, res) => {
  try {
    const user = await User.findOneAndUpdate(
      { uid: req.user.uid },
      { onboardingSkipped: true },
      { new: true }
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
