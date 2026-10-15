# Move Fast Bingo onto the Lovable Cloud database

Note: TanStack is the app's built-in engine and cannot be removed. Nothing about it is visible to players; it stays.

## Goal
Accounts, balances, live games and history are saved in the shared database instead of each phone's browser, so every player and the admin see the same data on any device.

## What changes for users
- Sign up / log in with phone number + password (real accounts, works across devices). Existing browser-only accounts are not carried over.
- Admin is a real admin role (no more hardcoded admin password in the app).
- Balances, deposits, withdrawals, coupons and bonuses are changed only by the server, so players cannot edit their own balance.
- One shared live game round: every player sees the same countdown, called balls, live players and pool in real time.
- Tickets and wins history kept for 30 days, viewable in the profile and by admin.
- Looks stay exactly the same.

## Steps
1. Accounts: enable phone+password sign-in (phone mapped to an internal login address, auto-confirmed), profiles (username, phone, referral code, games, wins), admin role table.
2. Wallet: balance kept on the server; deposit/withdraw requests, admin approve/reject, signup/referral bonuses, coupon redeem — all as server actions that check the caller.
3. Live game: a shared rounds table (game number, status, called balls, pattern, pool) plus live presence and player tickets, with real-time updates. Admin Pause / Continue / Restart / Stop write to the round. Joining deducts the stake on the server; Cancel & Refund returns it; wins pay out 35% pool on the server.
4. History: tickets and wins saved per player; admin activity log.
5. Settings: payment numbers, call speed, active patterns, force-winner saved for admin.
6. Rewire the app screens to read from these instead of browser storage; keep sound and language per device.
7. Test sign-up, join, cancel/refund, a full round with a win, and admin controls end to end.

## Technical details
- Tables: profiles, user_roles (+ has_role), wallets, transactions, coupons/coupon_redemptions, rounds, round_players (stake, cartella, daubs), presence, activity, app_settings, chat. RLS on all; balance-changing writes only via createServerFn with requireSupabaseAuth and supabaseAdmin after checks.
- Ball calling driven by the admin client writing to rounds (single caller), broadcast via realtime; win claims verified server-side against drawn balls.
- src/lib/store.ts becomes an async data layer; index.tsx updated to use React Query + realtime subscriptions.
- Telegram webhook keeps working and links tg id to profile.
