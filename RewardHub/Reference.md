# Requirements

### 
Frontend should get back the data in following format:

```
{
  "_id": {
    "$oid": "677cf20da1ca4ca2cfa85701"
  },
  "Mission": "Play 25 times",
  "count": 25,
  "type": "Daily",
  "reward": "500",
  "Image": "",
  "mission_name": "Play5min"
}
 
{
  "_id": {
    "$oid": "677cf342a1ca4ca2cfa8570c"
  },
  "Mission": "Play  150 times in a Day",
  "count": 150,
  "type": "Weekly",
  "reward": "2",
  "Image": "",
  "mission_name": "WeekPlay150Day"
}
```

Backend should store the collections in following way
```
//dailyrewards collection
{

  "_id": {

    "$oid": "69ae63df77be118d578e040c"

  },

  "email": "akash@gmail.com",

  "day": 1,

  "reward": 25

  "claimedAt": {

    "$date": "2026-03-09T06:08:31.361Z"

  },

  "status": "claimed",

  "createdAt": {

    "$date": "2026-03-09T06:08:31.377Z"

  },

  "updatedAt": {

    "$date": "2026-03-09T06:08:31.377Z"

  },

}

## missions collection ##

{
  "Mission": "Claim daily reward 1 time",
  "count": 1,
  "type": "Daily",
  "reward": "10",
  "Image": "",
  "mission_name": "DailyClaim1"
}


{
  "Mission": "Claim daily reward 3 days",
  "count": 3,
  "type": "Daily",
  "reward": "50",
  "Image": "",
  "mission_name": "DailyClaim3Days"
}


{
  "Mission": "Claim daily reward 7 days",
  "count": 7,
  "type": "Daily",
  "reward": "150",
  "Image": "",
  "mission_name": "DailyClaim7Days"
}


{
  "Mission": "Maintain 5-day reward streak",
  "count": 5,
  "type": "Daily",
  "reward": "100",
  "Image": "",
  "mission_name": "Streak5Days"
}


{
  "Mission": "Maintain 10-day reward streak",
  "count": 10,
  "type": "Daily",
  "reward": "300",
  "Image": "",
  "mission_name": "Streak10Days"
}


{
  "Mission": "Maintain 30-day reward streak",
  "count": 30,
  "type": "Daily",
  "reward": "1000",
  "Image": "",
  "mission_name": "Streak30Days"
}


{
  "Mission": "Claim daily reward 3 times this week",
  "count": 3,
  "type": "Weekly",
  "reward": "50",
  "Image": "",
  "mission_name": "WeeklyClaim3"
}


{
  "Mission": "Claim daily reward 5 times this week",
  "count": 5,
  "type": "Weekly",
  "reward": "120",
  "Image": "",
  "mission_name": "WeeklyClaim5"
}


{
  "Mission": "Claim daily reward 7 times this week",
  "count": 7,
  "type": "Weekly",
  "reward": "300",
  "Image": "",
  "mission_name": "WeeklyClaim7"
}


{
  "Mission": "Claim rewards every day for 7 days",
  "count": 7,
  "type": "Weekly",
  "reward": "500",
  "Image": "",
  "mission_name": "PerfectWeek"
}


{
  "Mission": "Claim at least 6 daily rewards this week",
  "count": 6,
  "type": "Weekly",
  "reward": "250",
  "Image": "",
  "mission_name": "AlmostPerfectWeek"
}

```