jest.mock('../middleware/verifyToken', () => (req, res, next) => {
  req.user = { uid: 'test-uid-001' };
  next();
});

const { connectDB, disconnectDB, seedMissions, createTestUser, clearUserData } = require('./setup');
const { makeApi } = require('./helpers');
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

// Helper: make N claims within the same week (streak continues between each).
async function claimThisWeek(n) {
  const results = [];
  for (let i = 0; i < n; i++) {
    if (i > 0) await api.shiftClaim(-1);
    results.push((await api.claimDaily()).body);
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// WeeklyClaim3 — Claim daily reward 3 times this week
// ─────────────────────────────────────────────────────────────────────────────
describe('WeeklyClaim3 – Claim daily reward 3 times this week', () => {
  test('shows 0/3 before any claim', async () => {
    const m = await api.getMissions();
    expect(m.WeeklyClaim3.progress).toBe(0);
    expect(m.WeeklyClaim3.completed).toBe(false);
  });

  test('increments to 1/3 after first claim', async () => {
    await api.claimDaily();
    const m = await api.getMissions();
    expect(m.WeeklyClaim3.progress).toBe(1);
  });

  test('increments to 2/3 after second claim', async () => {
    await claimThisWeek(2);
    const m = await api.getMissions();
    expect(m.WeeklyClaim3.progress).toBe(2);
  });

  test('completes on 3rd claim and awards 50 coins', async () => {
    await claimThisWeek(2);
    await api.shiftClaim(-1);
    const res = await api.claimDaily();
    expect(res.body.missionsUpdated).toContain('WeeklyClaim3');
    expect(res.body.missionCoins).toBeGreaterThanOrEqual(50);
  });

  test('does not increment or award again after completion (same week)', async () => {
    await claimThisWeek(3); // completes
    await api.shiftClaim(-1);
    const res = await api.claimDaily(); // 4th claim same week
    expect(res.body.missionsUpdated).not.toContain('WeeklyClaim3');
    const m = await api.getMissions();
    expect(m.WeeklyClaim3.completed).toBe(true);
  });

  test('resets to 0/3 after week expires', async () => {
    await claimThisWeek(2); // 2/3
    await api.expireWeek();  // simulate week rollover
    const m = await api.getMissions();
    expect(m.WeeklyClaim3.progress).toBe(0);
    expect(m.WeeklyClaim3.completed).toBe(false);
  });

  test('can complete again in a new week', async () => {
    await claimThisWeek(3); // complete week 1
    await api.expireWeek(); // roll to week 2
    await api.shiftClaim(-1);
    const results = await claimThisWeek(3); // complete week 2
    const lastRes = results[2];
    expect(lastRes.missionsUpdated).toContain('WeeklyClaim3');
  });

  test('prepare-day n=2 shows 2/3 for the current week', async () => {
    await api.prepareDay(2);
    const m = await api.getMissions();
    expect(m.WeeklyClaim3.progress).toBe(2);
    expect(m.WeeklyClaim3.completed).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WeeklyClaim5 — Claim daily reward 5 times this week
// ─────────────────────────────────────────────────────────────────────────────
describe('WeeklyClaim5 – Claim daily reward 5 times this week', () => {
  test('completes on 5th claim this week and awards 120 coins', async () => {
    await claimThisWeek(4);
    await api.shiftClaim(-1);
    const res = await api.claimDaily();
    expect(res.body.missionsUpdated).toContain('WeeklyClaim5');
    expect(res.body.missionCoins).toBeGreaterThanOrEqual(120);
  });

  test('does not complete on 4th claim', async () => {
    const results = await claimThisWeek(4);
    const last = results[3];
    expect(last.missionsUpdated).not.toContain('WeeklyClaim5');
  });

  test('resets on week expiry', async () => {
    await claimThisWeek(4); // 4/5
    await api.expireWeek();
    const m = await api.getMissions();
    expect(m.WeeklyClaim5.progress).toBe(0);
  });

  test('streak break does NOT reset weekly progress', async () => {
    await claimThisWeek(3); // 3/5
    await api.shiftClaim(-2); // break streak
    await api.claimDaily(); // 4th claim this week (streak reset but weekly continues)
    const m = await api.getMissions();
    expect(m.WeeklyClaim5.progress).toBe(4); // still 4, not reset
  });

  test('prepare-day n=29 shows WeeklyClaim5 as completed (29 >= 5)', async () => {
    await api.prepareDay(29);
    const m = await api.getMissions();
    expect(m.WeeklyClaim5.completed).toBe(true);
    expect(m.WeeklyClaim5.rewardClaimed).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WeeklyClaim7 — Claim daily reward 7 times this week
// ─────────────────────────────────────────────────────────────────────────────
describe('WeeklyClaim7 – Claim daily reward 7 times this week', () => {
  test('completes on 7th claim this week and awards 300 coins', async () => {
    await api.prepareDay(6); // 6 claims already this week (n=6 >= all counts < 7 for weekly)
    // prepareDay sets WeeklyClaim7 to progress=6 (n < count=7, so not completed)
    const res = await api.claimDaily();
    expect(res.body.missionsUpdated).toContain('WeeklyClaim7');
    expect(res.body.missionCoins).toBeGreaterThanOrEqual(300);
  });

  test('does NOT reset on streak break (just needs 7 claims, not consecutive)', async () => {
    await claimThisWeek(5); // 5/7
    await api.shiftClaim(-2); // break streak
    await api.claimDaily(); // 6th claim (streak broke, but weekly progress preserved)
    const m = await api.getMissions();
    expect(m.WeeklyClaim7.progress).toBe(6);
  });

  test('resets to 0/7 after week expiry', async () => {
    await claimThisWeek(5); // 5/7
    await api.expireWeek();
    const m = await api.getMissions();
    expect(m.WeeklyClaim7.progress).toBe(0);
  });

  test('prepare-day n=6 shows 6/7', async () => {
    await api.prepareDay(6);
    const m = await api.getMissions();
    expect(m.WeeklyClaim7.progress).toBe(6);
    expect(m.WeeklyClaim7.completed).toBe(false);
  });

  test('prepare-day n=29 shows WeeklyClaim7 as completed (29 >= 7)', async () => {
    await api.prepareDay(29);
    const m = await api.getMissions();
    expect(m.WeeklyClaim7.completed).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PerfectWeek — Claim rewards every day for 7 days
// ─────────────────────────────────────────────────────────────────────────────
describe('PerfectWeek – Claim rewards every day for 7 days', () => {
  test('completes on 7th consecutive claim within the week', async () => {
    await api.prepareDay(6); // 6 consecutive claims this week
    const res = await api.claimDaily();
    expect(res.body.missionsUpdated).toContain('PerfectWeek');
    expect(res.body.missionCoins).toBeGreaterThanOrEqual(500);
  });

  test('awards 500 coins on completion', async () => {
    await api.prepareDay(6);
    const res = await api.claimDaily();
    expect(res.body.missionCoins).toBeGreaterThanOrEqual(500);
  });

  test('resets to 0/7 on streak break mid-week', async () => {
    await claimThisWeek(4); // 4/7 this week
    await api.shiftClaim(-2); // break streak
    await api.claimDaily(); // streak broke → PerfectWeek resets, then re-increments to 1
    const m = await api.getMissions();
    expect(m.PerfectWeek.progress).toBe(1);
    expect(m.PerfectWeek.completed).toBe(false);
  });

  test('does NOT complete if streak breaks before day 7 this week', async () => {
    await claimThisWeek(5); // 5/7
    await api.shiftClaim(-2); // break streak
    const res = await api.claimDaily(); // PerfectWeek resets, increments to 1
    expect(res.body.missionsUpdated).not.toContain('PerfectWeek');
    const m = await api.getMissions();
    expect(m.PerfectWeek.progress).toBe(1);
  });

  test('resets to 0/7 after week expiry', async () => {
    await claimThisWeek(5);
    await api.expireWeek();
    const m = await api.getMissions();
    expect(m.PerfectWeek.progress).toBe(0);
  });

  test('PerfectWeek resets on streak break but WeeklyClaim7 does NOT', async () => {
    await claimThisWeek(4); // both at 4/7
    await api.shiftClaim(-2); // break
    await api.claimDaily();
    const m = await api.getMissions();
    // PerfectWeek resets (consecutive required), WeeklyClaim7 keeps going (just 7 claims)
    expect(m.PerfectWeek.progress).toBe(1);
    expect(m.WeeklyClaim7.progress).toBe(5); // was 4, incremented to 5
  });

  test('can complete in a new week after expiry', async () => {
    await api.prepareDay(6);
    await api.claimDaily(); // complete PerfectWeek week 1
    await api.expireWeek(); // new week
    await api.shiftClaim(-1);
    // Claim 7 consecutive days in new week
    const results = await claimThisWeek(7);
    const last = results[6];
    expect(last.missionsUpdated).toContain('PerfectWeek');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AlmostPerfectWeek — Claim at least 6 daily rewards this week
// ─────────────────────────────────────────────────────────────────────────────
describe('AlmostPerfectWeek – Claim at least 6 daily rewards this week', () => {
  test('completes on 6th claim this week and awards 250 coins', async () => {
    await claimThisWeek(5); // 5/6
    await api.shiftClaim(-1);
    const res = await api.claimDaily();
    expect(res.body.missionsUpdated).toContain('AlmostPerfectWeek');
    expect(res.body.missionCoins).toBeGreaterThanOrEqual(250);
  });

  test('does not complete on 5th claim', async () => {
    const results = await claimThisWeek(5);
    expect(results[4].missionsUpdated).not.toContain('AlmostPerfectWeek');
  });

  test('does NOT reset on streak break (only needs 6 claims, not consecutive)', async () => {
    await claimThisWeek(4); // 4/6
    await api.shiftClaim(-2); // break streak
    await api.claimDaily(); // 5th claim — progress should be 5, not reset
    const m = await api.getMissions();
    expect(m.AlmostPerfectWeek.progress).toBe(5);
    expect(m.AlmostPerfectWeek.completed).toBe(false);
  });

  test('completes across non-consecutive claims within the week', async () => {
    await claimThisWeek(3); // 3/6
    await api.shiftClaim(-2); // break streak (miss a day)
    await claimThisWeek(3); // 4th, 5th, 6th claim — should complete at 6
    const m = await api.getMissions();
    expect(m.AlmostPerfectWeek.completed).toBe(true);
  });

  test('AlmostPerfectWeek resets on week expiry but NOT on streak break', async () => {
    await claimThisWeek(4);
    await api.shiftClaim(-2); // break — progress preserved
    await api.claimDaily();
    const mAfterBreak = await api.getMissions();
    expect(mAfterBreak.AlmostPerfectWeek.progress).toBe(5); // not reset

    await api.expireWeek(); // week rolls over — NOW it resets
    const mAfterExpiry = await api.getMissions();
    expect(mAfterExpiry.AlmostPerfectWeek.progress).toBe(0);
  });

  test('resets to 0/6 after week expiry', async () => {
    await claimThisWeek(5); // 5/6
    await api.expireWeek();
    const m = await api.getMissions();
    expect(m.AlmostPerfectWeek.progress).toBe(0);
  });

  test('contrast with PerfectWeek: AlmostPerfectWeek survives a streak break, PerfectWeek does not', async () => {
    await claimThisWeek(3); // both at 3
    await api.shiftClaim(-2); // break
    await api.claimDaily();
    const m = await api.getMissions();
    expect(m.AlmostPerfectWeek.progress).toBe(4); // preserved
    expect(m.PerfectWeek.progress).toBe(1);       // reset by streak break
  });

  test('prepare-day n=29 shows AlmostPerfectWeek as completed (29 >= 6)', async () => {
    await api.prepareDay(29);
    const m = await api.getMissions();
    expect(m.AlmostPerfectWeek.completed).toBe(true);
    expect(m.AlmostPerfectWeek.rewardClaimed).toBe(true);
  });
});
