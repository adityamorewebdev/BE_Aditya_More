# Requirements
1) Don't alter User.js, UserGamePreferences.js, UserOnboarding.js.
2) There should be a globalconfig collection having documents as: there should be a schema to define both daily rewards and missions in two separate documents in this collection (store its values and associated metadata.) For actual values and metadata refer to "dailyrewards.json" & "missions.json"
3) There should be a dailyreward collection & a mission collection, which will store following information

```DailyReward Collection(Schema):
email,
status:"claimed",
Day:1 // keep adding it up, reset to 0 if (either day 7 is over OR )
ClaimDate://stores when it was last claimed,
Amount://explained further what to store here

Mission Collection(Schema):
email,
status:"claimed",
Amount://explained further what to store here
mission_name://name of mission (as fetched from globalconfig)
claimed_date://store when it was last claimed
```

### DailyReward and Mission Collections(Explained):
- DailyReward: Initially there's no data. Then when user clicks on "claim daily reward", day field becomes 1, claim day becomes that day, and amount becomes reward defined on that day(taken from GlobalConfig.json). After 24 hours, if there's no claim OR if 7 days are over(whichever is the earliest), Day restarts from 0
- Mission: Mission Collection — How it works
A document is written to the Mission collection only when a mission is completed. Before writing, always check if a document already exists for that email + mission_name — if yes, skip it.
email:        user@example.com
mission_name: "Streak10Days"
status:       "claimed"
amount:       mission reward from GlobalConfig (e.g. "300")
claimed_date: timestamp of when mission was completed

**Detection logic(run this after every claim button click)**


- Group 1 — Total claims ever (DailyClaim1, DailyClaim3Days, DailyClaim7Days) 
>totalClaims = count all DailyReward docs for this user.

>if totalClaims >= mission.count → mark claimed
- Group 2 — Streak (Streak5Days, Streak10Days, Streak30Days)

> streak = DailyReward.streak (current value after this claim)
>if streak >= mission.count → mark claimed
- Group 3 — This week (WeeklyClaim3/5/7, AlmostPerfectWeek, PerfectWeek)
>weeklyCount = count DailyReward docs where claimed_date is between Monday 00:00 and Sunday 23:59 of current week
> if weeklyCount >= mission.count → mark claimed

**Key rules**

- amount stores the mission reward, not the daily reward amount
- Mission check runs only on claim button click, no background timer needed
- Once status: "claimed" is written, that document is never touched again
- day (reward cycle) and streak are independent — day loops every 7, streak never loops, only resets on missed 24h
- AlmostPerfectWeek (6) and PerfectWeek (7) are separate documents — both can be earned in the same week



In frontend, coins will be an aggregate of daily amount and mission amount from dailyreward and missions collection respectively.