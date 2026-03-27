const scorers = {
  dalgona: require('./dalgona'),
};

function getScorer(gameType) {
  if (!scorers[gameType]) throw new Error(`Unknown gameType: ${gameType}`);
  return scorers[gameType];
}

module.exports = { getScorer };
