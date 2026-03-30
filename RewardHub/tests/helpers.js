const supertest = require('supertest');

function makeApi(app) {
  const req = supertest(app);

  const api = {
    claimDaily:  () => req.post('/api/rewards/claim-daily'),
    shiftClaim:  (days) => req.post(`/api/debug/shift-claim?days=${days}`),
    prepareDay:  (n)    => req.post(`/api/debug/prepare-day?n=${n}`),
    expireWeek:  ()     => req.post('/api/debug/expire-week'),
    resetAll:    ()     => req.post('/api/debug/reset-missions'),
    setMission:  (name, params = {}) =>
      req.post(`/api/debug/set-mission?${new URLSearchParams({ name, ...params })}`),

    getState: async () => {
      const res = await req.get('/api/debug/state');
      expect(res.status).toBe(200);
      return res.body;
    },

    getMissions: async () => {
      const res = await req.get('/api/missions');
      expect(res.status).toBe(200);
      return Object.fromEntries(res.body.map(m => [m.mission_name, m]));
    },

    // Simulate N consecutive daily claims (each separated by a day shift).
    // Uses prepare-day if called after it, or works on a fresh state.
    claimDays: async (n) => {
      const results = [];
      for (let i = 0; i < n; i++) {
        if (i > 0) await api.shiftClaim(-1);
        const res = await api.claimDaily();
        results.push(res.body);
      }
      return results;
    },
  };

  return api;
}

// Coins earned on the Nth day of a streak cycle (1-indexed).
function expectedDailyCoins(dayNumber) {
  const day = ((dayNumber - 1) % 7) + 1;
  if (day <= 4) return 25;
  if (day <= 6) return 75;
  return 150;
}

module.exports = { makeApi, expectedDailyCoins };
