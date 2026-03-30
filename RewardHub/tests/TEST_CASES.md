# RewardHub Mission Test Cases

Integration tests using Jest + Supertest + MongoMemoryServer.
All tests run against an in-memory MongoDB instance with seeded mission definitions.

---

## Setup

| File | Purpose |
|------|---------|
| `testApp.js` | Minimal Express app wiring rewards, missions, and debug routes |
| `setup.js` | MongoMemoryServer lifecycle, mission seeding, user creation, data cleanup |
| `helpers.js` | `makeApi(app)` factory exposing typed HTTP calls; `expectedDailyCoins(n)` utility |

### API helpers used in tests

| Helper | HTTP call | What it does |
|--------|-----------|--------------|
| `claimDaily()` | `POST /api/rewards/claim-daily` | Performs a daily claim for the test user |
| `getMissions()` | `GET /api/missions` | Returns missions keyed by `mission_name` |
| `shiftClaim(days)` | `POST /api/debug/shift-claim?days=N` | Moves `lastClaimedAt` N days (e.g. `-1` = yesterday, `-2` = breaks streak) |
| `prepareDay(n)` | `POST /api/debug/prepare-day?n=N` | Sets every mission to the state it would be after N consecutive claims; next claim is "day N+1" |
| `expireWeek()` | `POST /api/debug/expire-week` | Sets `weekOf` to last Monday on all weekly missions, triggering a week-boundary reset |
| `claimDays(n)` | — | Helper that calls `claimDaily()` N times, with a `-1` day shift between each |

---

## daily.test.js — 39 Tests

### DailyClaim1 — Claim daily reward 1 time

A cumulative mission that completes on every single claim and immediately resets for the next day. Coins awarded: **10**.

| Test | What it verifies |
|------|-----------------|
| shows 0/1 before first claim | Fresh user has no progress |
| auto-awards on the very first claim | `missionsUpdated` contains `DailyClaim1` on first claim |
| awards exactly 10 mission coins | `newBalance` is at least daily coins + 10 |
| resets to 0/1 after auto-award (ready for next cycle) | After claiming, mission is marked `completed` and `rewardClaimed`; it resets on the next claim, not immediately |
| auto-awards again on the next day claim (cycles every claim) | After a day shift, second claim again includes `DailyClaim1` in `missionsUpdated` |
| awards coins on every single consecutive claim | Over 5 consecutive days, every claim awards DailyClaim1 |

---

### DailyClaim3Days — Claim daily reward 3 days

A cumulative mission that completes every 3 claims regardless of streak continuity. Coins awarded: **50**.

| Test | What it verifies |
|------|-----------------|
| shows 1/3 after first claim | Progress increments to 1 after one claim |
| shows 2/3 after second claim | Progress increments to 2 after two claims |
| completes on 3rd claim and awards 50 coins | Third claim triggers completion with ≥50 mission coins |
| resets and starts new cycle on 4th claim | After completion + one more claim, progress resets to 1/3 |
| progress is preserved after a streak break | Breaking the streak (2 days gap) does NOT reset progress; 2+1=3 completes the mission |
| completes across non-consecutive claims (not streak-dependent) | `missionsUpdated` contains `DailyClaim3Days` even when streak was broken |

---

### DailyClaim7Days — Claim daily reward 7 days

A cumulative mission that completes every 7 claims. Streak continuity does not matter. Coins awarded: **150**.

| Test | What it verifies |
|------|-----------------|
| increments correctly over 7 claims | Progress goes 1→2→3→4→5→6 over 6 days, then completes on 7th |
| completes on 7th claim and awards 150 coins | `missionsUpdated` contains `DailyClaim7Days`; mission coins ≥ 150 |
| resets to 1/7 on 8th claim (new cycle) | After completion, the 8th claim starts a new cycle at 1/7 |
| prepare-day n=29 shows 1/7 (29 mod 7 = 1) | `29 % 7 = 1`, so progress is at position 1 in the current cycle |
| progress is NOT reset on streak break | After 5 claims + streak break + 1 claim, progress is 6 (5+1), not reset |
| completes even with a streak break mid-way | Breaking the streak at 5/7 then claiming 2 more days still completes the mission |

---

### Streak5Days — Maintain 5-day reward streak

A streak-based mission that requires 5 consecutive daily claims. Resets to 0 if a day is missed. Coins awarded: **100**.

| Test | What it verifies |
|------|-----------------|
| shows 0/5 before any claim (streak not alive) | No progress before any claim |
| tracks progress equal to current streak count | Progress mirrors streak: 1, 2, 3, 4 over four consecutive days |
| completes on 5th consecutive claim and awards 100 coins | `prepareDay(4)` + claim completes the mission |
| shows 0/5 when streak is dead (missed a day) | After `shiftClaim(-2)`, streak is dead and displayed progress is 0 |
| resets to 1/5 after streak break and new claim | Claiming after a streak break resets progress to 1 |
| does NOT complete on day 5 after a streak break | A broken streak means the new streak starts at 1, not 5 |
| completes again after a break + 5 more consecutive days | A fresh 5-day streak after a break earns the reward again |
| prepare-day n=29 shows 4/5 (29 mod 5 = 4) | `29 % 5 = 4`, so streak progress is at position 4 |
| completes on next claim after prepare-day n=29 | `prepareDay(29)` + claim completes Streak5Days (streak moves to 30, 30%5=0, which cycles ≥5) |

---

### Streak10Days — Maintain 10-day reward streak

A streak-based mission requiring 10 consecutive daily claims. Resets on any missed day. Re-awards on every subsequent 10-day streak cycle. Coins awarded: **300**.

| Test | What it verifies |
|------|-----------------|
| completes on 10th consecutive claim and awards 300 coins | `prepareDay(9)` + claim triggers completion |
| does NOT complete if streak breaks before day 10 | Breaking the streak at day 9 resets progress to 1 |
| resets progress to 1 after streak break | After a break and one new claim, stored progress is 1 |
| prepare-day n=9 shows 9/10 | State is correctly set to 9/10 |
| prepare-day n=29 shows 9/10 (29 mod 10 = 9) | `29 % 10 = 9`, cycling position is 9 |
| auto-awards again after cycling (streak > 10 on subsequent claims) | After first completion at day 10, day 11 claim re-awards the mission (cycling behaviour) |

---

### Streak30Days — Maintain 30-day reward streak

A streak-based mission requiring 30 consecutive daily claims. The hardest daily mission. Coins awarded: **1000**.

| Test | What it verifies |
|------|-----------------|
| completes on 30th consecutive claim and awards 1000 coins | `prepareDay(29)` + claim triggers completion |
| does NOT complete if streak breaks at day 29 | Breaking on day 29 resets streak to 1, no award |
| shows 29/30 at prepare-day n=29 | Progress is correctly displayed as 29/30, not completed |
| shows 0/30 when streak is dead | A dead streak (missed day after 15 claims) displays 0 |
| newBalance includes 1000 mission coins on completion | Final balance equals daily reward coins + 1000 mission coins |

---

## weekly.test.js — 33 Tests

Weekly missions track claims made within the current calendar week (Mon–Sun). They reset every Monday. Streak continuity only matters for `PerfectWeek`.

---

### WeeklyClaim3 — Claim daily reward 3 times this week

Completes when the user has claimed on any 3 days within the current week. Coins awarded: **50**.

| Test | What it verifies |
|------|-----------------|
| shows 0/3 before any claim | Fresh state has 0 progress |
| increments to 1/3 after first claim | One claim moves progress to 1 |
| increments to 2/3 after second claim | Two claims (with day shift between) moves progress to 2 |
| completes on 3rd claim and awards 50 coins | Third in-week claim triggers completion with ≥50 mission coins |
| does not increment or award again after completion (same week) | A 4th claim in the same week does not re-award and `completed` stays true |
| resets to 0/3 after week expires | After `expireWeek()`, progress resets to 0 and `completed` is false |
| can complete again in a new week | After week expiry, completing 3 claims again awards the mission |
| prepare-day n=2 shows 2/3 for the current week | `prepareDay(2)` sets weekly progress to 2 within the current week |

---

### WeeklyClaim5 — Claim daily reward 5 times this week

Completes when the user has claimed on any 5 days within the current week. Coins awarded: **120**.

| Test | What it verifies |
|------|-----------------|
| completes on 5th claim this week and awards 120 coins | Fifth in-week claim triggers completion with ≥120 mission coins |
| does not complete on 4th claim | `missionsUpdated` does not include `WeeklyClaim5` after the 4th claim |
| resets on week expiry | After 4 claims + `expireWeek()`, progress drops to 0 |
| streak break does NOT reset weekly progress | Breaking the streak at 3/5, then claiming, keeps progress at 4 (not reset) |
| prepare-day n=29 shows WeeklyClaim5 as completed (29 >= 5) | Since 29 ≥ 5, the mission is fully completed and `rewardClaimed` is true |

---

### WeeklyClaim7 — Claim daily reward 7 times this week

Completes when the user has claimed on all 7 days of the current week. Streak continuity is not required. Coins awarded: **300**.

| Test | What it verifies |
|------|-----------------|
| completes on 7th claim this week and awards 300 coins | `prepareDay(6)` sets 6/7, then one claim completes it |
| does NOT reset on streak break (just needs 7 claims, not consecutive) | Breaking streak at 5/7 then claiming moves progress to 6, not reset |
| resets to 0/7 after week expiry | After `expireWeek()`, progress resets |
| prepare-day n=6 shows 6/7 | State correctly set to 6/7, not completed |
| prepare-day n=29 shows WeeklyClaim7 as completed (29 >= 7) | Since 29 ≥ 7, mission is completed |

---

### PerfectWeek — Claim rewards every day for 7 days

Requires 7 *consecutive* daily claims within the same week. Unlike other weekly missions, missing a day (breaking the streak) resets PerfectWeek's progress even within the same week. Coins awarded: **500**.

| Test | What it verifies |
|------|-----------------|
| completes on 7th consecutive claim within the week | `prepareDay(6)` (6 in-week, consecutive) + claim completes it |
| awards 500 coins on completion | Mission coins ≥ 500 on completion |
| resets to 0/7 on streak break mid-week | After 4 consecutive claims + streak break + claim, progress is 1 (reset then re-incremented) |
| does NOT complete if streak breaks before day 7 this week | Breaking at 5/7 resets PerfectWeek; the next claim is 1/7, not a completion |
| resets to 0/7 after week expiry | `expireWeek()` resets progress to 0 |
| PerfectWeek resets on streak break but WeeklyClaim7 does NOT | After 4 in-week claims + break + claim: PerfectWeek=1, WeeklyClaim7=5 (was 4, now 5) |
| can complete in a new week after expiry | After completing week 1, expiring, then claiming 7 consecutive days in week 2, `missionsUpdated` contains `PerfectWeek` |

---

### AlmostPerfectWeek — Claim at least 6 daily rewards this week

Completes when the user has claimed on any 6 days within the current week. Streak continuity is NOT required (unlike PerfectWeek). Coins awarded: **250**.

| Test | What it verifies |
|------|-----------------|
| completes on 6th claim this week and awards 250 coins | Sixth in-week claim (non-consecutive is fine) triggers completion |
| does not complete on 5th claim | `missionsUpdated` does not include `AlmostPerfectWeek` after the 5th claim |
| does NOT reset on streak break (only needs 6 claims, not consecutive) | Breaking streak at 4/6, then claiming, moves progress to 5 (not reset) |
| completes across non-consecutive claims within the week | 3 claims + streak break + 3 more claims = 6 total, mission completes |
| AlmostPerfectWeek resets on week expiry but NOT on streak break | After break: progress preserved at 5; after `expireWeek()`: resets to 0 |
| resets to 0/6 after week expiry | `expireWeek()` resets progress and clears completion |
| contrast with PerfectWeek: AlmostPerfectWeek survives a streak break, PerfectWeek does not | After 3 claims + break + claim: AlmostPerfectWeek=4 (preserved), PerfectWeek=1 (reset) |
| prepare-day n=29 shows AlmostPerfectWeek as completed (29 >= 6) | Since 29 ≥ 6, mission is completed and `rewardClaimed` is true |

---

## Mission behaviour summary

| Mission | Type | Resets on streak break? | Resets on week expiry? | Cycles? |
|---------|------|------------------------|------------------------|---------|
| DailyClaim1 | Cumulative | No | — | Yes (every claim) |
| DailyClaim3Days | Cumulative | No | — | Yes (every 3 claims) |
| DailyClaim7Days | Cumulative | No | — | Yes (every 7 claims) |
| Streak5Days | Streak | Yes (to 0) | — | Yes (re-awards every 5-day streak) |
| Streak10Days | Streak | Yes (to 0) | — | Yes (re-awards every 10-day streak) |
| Streak30Days | Streak | Yes (to 0) | — | Yes (re-awards every 30-day streak) |
| WeeklyClaim3 | Weekly | No | Yes | Yes (each week) |
| WeeklyClaim5 | Weekly | No | Yes | Yes (each week) |
| WeeklyClaim7 | Weekly | No | Yes | Yes (each week) |
| PerfectWeek | Weekly | **Yes** (unique) | Yes | Yes (each week) |
| AlmostPerfectWeek | Weekly | No | Yes | Yes (each week) |
