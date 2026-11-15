-- My Arcade: player accounts, leaderboards and admin tools.
-- Paste this whole file into Supabase (SQL Editor -> New query) and press Run.
-- Running it again later is safe: it only adds or updates what's missing.
--
-- How it works: the website can't touch any table directly. It can only call the functions
-- below (sign_up, sign_in, submit_score, leaderboard, admin_...), and each function checks
-- who you are using the session token you got when you signed in.

create extension if not exists pgcrypto with schema extensions;

-- ---------- Games that have a leaderboard ----------
create table if not exists public.games (
  id text primary key,
  title text not null
);
insert into public.games (id, title) values
  ('dodge', '🚀 Space Dodge'), ('stack', '🧱 Block Stack'), ('snake', '🐍 Snake'),
  ('pong', '🏓 Paddle Pong'), ('flappy', '🐦 Flappy Flight'), ('memory', '🧠 Memory Match'),
  ('invaders', '👾 Alien Invaders'), ('penalty', '⚽ Penalty Kicks'), ('tetris', '🟦 Block Drop'),
  ('2048', '🔢 2048'), ('breakout', '🟧 Brick Breaker'), ('mines', '💣 Minesweeper'),
  ('ttt', '❌ Tic-Tac-Toe'), ('dino', '🦖 Dino Run'), ('td', '🏰 Tower Defense'),
  ('fishing', '🎣 Island Fishing'), ('racing', '🏎️ Coin Rush Racing'), ('hamburger', '🍔 Tasty Hamburger')
on conflict (id) do update set title = excluded.title;

-- ---------- Players ----------
-- Passwords are checked with a scrambled copy (bcrypt hash). A readable copy is also kept so the
-- admin can look passwords up on the Admin page; the sign-in screen tells players this.
create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text,
  login_name text not null unique,          -- "first last" in lowercase, used to sign in
  password_hash text not null,
  is_admin boolean not null default false,
  failed_logins int not null default 0,     -- wrong passwords in a row
  locked_until timestamptz,                 -- too many wrong passwords: wait until this time
  created_at timestamptz not null default now()
);
-- Readable copy of the password, shown to the admin. Players who joined before this was added get
-- theirs saved the next time they sign in.
alter table public.players add column if not exists password_plain text;

create table if not exists public.sessions (
  token text primary key,
  player uuid not null references public.players on delete cascade,
  expires_at timestamptz not null default now() + interval '60 days'
);

-- Every finished game adds a row
create table if not exists public.scores (
  id bigint generated always as identity primary key,
  player uuid not null references public.players on delete cascade,
  game text not null references public.games,
  score int not null check (score between 0 and 10000000),
  created_at timestamptz not null default now()
);
create index if not exists scores_game_time on public.scores (game, created_at);

-- Points the admin added (positive) or removed (negative)
create table if not exists public.adjustments (
  id bigint generated always as identity primary key,
  player uuid not null references public.players on delete cascade,
  game text not null references public.games,
  points int not null check (points <> 0 and abs(points) <= 10000000),
  reason text,
  made_by uuid references public.players on delete set null,
  created_at timestamptz not null default now()
);

-- Lock every table: the website may only use the functions below
alter table public.games enable row level security;
alter table public.players enable row level security;
alter table public.sessions enable row level security;
alter table public.scores enable row level security;
alter table public.adjustments enable row level security;
revoke all on public.games, public.players, public.sessions, public.scores, public.adjustments from anon, authenticated;

-- ---------- Helpers ----------
create or replace function public.login_name(p_first text, p_last text) returns text
language sql immutable set search_path = '' as $$
  select lower(trim(regexp_replace(coalesce(p_first, '') || ' ' || coalesce(p_last, ''), '\s+', ' ', 'g')))
$$;

-- What the website gets back about a player
create or replace function public.player_json(p public.players) returns json
language sql stable set search_path = '' as $$
  select json_build_object('id', p.id, 'firstName', p.first_name, 'lastName', p.last_name,
    'name', p.first_name || coalesce(' ' || p.last_name, ''), 'isAdmin', p.is_admin)
$$;

-- Which player a session token belongs to (or an error asking them to sign in again)
create or replace function public.session_player(p_token text) returns public.players
language plpgsql stable security definer set search_path = '' as $$
declare p public.players;
begin
  select pl.* into p from public.sessions s join public.players pl on pl.id = s.player
    where s.token = p_token and s.expires_at > now();
  if not found then raise exception 'Please sign in again'; end if;
  return p;
end $$;

create or replace function public.new_session(p_player uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare t text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  delete from public.sessions where expires_at < now();
  insert into public.sessions (token, player) values (t, p_player);
  return t;
end $$;

-- ---------- Signing up, in and out ----------
-- These return {"token": ..., "player": {...}} or {"error": "..."}
create or replace function public.sign_up(p_first text, p_last text, p_password text) returns json
language plpgsql security definer set search_path = '' as $$
declare
  f text := left(trim(regexp_replace(coalesce(p_first, ''), '\s+', ' ', 'g')), 30);
  l text := nullif(left(trim(regexp_replace(coalesce(p_last, ''), '\s+', ' ', 'g')), 30), '');
  p public.players;
begin
  if f = '' then return json_build_object('error', 'Please type your first name.'); end if;
  if char_length(coalesce(p_password, '')) < 4 then
    return json_build_object('error', 'Your password needs at least 4 characters.');
  end if;
  if exists (select 1 from public.players where login_name = public.login_name(f, l)) then
    return json_build_object('error', 'Someone already has that name. Add your last name, or sign in if it''s you.');
  end if;
  insert into public.players (first_name, last_name, login_name, password_hash, password_plain)
    values (f, l, public.login_name(f, l), extensions.crypt(p_password, extensions.gen_salt('bf')), p_password)
    returning * into p;
  return json_build_object('token', public.new_session(p.id), 'player', public.player_json(p));
end $$;

create or replace function public.sign_in(p_first text, p_last text, p_password text) returns json
language plpgsql security definer set search_path = '' as $$
declare p public.players;
begin
  select * into p from public.players where login_name = public.login_name(p_first, p_last);
  if not found then return json_build_object('error', 'Wrong name or password.'); end if;
  if p.locked_until > now() then
    return json_build_object('error', 'Too many wrong passwords. Wait 5 minutes and try again.');
  end if;
  if p.password_hash <> extensions.crypt(coalesce(p_password, ''), p.password_hash) then
    -- 5 wrong passwords in a row locks the account for 5 minutes, so nobody can guess it
    update public.players set
      failed_logins = case when failed_logins >= 4 then 0 else failed_logins + 1 end,
      locked_until = case when failed_logins >= 4 then now() + interval '5 minutes' else locked_until end
      where id = p.id;
    return json_build_object('error', 'Wrong name or password.');
  end if;
  update public.players set failed_logins = 0, locked_until = null, password_plain = p_password where id = p.id;
  return json_build_object('token', public.new_session(p.id), 'player', public.player_json(p));
end $$;

create or replace function public.sign_out(p_token text) returns void
language sql security definer set search_path = '' as $$
  delete from public.sessions where token = p_token
$$;

-- The signed-in player (used when a page opens, to check the saved session still works)
create or replace function public.whoami(p_token text) returns json
language plpgsql stable security definer set search_path = '' as $$
begin
  return public.player_json(public.session_player(p_token));
end $$;

-- ---------- Scores and leaderboards ----------
create or replace function public.submit_score(p_token text, p_game text, p_score int) returns void
language plpgsql security definer set search_path = '' as $$
declare me public.players := public.session_player(p_token);
begin
  insert into public.scores (player, game, score) values (me.id, p_game, p_score);
end $$;

-- A player's leaderboard score = their best score in that game, plus any points the admin
-- added or removed. "week" only counts scores and point changes since Monday 00:00 (UTC).
create or replace function public.leaderboard(p_token text, p_game text, p_period text default 'all', p_limit int default 10)
returns table (rank bigint, player uuid, name text, score bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  me public.players := public.session_player(p_token);
  since timestamptz := case when p_period = 'week' then date_trunc('week', now()) else '-infinity'::timestamptz end;
begin
  return query
  with best as (
    select s.player, max(s.score)::bigint as score from public.scores s
    where s.game = p_game and s.created_at >= since group by s.player
  ),
  adj as (
    select a.player, sum(a.points)::bigint as points from public.adjustments a
    where a.game = p_game and a.created_at >= since group by a.player
  ),
  totals as (
    select coalesce(b.player, a.player) as player,
           greatest(coalesce(b.score, 0) + coalesce(a.points, 0), 0) as score
    from best b full join adj a on a.player = b.player
  )
  select rank() over (order by t.score desc), t.player,
         p.first_name || coalesce(' ' || p.last_name, ''), t.score
  from totals t join public.players p on p.id = t.player
  order by t.score desc, p.first_name
  limit least(greatest(p_limit, 1), 100);
end $$;

-- ---------- Admin tools ----------
create or replace function public.session_admin(p_token text) returns public.players
language plpgsql stable security definer set search_path = '' as $$
declare me public.players := public.session_player(p_token);
begin
  if not me.is_admin then raise exception 'Only the admin can do that'; end if;
  return me;
end $$;

drop function if exists public.admin_players(text);   -- its columns changed, so it's remade
create function public.admin_players(p_token text)
returns table (id uuid, name text, created_at timestamptz, is_admin boolean, password text)
language plpgsql stable security definer set search_path = '' as $$
declare me public.players := public.session_admin(p_token);
begin
  return query select p.id, p.first_name || coalesce(' ' || p.last_name, ''), p.created_at, p.is_admin, p.password_plain
    from public.players p order by p.first_name, p.last_name;
end $$;

create or replace function public.admin_adjust_points(p_token text, p_player uuid, p_game text, p_points int, p_reason text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare me public.players := public.session_admin(p_token);
begin
  insert into public.adjustments (player, game, points, reason, made_by)
    values (p_player, p_game, p_points, nullif(trim(p_reason), ''), me.id);
end $$;

-- Sets a new password for a player who forgot theirs.
-- It also signs them out everywhere, so they have to use the new password.
create or replace function public.admin_reset_password(p_token text, p_player uuid, p_new_password text)
returns void
language plpgsql security definer set search_path = '' as $$
declare me public.players := public.session_admin(p_token);
begin
  if char_length(coalesce(p_new_password, '')) < 4 then
    raise exception 'The new password needs at least 4 characters';
  end if;
  update public.players
    set password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf')), password_plain = p_new_password,
        failed_logins = 0, locked_until = null
    where id = p_player;
  if not found then raise exception 'No player with that id'; end if;
  delete from public.sessions where player = p_player;
end $$;

-- The website may call only these; the helpers above stay private
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.sign_up(text, text, text), public.sign_in(text, text, text), public.sign_out(text), public.whoami(text),
  public.submit_score(text, text, int), public.leaderboard(text, text, text, int),
  public.admin_players(text), public.admin_adjust_points(text, uuid, text, int, text),
  public.admin_reset_password(text, uuid, text)
  to anon, authenticated;

-- ---------- Making the admin ----------
-- After the admin has signed up on the site, run this once with their name to give them admin powers
-- (first and last name exactly as they signed up, in lowercase, with one space between):
--   update public.players set is_admin = true where login_name = 'firstname';            -- no last name
--   update public.players set is_admin = true where login_name = 'firstname lastname';   -- with a last name
