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

-- ───────────── R-019 删除与合并科目 ─────────────
-- 把重复科目 from_id 下的所有记录挪到 to_id，然后删掉 from_id；返回挪动的记录数。
-- 两个科目都必须属于当前用户。guard_session_edit 只限制时长/时间/归属，不拦 subject_id。
-- 删除科目本身走普通 delete（RLS “subjects write own”），sessions.subject_id 为 on delete set null，记录变成未分类。
create or replace function public.merge_subject(from_id uuid, to_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if from_id = to_id then raise exception 'cannot merge a subject into itself'; end if;
  -- lock both rows so concurrent merges of the same pair serialize
  perform 1 from subjects where id in (from_id, to_id) and user_id = auth.uid() for update;
  if not exists (select 1 from subjects where id = to_id and user_id = auth.uid()) then
    raise exception 'subject not found';
  end if;
  if not exists (select 1 from subjects where id = from_id and user_id = auth.uid()) then
    return 0; -- already merged (idempotent retry)
  end if;
  update sessions set subject_id = to_id where subject_id = from_id and user_id = auth.uid();
  get diagnostics n = row_count;
  -- R-025: my to-dos follow the subject too (the table exists once the whole script has run)
  if to_regclass('public.todos') is not null then
    execute 'update public.todos set subject_id = $1 where subject_id = $2 and user_id = auth.uid()' using to_id, from_id;
  end if;
  delete from subjects where id = from_id and user_id = auth.uid();
  return n;
end $$;
revoke all on function public.merge_subject(uuid, uuid) from public, anon;
grant execute on function public.merge_subject(uuid, uuid) to authenticated;

-- ───────────── R-001 / R-002 专注模式（v1.4）：倒计时模式 + 专注偏好 ─────────────
-- 幂等：可重复运行。sessions.mode 新增 'countdown'（'stopwatch' 即“心流”）；profiles 新增 focus_prefs。
alter table public.sessions drop constraint if exists sessions_mode_check;
alter table public.sessions add constraint sessions_mode_check check (mode in ('stopwatch','pomodoro','countdown'));
alter table public.profiles add column if not exists focus_prefs jsonb;

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

-- ───────────── R-007 收工（每日总结） ─────────────
-- one row per person per local day (day = the reviewer's own date key, not UTC)
create table if not exists public.daily_reviews (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  energy smallint check (energy between 1 and 3),
  impact smallint check (impact between 1 and 4),
  note text not null default '' check (char_length(note) <= 140),
  total_ms bigint not null default 0 check (total_ms >= 0),
  tz text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
create index if not exists daily_reviews_day_idx on public.daily_reviews(day desc);

alter table public.daily_reviews enable row level security;
drop policy if exists "reviews read" on public.daily_reviews;
create policy "reviews read" on public.daily_reviews for select using (public.shares_room(auth.uid(), user_id));
drop policy if exists "reviews write own" on public.daily_reviews;
create policy "reviews write own" on public.daily_reviews for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.daily_reviews replica identity full;
do $$ begin
  begin alter publication supabase_realtime add table public.daily_reviews; exception when others then null; end;
end $$;

-- ───────────── R-020 留言板（贴纸墙） ─────────────
-- 主页上的便利贴：一句短话（≤ 60 字）和/或一张像素贴纸（贴纸 id 由前端定义，如 'coffee'）。
-- 同自习室的人能看、能给对方留言；自己也能给自己留（当备忘）。留言的人和主人都能撕掉，不能修改。可重复运行。
create table if not exists public.guestbook (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  text text check (char_length(text) <= 60),
  sticker text check (char_length(sticker) <= 32),
  created_at timestamptz not null default now(),
  constraint guestbook_not_empty check (coalesce(btrim(text), '') <> '' or coalesce(sticker, '') <> '')
);
create index if not exists guestbook_owner_idx on public.guestbook(owner_id, created_at desc);

alter table public.guestbook enable row level security;
drop policy if exists "guestbook read" on public.guestbook;
create policy "guestbook read" on public.guestbook for select using (public.shares_room(auth.uid(), owner_id));
drop policy if exists "guestbook write" on public.guestbook;
create policy "guestbook write" on public.guestbook for insert with check (
  author_id = auth.uid() and (owner_id = auth.uid() or public.shares_room(auth.uid(), owner_id))
);
drop policy if exists "guestbook delete" on public.guestbook;
create policy "guestbook delete" on public.guestbook for delete using (author_id = auth.uid() or owner_id = auth.uid());
-- 没有 update 策略：便利贴贴上就不能改

alter table public.guestbook replica identity full;
do $$ begin
  begin alter publication supabase_realtime add table public.guestbook; exception when others then null; end;
end $$;

-- ───────────── R-023 留言回复 ─────────────
-- 回复也是 guestbook 的一行：parent_id 指向被回复的便利贴（只回一层），reply_to 是被回复的人（用来通知 TA）。
-- 回复只有文字。便利贴撕掉，下面的回复一起没。可重复运行。
alter table public.guestbook add column if not exists parent_id uuid references public.guestbook(id) on delete cascade;
alter table public.guestbook add column if not exists reply_to uuid references auth.users(id) on delete set null;
create index if not exists guestbook_parent_idx on public.guestbook(parent_id, created_at);
create index if not exists guestbook_reply_to_idx on public.guestbook(reply_to);
do $$ begin
  alter table public.guestbook add constraint guestbook_reply_text check (parent_id is null or (sticker is null and coalesce(btrim(text), '') <> ''));
exception when duplicate_object then null; end $$;
-- 回复必须挂在同一块留言板的顶层便利贴下
create or replace function public.guestbook_parent_ok(p uuid, o uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p is null or exists (select 1 from public.guestbook g where g.id = p and g.owner_id = o and g.parent_id is null)
$$;
drop policy if exists "guestbook write" on public.guestbook;
create policy "guestbook write" on public.guestbook for insert with check (
  author_id = auth.uid() and (owner_id = auth.uid() or public.shares_room(auth.uid(), owner_id))
  and public.guestbook_parent_ok(parent_id, owner_id)
);

-- ───────────── R-024 自习记录评论 ─────────────
-- 动态里每条专注记录下面可以评论（≤ 100 字）。owner_id 是记录的主人，冗余存一份，方便按人读取和实时推送。
-- 同自习室的人能看能评；评论的人和记录主人能删；不能修改。记录删掉，评论一起没。可重复运行。
create table if not exists public.session_comments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  text text not null check (char_length(btrim(text)) between 1 and 100),
  created_at timestamptz not null default now()
);
create index if not exists session_comments_session_idx on public.session_comments(session_id, created_at);
create index if not exists session_comments_owner_idx on public.session_comments(owner_id, created_at desc);

alter table public.session_comments enable row level security;
drop policy if exists "comments read" on public.session_comments;
create policy "comments read" on public.session_comments for select using (public.shares_room(auth.uid(), owner_id));
drop policy if exists "comments write" on public.session_comments;
create policy "comments write" on public.session_comments for insert with check (
  author_id = auth.uid() and public.shares_room(auth.uid(), owner_id)
  and exists (select 1 from public.sessions s where s.id = session_id and s.user_id = owner_id)
);
drop policy if exists "comments delete" on public.session_comments;
create policy "comments delete" on public.session_comments for delete using (author_id = auth.uid() or owner_id = auth.uid());

alter table public.session_comments replica identity full;
do $$ begin
  begin alter publication supabase_realtime add table public.session_comments; exception when others then null; end;
end $$;

-- ───────────── R-025 待办 ─────────────
-- 只有自己能看能改。每条待办：一句话（≤ 80 字）、一个科目（可空）、一个预估时间（固定几档）、完成时间（空 = 没做完）。
-- 从待办开始的专注，sessions.todo_id 记下是哪条，用来算“已用多久”；同窗能看到记录，但看不到待办本身。可重复运行。
create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  text text not null check (char_length(btrim(text)) between 1 and 80),
  subject_id uuid references public.subjects(id) on delete set null,
  estimate_min integer check (estimate_min between 1 and 600), -- 分钟；null = 没估
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists todos_user_idx on public.todos(user_id, created_at);
-- v1.8.2：预估时间改成可选（v1.8.0 建的表里它还是必填）
alter table public.todos alter column estimate_min drop not null;
alter table public.todos alter column estimate_min drop default;
-- v1.8.3：预估时间可以自己填（1–600 分钟），不再只限几档
alter table public.todos drop constraint if exists todos_estimate_min_check;
alter table public.todos add constraint todos_estimate_min_check check (estimate_min between 1 and 600);
alter table public.todos enable row level security;
drop policy if exists "todos own" on public.todos;
create policy "todos own" on public.todos for all using (user_id = auth.uid()) with check (user_id = auth.uid());
alter table public.sessions add column if not exists todo_id uuid references public.todos(id) on delete set null;
create index if not exists sessions_todo_idx on public.sessions(todo_id) where todo_id is not null;

-- ───────────── R-026 科目文件夹 ─────────────
-- 把几个科目放进一个文件夹（只有一层）。文件夹只有自己能看能改；subjects.folder_id 指向它，删掉文件夹时科目回到最外层。可重复运行。
create table if not exists public.subject_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  created_at timestamptz not null default now()
);
create index if not exists subject_folders_user_idx on public.subject_folders(user_id, created_at);
alter table public.subject_folders enable row level security;
drop policy if exists "folders own" on public.subject_folders;
create policy "folders own" on public.subject_folders for all using (user_id = auth.uid()) with check (user_id = auth.uid());
alter table public.subjects add column if not exists folder_id uuid references public.subject_folders(id) on delete set null;

-- ───────────── R-020 个人主页 ─────────────
-- 幂等：可重复运行。签名、小组件列表和各自设置存在 profiles.page 里，结构：
--   { "bio": "≤40 字", "widgets": [{ "id", "type", "size": "s"|"w", "config": {} }], "guestbook": false（关掉留言板时才有） }
-- 读写权限沿用 profiles 已有的 RLS：同自习室可读，只能改自己的。徽章由专注记录算出，不单独存。
alter table public.profiles add column if not exists page jsonb;

-- ───────────── v1.11 信号表：戳一下 / 加油 / 邀请 ─────────────
-- 以前这些信号走公开的 Realtime 广播频道 user:<id>，任何拿到网页 anon key 的人都能伪造，
-- 而且对方页面关着就收不到。现在写进这张表：只能发给同一自习室的人，限频，对方关着页面也能收到推送。
-- 只有收发双方能读；旧记录 7 天后清理。可重复运行。
create table if not exists public.signals (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null default auth.uid() references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('poke', 'cheer', 'invite')),
  payload jsonb not null default '{}'::jsonb check (octet_length(payload::text) <= 1000),
  created_at timestamptz not null default now()
);
create index if not exists signals_to_idx on public.signals(to_user, created_at desc);
create index if not exists signals_from_idx on public.signals(from_user, created_at desc);
alter table public.signals enable row level security;
drop policy if exists "signals read" on public.signals;
create policy "signals read" on public.signals for select using (to_user = auth.uid() or from_user = auth.uid());
drop policy if exists "signals send" on public.signals;
create policy "signals send" on public.signals for insert with check (
  from_user = auth.uid() and to_user <> auth.uid() and public.shares_room(auth.uid(), to_user)
);

-- 内容检查 + 限频：同一个人一分钟最多 3 次，总共一分钟最多 20 次
create or replace function public.guard_signal()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'cheer' and char_length(coalesce(new.payload->>'text', '')) not between 1 and 60 then
    raise exception 'signal text must be 1-60 characters';
  end if;
  if new.kind = 'invite' and (
    coalesce(new.payload->>'mode', '') not in ('pomodoro', 'stopwatch', 'countdown')
    or coalesce((new.payload->>'minutes')::int, 0) not between 1 and 600
    or char_length(coalesce(new.payload->>'task', '')) > 80
  ) then
    raise exception 'bad invite';
  end if;
  if (select count(*) from signals where from_user = new.from_user and to_user = new.to_user and created_at > now() - interval '1 minute') >= 3
     or (select count(*) from signals where from_user = new.from_user and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'too many signals';
  end if;
  delete from signals where from_user = new.from_user and created_at < now() - interval '7 days';
  return new;
end $$;
drop trigger if exists signals_guard on public.signals;
create trigger signals_guard before insert on public.signals for each row execute function public.guard_signal();

do $$ begin
  begin alter publication supabase_realtime add table public.signals; exception when others then null; end;
end $$;

-- ───────────── v1.11 推送通知（Web Push） ─────────────
-- 每台开了推送的设备（浏览器 / 加到主屏幕的 iPhone）一行。endpoint 是推送服务给的地址，本身就是凭据，所以只有本人能读写。
-- 同一台设备换了账号登录时，save_push_subscription 会把这台设备转到新账号名下。可重复运行。
create table if not exists public.push_subscriptions (
  endpoint text primary key check (char_length(endpoint) <= 1000),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  ua text not null default '' check (char_length(ua) <= 200),
  created_at timestamptz not null default now(),
  last_ok_at timestamptz
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
drop policy if exists "push own" on public.push_subscriptions;
create policy "push own" on public.push_subscriptions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_ua text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from push_subscriptions where endpoint = p_endpoint and user_id <> auth.uid();
  insert into push_subscriptions(endpoint, user_id, p256dh, auth, ua) values (p_endpoint, auth.uid(), p_p256dh, p_auth, left(coalesce(p_ua, ''), 200))
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, ua = excluded.ua;
end $$;

-- 推送函数的地址和暗号。只有数据库自己（security definer 函数）能读：开了 RLS 又没有任何策略。
-- 配置方法见 docs/web-push.md；没配置时下面的触发器什么都不做。
create table if not exists public.push_config (
  id boolean primary key default true check (id),
  function_url text not null,
  secret text not null
);
alter table public.push_config enable row level security;
revoke all on public.push_config from anon, authenticated;

do $$ begin create extension if not exists pg_net; exception when others then null; end $$;

-- 把一条事件交给 Edge Function `webpush`，由它决定推给谁、写什么。失败不影响原来的写入。
create or replace function public.push_notify(event jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare c push_config;
begin
  select * into c from push_config where id;
  if c.function_url is null then return; end if;
  begin
    perform net.http_post(
      url := c.function_url,
      body := event,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-tongchuang-secret', c.secret)
    );
  exception when others then null; -- pg_net 没开：推送不出去，但不影响写入
  end;
end $$;
revoke execute on function public.push_notify(jsonb) from public, anon, authenticated;

create or replace function public.push_on_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.push_notify(jsonb_build_object('type', tg_table_name, 'record', to_jsonb(new)));
  return null;
end $$;
revoke execute on function public.push_on_insert() from public, anon, authenticated;

drop trigger if exists signals_push on public.signals;
create trigger signals_push after insert on public.signals for each row execute function public.push_on_insert();
drop trigger if exists kudos_push on public.kudos;
create trigger kudos_push after insert on public.kudos for each row execute function public.push_on_insert();
drop trigger if exists session_comments_push on public.session_comments;
create trigger session_comments_push after insert on public.session_comments for each row execute function public.push_on_insert();
drop trigger if exists guestbook_push on public.guestbook;
create trigger guestbook_push after insert on public.guestbook for each row execute function public.push_on_insert();

-- ───────────── v1.11 R-006 跨设备计时 ─────────────
-- 进行中的专注（state）和等待复盘的那一段（pending）以前只存在各自浏览器里，手机和电脑会各算一份。
-- 现在每人一行，只有本人能读；只能通过 focus_write() 改，并且要带上次看到的版本号：
-- 两台设备同时操作时只有一台写得进去，另一台拿到最新状态后照着显示，所以不会重复计时、重复记录。
-- 保存复盘时，写记录和清掉 pending 在同一个事务里完成。state / pending 的结构见 lib/focus.tsx（FocusState / PendingReflection）。
-- due_at：当前这一段计划结束的时间，到点后由 pg_cron 推送“时间到了”（页面关着也能收到）。可重复运行。
create table if not exists public.focus_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  version bigint not null default 0,
  holder text not null default '' check (char_length(holder) <= 64),
  holder_label text not null default '' check (char_length(holder_label) <= 40),
  state jsonb check (state is null or octet_length(state::text) <= 4000),
  pending jsonb check (pending is null or octet_length(pending::text) <= 4000),
  due_at timestamptz,
  due_info jsonb check (due_info is null or octet_length(due_info::text) <= 1000),
  due_notified_at timestamptz,
  -- which reflections were saved (their pending.startedAt), so the same one is never saved twice
  saved_keys bigint[] not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.focus_state enable row level security;
drop policy if exists "focus read own" on public.focus_state;
create policy "focus read own" on public.focus_state for select using (user_id = auth.uid());
-- no insert / update / delete policies: writes only go through focus_write()
do $$ begin
  begin alter publication supabase_realtime add table public.focus_state; exception when others then null; end;
end $$;

create or replace function public.focus_row_json(f public.focus_state)
returns jsonb language sql stable as $$
  select jsonb_build_object('version', f.version, 'holder', f.holder, 'holder_label', f.holder_label,
    'state', f.state, 'pending', f.pending, 'updated_at', f.updated_at,
    'due_at', (extract(epoch from f.due_at) * 1000)::bigint, 'due_info', f.due_info, 'saved_keys', to_jsonb(f.saved_keys))
$$;

-- current state plus the server clock (the client uses it to correct its own clock)
create or replace function public.focus_get()
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); f focus_state;
begin
  if me is null then raise exception 'not signed in'; end if;
  insert into focus_state(user_id) values (me) on conflict do nothing;
  select * into f from focus_state where user_id = me;
  return jsonb_build_object('row', focus_row_json(f), 'now', (extract(epoch from clock_timestamp()) * 1000)::bigint);
end $$;

-- compare-and-set: writes only when p_expected is still the current version; otherwise returns the current row.
-- p_session (optional) is the record to save in the same transaction, e.g. when a reflection is saved;
-- p_pending_key names which reflection it is: one that was already saved is refused, whatever the version.
create or replace function public.focus_write(
  p_expected bigint, p_device text, p_label text, p_state jsonb, p_pending jsonb,
  p_due_at timestamptz default null, p_due_info jsonb default null, p_session jsonb default null, p_pending_key bigint default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); f focus_state; s sessions; subj uuid; todo uuid;
  now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
begin
  if me is null then raise exception 'not signed in'; end if;
  insert into focus_state(user_id) values (me) on conflict do nothing;
  select * into f from focus_state where user_id = me for update;
  if p_session is not null and p_pending_key is not null and p_pending_key = any(f.saved_keys) then
    return jsonb_build_object('ok', false, 'saved', true, 'row', focus_row_json(f), 'now', now_ms);
  end if;
  if f.version <> p_expected then
    return jsonb_build_object('ok', false, 'row', focus_row_json(f), 'now', now_ms);
  end if;
  if p_session is not null then
    -- the subject or to-do may have been deleted on another device meanwhile: keep the record without the link
    subj := nullif(p_session->>'subject_id', '')::uuid;
    if subj is not null and not exists (select 1 from subjects where id = subj and user_id = me) then subj := null; end if;
    todo := nullif(p_session->>'todo_id', '')::uuid;
    if todo is not null and not exists (select 1 from todos where id = todo and user_id = me) then todo := null; end if;
    insert into sessions(user_id, subject_id, task, started_at, ended_at, duration_ms, mode, rating, note, tz, todo_id)
    values (me, subj, left(coalesce(p_session->>'task', ''), 200),
      to_timestamp((p_session->>'started_at')::bigint / 1000.0), to_timestamp((p_session->>'ended_at')::bigint / 1000.0),
      (p_session->>'duration_ms')::bigint, coalesce(p_session->>'mode', 'stopwatch'),
      nullif(p_session->>'rating', '')::smallint, left(coalesce(p_session->>'note', ''), 500), coalesce(p_session->>'tz', 'UTC'), todo)
    returning * into s;
  end if;
  update focus_state set
    version = f.version + 1,
    holder = left(coalesce(p_device, ''), 64), holder_label = left(coalesce(p_label, ''), 40),
    state = p_state, pending = p_pending,
    due_at = p_due_at, due_info = p_due_info,
    due_notified_at = case when p_due_at is not distinct from f.due_at then f.due_notified_at end,
    -- remember the last 20 saved reflections
    saved_keys = case when p_session is not null and p_pending_key is not null
      then (array_append(f.saved_keys, p_pending_key))[greatest(1, coalesce(array_length(f.saved_keys, 1), 0) - 18):]
      else f.saved_keys end,
    updated_at = now()
  where user_id = me returning * into f;
  return jsonb_build_object('ok', true, 'row', focus_row_json(f), 'now', now_ms,
    'session', case when s.id is null then null else to_jsonb(s) end);
end $$;

-- every minute: tell people whose timed block just ended (only once per block; skips anything over 30 minutes late)
create or replace function public.focus_due_tick()
returns integer language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0;
begin
  for r in
    select user_id, due_info from focus_state
    where due_at is not null and due_at <= now() and due_at > now() - interval '30 minutes' and due_notified_at is null
    for update skip locked
  loop
    update focus_state set due_notified_at = now() where user_id = r.user_id;
    perform push_notify(jsonb_build_object('type', 'focus_due', 'record', coalesce(r.due_info, '{}'::jsonb) || jsonb_build_object('user_id', r.user_id)));
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.focus_due_tick() from public, anon, authenticated;

do $$ begin
  begin create extension if not exists pg_cron; exception when others then null; end;
  begin perform cron.schedule('tongchuang-focus-due', '* * * * *', 'select public.focus_due_tick()'); exception when others then null; end;
end $$;

-- ───────────── 最后：让 Supabase 的 API 立刻认识新加的列和表 ─────────────
-- 不加这一句时，偶尔会看到 “Could not find the 'xxx' column of 'yyy' in the schema cache”
notify pgrst, 'reload schema';
