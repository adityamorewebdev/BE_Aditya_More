const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const User = require('../models/User');
const DailyReward = require('../models/DailyReward');
const MissionProgress = require('../models/MissionProgress');
const Mission = require('../models/Mission');

function getTodayReward(streakDay) {
  const day = ((streakDay - 1) % 7) + 1;
  if (day <= 4) return 25;
  if (day <= 6) return 75;
  return 150;
}

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isYesterday(date, now) {
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  return isSameDay(date, yesterday);
}

// Streak is alive if user claimed today or yesterday
function isStreakAlive(lastClaimedAt, now) {
  if (!lastClaimedAt) return false;
  const d = new Date(lastClaimedAt);
  return isSameDay(d, now) || isYesterday(d, now);
}

// GET /api/rewards/daily-status
router.get('/daily-status', verifyToken, async (req, res) => {
  try {
    const user = await User.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const now = new Date();
    const canClaim = !user.lastClaimedAt || !isSameDay(new Date(user.lastClaimedAt), now);
    const effectiveStreak = isStreakAlive(user.lastClaimedAt, now) ? (user.streakCount ?? 0) : 0;
    const nextStreakDay = effectiveStreak + 1;
    const todayReward = getTodayReward(nextStreakDay);

    res.json({
      canClaim,
      streakCount: effectiveStreak,
      lastClaimedAt: user.lastClaimedAt,
      todayReward,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/rewards/claim-daily
router.post('/claim-daily', verifyToken, async (req, res) => {
  try {
    const uid = req.user.uid;
    const user = await User.findOne({ uid });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const now = new Date();

    if (user.lastClaimedAt && isSameDay(new Date(user.lastClaimedAt), now)) {
      return res.status(400).json({ error: 'Already claimed today' });
    }

    // Determine new streak — continues only if user claimed yesterday (calendar day)
    let newStreak;
    if (!user.lastClaimedAt) {
      newStreak = 1;
    } else if (isYesterday(new Date(user.lastClaimedAt), now)) {
      newStreak = (user.streakCount ?? 0) + 1;
    } else {
      newStreak = 1; // missed a day — streak resets
    }

    const coinsEarned = getTodayReward(newStreak);
    const newBalance = (user.coinBalance ?? 0) + coinsEarned;

    await DailyReward.create({
      email: user.email,
      day: newStreak,
      reward: coinsEarned,
      claimedAt: now,
      status: 'claimed',
      createdAt: now,
      updatedAt: now,
    });

    await User.findOneAndUpdate(
      { uid },
      {
        streakCount: newStreak,
        lastClaimedAt: now,
        coinBalance: newBalance,
        $inc: { totalCoinsEarned: coinsEarned },
        $max: { bestStreak: newStreak },
      }
    );

    // Update missions
    const missions = await Mission.find({});
    const missionsUpdated = [];
    let missionCoins = 0;

    for (const mission of missions) {
      let mp = await MissionProgress.findOne({ uid, mission_name: mission.mission_name });
      if (!mp) {
        mp = new MissionProgress({ uid, mission_name: mission.mission_name });
      }
      if (mp.completed) continue;

      const isStreakMission = mission.mission_name.toLowerCase().includes('streak');

      if (isStreakMission) {
        // newStreak = 1 when streak broke — naturally resets progress
        mp.progress = newStreak;
      } else {
        mp.progress = (mp.progress ?? 0) + 1;
      }

      if (mp.progress >= mission.count) {
        mp.completed = true;
        mp.completedAt = now;
        mp.rewardClaimed = true;
        mp.claimedAt = now;
        missionCoins += Number(mission.reward);
        missionsUpdated.push(mission.mission_name);
      }

      await mp.save();
    }

    if (missionCoins > 0) {
      await User.findOneAndUpdate(
        { uid },
        { $inc: { coinBalance: missionCoins, totalCoinsEarned: missionCoins, missionsCompleted: missionsUpdated.length } }
      );
    }

    res.json({ success: true, coinsEarned, missionCoins, newStreak, newBalance: newBalance + missionCoins, missionsUpdated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
