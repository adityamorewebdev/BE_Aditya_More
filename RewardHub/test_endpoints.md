|Endpoint|What it does|
|:----|:----|
|POST /api/debug/prepare-day?n=2|Ready to complete "Claim daily reward 3 days" on next claim|
|POST /api/debug/prepare-day?n=4|Ready to complete "Maintain 5-day streak" on next claim|
|POST /api/debug/prepare-day?n=9	|Ready to complete "Maintain 10-day streak" on next claim|
|POST /api/debug/prepare-day?n=29|Ready to complete "Maintain 30-day streak" on next claim|
|POST /api/debug/reset-coins|Sets coinBalance and totalCoinsEarned to 0|
|POST /api/debug/reset-missions|Wipes progress + streak (full clean slate)|