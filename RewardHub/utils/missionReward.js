const UserStats = require('../models/UserStats');

/**
 * Award coins and mark mission as completed — does NOT reset progress.
 * Progress stays at mission.count so UI shows 1/1, 3/3 etc.
 * Reset to 0 happens at the START of the next claim-daily (see rewards.js).
 */
async function awardMission(uid, mp, mission) {
  const coins = Number(mission.reward);
  await UserStats.findOneAndUpdate(
    { uid },
    { $inc: { coinBalance: coins, totalCoinsEarned: coins, missionsCompleted: 1 } },
    { upsert: true }
  );
  mp.progress = mission.count;
  mp.completed = true;
  mp.rewardClaimed = true;
  await mp.save();
  return coins;
}

module.exports = { awardMission };
