-- 同窗 · 数据库结构
-- 在 Supabase 控制台 → SQL Editor 中整段执行一次即可。

-- ───────────── tables ─────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  color smallint not null default 0,
  tz text not null default 'UTC',
  daily_goal_min int not null default 240 check (daily_goal_min between 10 and 1440),
  pomodoro_min int not null default 25 check (pomodoro_min between 5 and 180),
  break_min int not null default 5 check (break_min between 1 and 60),
  created_at timestamptz not null default now()
);

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  color smallint not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists subjects_user_idx on public.subjects(user_id);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  code text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index if not exists room_members_user_idx on public.room_members(user_id);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  task text not null default '',
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_ms bigint not null check (duration_ms >= 0),
  mode text not null default 'stopwatch' check (mode in ('stopwatch','pomodoro')),
  rating smallint check (rating between 1 and 5),
  note text not null default '',
  tz text not null default 'UTC',
  created_at timestamptz not null default now()
);
create index if not exists sessions_user_time_idx on public.sessions(user_id, started_at desc);

create table if not exists public.live_status (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state text not null default 'idle' check (state in ('focus','break','paused','idle')),
  task text not null default '',
  subject_name text not null default '',
  subject_color smallint,
  mode text not null default 'stopwatch',
  started_at timestamptz,
  planned_end timestamptz,
  accumulated_ms bigint not null default 0,
  running_since timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.kudos (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  from_user uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (char_length(emoji) <= 8),
  created_at timestamptz not null default now(),
  unique (session_id, from_user, emoji)
);
create index if not exists kudos_session_idx on public.kudos(session_id);

-- v2: pixel character look
alter table public.profiles add column if not exists look jsonb;

-- ───────────── helpers ─────────────
-- true when a and b are the same person or share at least one room
create or replace function public.shares_room(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select a = b or exists (
    select 1 from room_members m1 join room_members m2 on m1.room_id = m2.room_id
    where m1.user_id = a and m2.user_id = b
  );
$$;

create or replace function public.is_member(r uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from room_members where room_id = r and user_id = auth.uid());
$$;

create or replace function public.create_room(room_name text)
returns public.rooms language plpgsql security definer set search_path = public as $$
declare r rooms; c text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  loop
    c := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from rooms where code = c);
  end loop;
  insert into rooms(name, code, created_by) values (room_name, c, auth.uid()) returning * into r;
  insert into room_members(room_id, user_id) values (r.id, auth.uid());
  return r;
end $$;

create or replace function public.join_room(room_code text)
returns public.rooms language plpgsql security definer set search_path = public as $$
declare r rooms;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into r from rooms where code = upper(trim(room_code));
  if r.id is null then raise exception 'room not found'; end if;
  if (select count(*) from room_members where room_id = r.id) >= 12 then raise exception 'room full'; end if;
  insert into room_members(room_id, user_id) values (r.id, auth.uid()) on conflict do nothing;
  return r;
end $$;

-- a saved record can only be shortened (forgot to stop the timer), never lengthened or moved
create or replace function public.guard_session_edit()
returns trigger language plpgsql as $$
begin
  if new.duration_ms > old.duration_ms then raise exception 'duration can only be shortened'; end if;
  if new.started_at <> old.started_at then raise exception 'start time cannot change'; end if;
  if new.ended_at > old.ended_at then raise exception 'end time can only move earlier'; end if;
  if new.user_id <> old.user_id then raise exception 'owner cannot change'; end if;
  return new;
end $$;
drop trigger if exists sessions_guard_edit on public.sessions;
create trigger sessions_guard_edit before update on public.sessions
  for each row execute function public.guard_session_edit();

-- auto-create a profile for each new account
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles(id, name) values (new.id, split_part(coalesce(new.email, ''), '@', 1))
  on conflict do nothing;
  insert into live_status(user_id) values (new.id) on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────── row level security ─────────────
alter table public.profiles enable row level security;
alter table public.subjects enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.sessions enable row level security;
alter table public.live_status enable row level security;
alter table public.kudos enable row level security;

drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select using (public.shares_room(auth.uid(), id));
drop policy if exists "profiles write own" on public.profiles;
create policy "profiles write own" on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "subjects read" on public.subjects;
create policy "subjects read" on public.subjects for select using (public.shares_room(auth.uid(), user_id));
drop policy if exists "subjects write own" on public.subjects;
create policy "subjects write own" on public.subjects for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "rooms read" on public.rooms;
create policy "rooms read" on public.rooms for select using (public.is_member(id));
drop policy if exists "rooms update own" on public.rooms;
create policy "rooms update own" on public.rooms for update using (created_by = auth.uid());

drop policy if exists "members read" on public.room_members;
create policy "members read" on public.room_members for select using (public.is_member(room_id));
drop policy if exists "members leave" on public.room_members;
create policy "members leave" on public.room_members for delete using (user_id = auth.uid());

drop policy if exists "sessions read" on public.sessions;
create policy "sessions read" on public.sessions for select using (public.shares_room(auth.uid(), user_id));
drop policy if exists "sessions write own" on public.sessions;
create policy "sessions write own" on public.sessions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "live read" on public.live_status;
create policy "live read" on public.live_status for select using (public.shares_room(auth.uid(), user_id));
drop policy if exists "live write own" on public.live_status;
create policy "live write own" on public.live_status for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "kudos read" on public.kudos;
create policy "kudos read" on public.kudos for select using (
  exists (select 1 from sessions s where s.id = session_id and public.shares_room(auth.uid(), s.user_id))
);
drop policy if exists "kudos give" on public.kudos;
create policy "kudos give" on public.kudos for insert with check (
  from_user = auth.uid() and
  exists (select 1 from sessions s where s.id = session_id and public.shares_room(auth.uid(), s.user_id))
);
drop policy if exists "kudos take back" on public.kudos;
create policy "kudos take back" on public.kudos for delete using (from_user = auth.uid());

-- ───────────── realtime ─────────────
alter table public.kudos replica identity full;
alter table public.sessions replica identity full;
do $$ begin
  begin alter publication supabase_realtime add table public.live_status; exception when others then null; end;
  begin alter publication supabase_realtime add table public.sessions; exception when others then null; end;
  begin alter publication supabase_realtime add table public.kudos; exception when others then null; end;
end $$;

-- ───────────── R-005 个人状态 ─────────────
-- A short status ("😴 睡觉了") on the existing live_status row. Only the current status is stored;
-- the app hides it once status_until has passed (null = until cleared by hand).
-- Reads/writes are covered by the existing "live read" / "live write own" policies,
-- and live_status is already in the supabase_realtime publication. Safe to run again.
alter table public.live_status add column if not exists status_emoji text;
alter table public.live_status add column if not exists status_text text;
alter table public.live_status add column if not exists status_until timestamptz;
alter table public.live_status add column if not exists status_set_at timestamptz;
do $$ begin
  alter table public.live_status add constraint live_status_status_len
    check (char_length(status_emoji) <= 16 and char_length(status_text) <= 20);
exception when duplicate_object then null; end $$;
do $$ begin
  begin alter publication supabase_realtime add table public.live_status; exception when others then null; end;
end $$;
