const User = require('../models/User');

/**
 * Award coins and mark mission as completed — does NOT reset progress.
 * Progress stays at mission.count so UI shows 1/1, 3/3 etc.
 * Reset to 0 happens at the START of the next claim-daily (see rewards.js).
 */
async function awardMission(uid, mp, mission) {
  const coins = Number(mission.reward);
  await User.findOneAndUpdate(
    { uid },
    { $inc: { coinBalance: coins, totalCoinsEarned: coins, missionsCompleted: 1 } }
  );
  mp.progress = mission.count;
  mp.completed = true;
  mp.rewardClaimed = true;
  mp.completedAt = new Date();
  mp.claimedAt = new Date();
  await mp.save();
  return coins;
}

module.exports = { awardMission };
