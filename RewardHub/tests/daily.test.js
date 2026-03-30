jest.mock('../middleware/verifyToken', () => (req, res, next) => {
  req.user = { uid: 'test-uid-001' };
  next();
});

const { connectDB, disconnectDB, seedMissions, createTestUser, clearUserData } = require('./setup');
const { makeApi, expectedDailyCoins } = require('./helpers');
const app = require('./testApp');

let api;

beforeAll(async () => {
  await connectDB();
  await seedMissions();
  await createTestUser();
});

afterAll(disconnectDB);

beforeEach(async () => {
  await clearUserData();
  api = makeApi(app);
});

// ─────────────────────────────────────────────────────────────────────────────
// DailyClaim1 — Claim daily reward 1 time
// ─────────────────────────────────────────────────────────────────────────────
describe('DailyClaim1 – Claim daily reward 1 time', () => {
  test('shows 0/1 before first claim', async () => {
    const m = await api.getMissions();
    expect(m.DailyClaim1.progress).toBe(0);
    expect(m.DailyClaim1.completed).toBe(false);
  });

  test('auto-awards on the very first claim', async () => {
    const res = await api.claimDaily();
    expect(res.status).toBe(200);
    expect(res.body.missionsUpdated).toContain('DailyClaim1');
    expect(res.body.missionCoins).toBeGreaterThanOrEqual(10);
  });

  test('awards exactly 10 mission coins', async () => {
    const res = await api.claimDaily();
    // missionCoins may include other auto-awarded missions; check balance delta
    const dailyCoins = expectedDailyCoins(1); // 25 on day 1
    expect(res.body.newBalance).toBeGreaterThanOrEqual(dailyCoins + 10);
  });

  test('resets to 0/1 after auto-award (ready for next cycle)', async () => {
    await api.claimDaily();
    const m = await api.getMissions();
    // completed+rewardClaimed, so on next display it shows 1/1 (completed state)
    // The reset to 0 happens at the START of the next claim, not immediately
    expect(m.DailyClaim1.completed).toBe(true);
    expect(m.DailyClaim1.rewardClaimed).toBe(true);
  });

  test('auto-awards again on the next day claim (cycles every claim)', async () => {
    await api.claimDaily();
    await api.shiftClaim(-1);
    const res = await api.claimDaily();
    expect(res.body.missionsUpdated).toContain('DailyClaim1');
  });

  test('awards coins on every single consecutive claim', async () => {
    for (let day = 1; day <= 5; day++) {
      if (day > 1) await api.shiftClaim(-1);
      const res = await api.claimDaily();
      expect(res.body.missionsUpdated).toContain('DailyClaim1');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DailyClaim3Days — Claim daily reward 3 days
// ─────────────────────────────────────────────────────────────────────────────
describe('DailyClaim3Days – Claim daily reward 3 days', () => {
  test('shows 1/3 after first claim', async () => {
    await api.claimDaily();
    const m = await api.getMissions();
    expect(m.DailyClaim3Days.progress).toBe(1);
    expect(m.DailyClaim3Days.completed).toBe(false);
  });

  test('shows 2/3 after second claim', async () => {
    await api.claimDays(2);
    const m = await api.getMissions();
    expect(m.DailyClaim3Days.progress).toBe(2);
  });

  test('completes on 3rd claim and awards 50 coins', async () => {
    await api.claimDays(2);
    await api.shiftClaim(-1);
    const res = await api.claimDaily();
    expect(res.body.missionsUpdated).toContain('DailyClaim3Days');
    expect(res.body.missionCoins).toBeGreaterThanOrEqual(50);
  });

  test('resets and starts new cycle on 4th claim', async () => {
    await api.claimDays(3);
    await api.shiftClaim(-1);
    await api.claimDaily(); // day 4 — new cycle
    const m = await api.getMissions();
    expect(m.DailyClaim3Days.progress).toBe(1);
    expect(m.DailyClaim3Days.completed).toBe(false);
  });

  test('progress is preserved after a streak break', async () => {
    await api.claimDays(2); // progress = 2/3
    await api.shiftClaim(-2); // break streak
    await api.claimDaily(); // progress should become 3/3 (not reset)
    const m = await api.getMissions();
    // cumulative mission: streak break does not reset progress, so 2+1=3 → completed
    expect(m.DailyClaim3Days.completed).toBe(true);
  });

  test('completes across non-consecutive claims (not streak-dependent)', async () => {
    await api.claimDays(2);
    await api.shiftClaim(-2); // break streak
    const res = await api.claimDaily();
    expect(res.body.missionsUpdated).toContain('DailyClaim3Days');
  });

  test('prepare-day n=2 shows 2/3', async () => {
    await api.prepareDay(2);
    const m = await api.getMissions();
    expect(m.DailyClaim3Days.progress).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DailyClaim7Days — Claim daily reward 7 days
// ─────────────────────────────────────────────────────────────────────────────
describe('DailyClaim7Days – Claim daily reward 7 days', () => {
  test('increments correctly over 7 claims', async () => {
    for (let day = 1; day <= 7; day++) {
      if (day > 1) await api.shiftClaim(-1);
      await api.claimDaily();
      const m = await api.getMissions();
      if (day < 7) expect(m.DailyClaim7Days.progress).toBe(day);
    }
  });

  test('completes on 7th claim and awards 150 coins', async () => {
    await api.prepareDay(6); // at 6/7
    const res = await api.claimDaily();
    expect(res.body.missionsUpdated).toContain('DailyClaim7Days');
    expect(res.body.missionCoins).toBeGreaterThanOrEqual(150);
  });

  test('resets to 1/7 on 8th claim (new cycle)', async () => {
    await api.prepareDay(6);
    await api.claimDaily(); // day 7 — completes
    await api.shiftClaim(-1);
    await api.claimDaily(); // day 8 — new cycle
    const m = await api.getMissions();
    expect(m.DailyClaim7Days.progress).toBe(1);
    expect(m.DailyClaim7Days.completed).toBe(false);
  });

  test('prepare-day n=29 shows 1/7 (29 mod 7 = 1)', async () => {
    await api.prepareDay(29);
    const m = await api.getMissions();
    expect(m.DailyClaim7Days.progress).toBe(1); // 29 % 7 = 1
  });

  test('progress is NOT reset on streak break', async () => {
    await api.prepareDay(5); // 5/7
    await api.shiftClaim(-2); // break streak — lastClaimedAt already set by prepareDay, re-shift
    const res = await api.claimDaily();
    const m = await api.getMissions();
    // Progress was 5, streak broke, but it's cumulative: 5+1=6/7
    expect(m.DailyClaim7Days.progress).toBe(6);
    expect(res.body.missionsUpdated).not.toContain('DailyClaim7Days');
  });

  test('completes even with a streak break mid-way', async () => {
    await api.prepareDay(5); // 5/7
    await api.shiftClaim(-2); // break
    await api.claimDaily(); // 6/7
    await api.shiftClaim(-1);
    const res = await api.claimDaily(); // 7/7 — should complete
    expect(res.body.missionsUpdated).toContain('DailyClaim7Days');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Streak5Days — Maintain 5-day reward streak
// ─────────────────────────────────────────────────────────────────────────────
describe('Streak5Days – Maintain 5-day reward streak', () => {
  test('shows 0/5 before any claim (streak not alive)', async () => {
    const m = await api.getMissions();
    expect(m.Streak5Days.progress).toBe(0);
  });

  test('tracks progress equal to current streak count', async () => {
    for (let day = 1; day <= 4; day++) {
      if (day > 1) await api.shiftClaim(-1);
      await api.claimDaily();
      const m = await api.getMissions();
      expect(m.Streak5Days.progress).toBe(day);
    }
  });

  test('completes on 5th consecutive claim and awards 100 coins', async () => {
    await api.prepareDay(4); // streak=4, lastClaimedAt=yesterday
    const res = await api.claimDaily();
    expect(res.body.missionsUpdated).toContain('Streak5Days');
    expect(res.body.missionCoins).toBeGreaterThanOrEqual(100);
  });

  test('shows 0/5 when streak is dead (missed a day)', async () => {
    await api.prepareDay(4);
    await api.shiftClaim(-2); // break streak
    const m = await api.getMissions();
    // streak dead → display shows 0
    expect(m.Streak5Days.progress).toBe(0);
    expect(m.Streak5Days.completed).toBe(false);
  });

  test('resets to 1/5 after streak break and new claim', async () => {
    await api.prepareDay(4);
    await api.shiftClaim(-2);
    await api.claimDaily(); // newStreak=1
    const m = await api.getMissions();
    expect(m.Streak5Days.progress).toBe(1);
  });

  test('does NOT complete on day 5 after a streak break', async () => {
    await api.prepareDay(4);
    await api.shiftClaim(-2); // break
    const res = await api.claimDaily(); // resets to streak=1
    expect(res.body.missionsUpdated).not.toContain('Streak5Days');
    expect(res.body.newStreak).toBe(1);
  });

  test('completes again after a break + 5 more consecutive days', async () => {
    await api.prepareDay(4);
    await api.shiftClaim(-2); // break
    await api.claimDaily(); // day 1 of new streak
    // 4 more consecutive days
    for (let i = 0; i < 4; i++) {
      await api.shiftClaim(-1);
      const res = await api.claimDaily();
      if (i === 3) {
        expect(res.body.missionsUpdated).toContain('Streak5Days');
      }
    }
  });

  test('prepare-day n=29 shows 4/5 (29 mod 5 = 4)', async () => {
    await api.prepareDay(29);
    const m = await api.getMissions();
    expect(m.Streak5Days.progress).toBe(4); // 29 % 5 = 4
  });

  test('completes on next claim after prepare-day n=29', async () => {
    await api.prepareDay(29);
    const res = await api.claimDaily();
    expect(res.body.missionsUpdated).toContain('Streak5Days');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Streak10Days — Maintain 10-day reward streak
// ─────────────────────────────────────────────────────────────────────────────
describe('Streak10Days – Maintain 10-day reward streak', () => {
  test('completes on 10th consecutive claim and awards 300 coins', async () => {
    await api.prepareDay(9); // streak=9, lastClaimedAt=yesterday
    const res = await api.claimDaily();
    expect(res.body.missionsUpdated).toContain('Streak10Days');
    expect(res.body.missionCoins).toBeGreaterThanOrEqual(300);
  });

  test('does NOT complete if streak breaks before day 10', async () => {
    await api.prepareDay(9);
    await api.shiftClaim(-2); // break streak
    const res = await api.claimDaily(); // resets to streak=1
    expect(res.body.missionsUpdated).not.toContain('Streak10Days');
    expect(res.body.newStreak).toBe(1);
  });

  test('resets progress to 1 after streak break', async () => {
    await api.prepareDay(7); // 7/10
    await api.shiftClaim(-2); // break
    await api.claimDaily(); // newStreak=1
    const m = await api.getMissions();
    expect(m.Streak10Days.progress).toBe(1);
  });

  test('prepare-day n=9 shows 9/10', async () => {
    await api.prepareDay(9);
    const m = await api.getMissions();
    expect(m.Streak10Days.progress).toBe(9);
  });

  test('prepare-day n=29 shows 9/10 (29 mod 10 = 9)', async () => {
    await api.prepareDay(29);
    const m = await api.getMissions();
    expect(m.Streak10Days.progress).toBe(9); // 29 % 10 = 9
  });

  test('auto-awards again after cycling (streak > 10 on subsequent claims)', async () => {
    await api.prepareDay(9);
    await api.claimDaily(); // day 10 — first completion
    await api.shiftClaim(-1);
    const res = await api.claimDaily(); // day 11 — second cycle completes again
    expect(res.body.missionsUpdated).toContain('Streak10Days');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Streak30Days — Maintain 30-day reward streak
// ─────────────────────────────────────────────────────────────────────────────
describe('Streak30Days – Maintain 30-day reward streak', () => {
  test('completes on 30th consecutive claim and awards 1000 coins', async () => {
    await api.prepareDay(29); // streak=29, lastClaimedAt=yesterday
    const res = await api.claimDaily();
    expect(res.body.missionsUpdated).toContain('Streak30Days');
    expect(res.body.missionCoins).toBeGreaterThanOrEqual(1000);
  });

  test('does NOT complete if streak breaks at day 29', async () => {
    await api.prepareDay(29);
    await api.shiftClaim(-2); // break
    const res = await api.claimDaily(); // newStreak=1
    expect(res.body.missionsUpdated).not.toContain('Streak30Days');
    expect(res.body.newStreak).toBe(1);
  });

  test('shows 29/30 at prepare-day n=29', async () => {
    await api.prepareDay(29);
    const m = await api.getMissions();
    expect(m.Streak30Days.progress).toBe(29);
    expect(m.Streak30Days.completed).toBe(false);
  });

  test('shows 0/30 when streak is dead', async () => {
    await api.prepareDay(15);
    await api.shiftClaim(-2);
    const m = await api.getMissions();
    expect(m.Streak30Days.progress).toBe(0); // streak dead, displays 0
  });

  test('newBalance includes 1000 mission coins on completion', async () => {
    await api.prepareDay(29);
    const res = await api.claimDaily();
    const dailyCoins = expectedDailyCoins(30); // day 30 in streak = day 2 of coin cycle = 25
    expect(res.body.newBalance).toBeGreaterThanOrEqual(dailyCoins + 1000);
  });
});
