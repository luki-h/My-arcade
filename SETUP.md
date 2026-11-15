# Turning on accounts and leaderboards

The arcade keeps player accounts and leaderboards in **Supabase**, an online database.
The **free plan** is all it needs. Never pick a paid plan or add a payment card.
Until these steps are done, the arcade works like before: no sign-in screen, and every
leaderboard says "Leaderboards aren't switched on yet".

## 1. Make a free Supabase project
1. Go to <https://supabase.com> and sign up (free).
2. Click **New project**. Choose the **Free** plan, give it any name (like `my-arcade`),
   make up a database password (you won't need it here), and pick the region closest to you.
3. Wait a minute or two while it gets ready.

## 2. Set up the database
1. In the project, open **SQL Editor** → **New query**.
2. Open [`supabase/setup.sql`](supabase/setup.sql) from this repo, copy **all** of it, paste it in,
   and press **Run**. You should see "Success. No rows returned".

## 3. Connect the website to it
1. In Supabase, open **Project Settings** → **API Keys** (and **Data API** for the URL).
2. Copy the **Project URL** and the **publishable** key (older projects call it the `anon` key).
   Never use the `secret` / `service_role` key.
3. Paste them into [`games/arcade-config.js`](games/arcade-config.js) instead of
   `YOUR-PROJECT-URL` and `YOUR-PUBLISHABLE-KEY`, then commit and push.

## 4. Make the admin account
1. Open the arcade and **Sign up** with the admin's name and password, like any player.
2. Back in Supabase **SQL Editor**, run this with the admin's name, in lowercase
   (first name only, or first and last name with one space between):
   ```sql
   update public.players set is_admin = true where login_name = 'firstname';
   ```
3. Sign out and back in. The home page menu now has a **🛠️ Admin** link.

## Good to know
- **Passwords are stored scrambled**, so nobody, including the admin, can read them. If a player
  forgets theirs, the admin sets a new one on the Admin page.
- 5 wrong passwords in a row locks that account for 5 minutes, so nobody can guess passwords.
- **"This week"** leaderboards start over every Monday at 00:00 UTC (Sunday evening in the US).
- A leaderboard score is the player's best score in that game, plus any points the admin added or removed.
- Free Supabase projects **pause after a week with no visitors**. If the arcade says it can't reach
  the server, open your project on supabase.com and click **Restore**.
