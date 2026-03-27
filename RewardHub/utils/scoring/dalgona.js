function calculateCoins(accuracy, timeRemaining) {
  const base = 50;
  const accuracyBonus = Math.min(Math.max(Math.floor(accuracy - 75), 0), 25);
  const timeBonus = Math.min(Math.floor(timeRemaining / 5), 12);
  return base + accuracyBonus + timeBonus;
}

function isValidSession(session) {
  if (!session) return false;
  if (session.status !== 'active') return false;
  if (session.completedAt) return false;
  const elapsed = (Date.now() - new Date(session.startedAt).getTime()) / 1000;
  if (elapsed > 90) return false;
  return true;
}

module.exports = { calculateCoins, isValidSession };
