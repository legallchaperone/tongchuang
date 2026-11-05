-- v1.11 R-006: focus_state compare-and-set
\set A '''00000000-0000-0000-0000-00000000000a'''
\set B '''00000000-0000-0000-0000-00000000000b'''

select test_as(:A);
-- first read creates the row at version 0 and reports the server clock
select expect((public.focus_get()->'row'->>'version')::int = 0, 'new row starts at version 0');
select expect(abs((public.focus_get()->>'now')::bigint - (extract(epoch from now()) * 1000)::bigint) < 60000, 'server clock is reported in ms');

-- phone starts a focus block
select expect((public.focus_write(0, 'phone', 'iPhone', '{"phase":"focus","task":"线代"}', null, now() + interval '25 minutes', '{"phase":"focus","task":"线代","break_min":5}')->>'ok')::boolean, 'phone writes v0 → v1');
-- the laptop still thinks it is version 0: refused, and it gets the phone's state back
create temp table r as select public.focus_write(0, 'laptop', 'Mac', '{"phase":"focus","task":"英语"}', null) as j;
select expect(not (select (j->>'ok')::boolean from r), 'stale write is refused');
select expect((select j->'row'->'state'->>'task' from r) = '线代', 'refused write returns the current state');
select expect((select (j->'row'->>'version')::int from r) = 1, 'refused write returns the current version');
select expect((select j->'row'->>'holder_label' from r) = 'iPhone', 'and who wrote it');

-- the laptop takes over with the right version
select expect((public.focus_write(1, 'laptop', 'Mac', '{"phase":"focus","task":"线代","runningSince":1}', null, now() + interval '20 minutes', null)->>'ok')::boolean, 'laptop writes v1 → v2');

-- finishing: the record and the cleared pending land together, exactly once
create temp table done as select public.focus_write(2, 'laptop', 'Mac', null, null, null, null,
  jsonb_build_object('task', '线代', 'started_at', 1762300000000, 'ended_at', 1762301500000, 'duration_ms', 1500000, 'mode', 'pomodoro', 'rating', 4, 'note', '还行', 'tz', 'Asia/Shanghai',
    'subject_id', '20000000-0000-0000-0000-000000000099')) as j;
select expect((select (j->>'ok')::boolean from done), 'finish commits');
select expect((select j->'session'->>'duration_ms' from done) = '1500000', 'the record comes back');
select expect((select j->'session'->>'subject_id' from done) is null, 'a subject deleted meanwhile is dropped, the record kept');
select expect((select count(*) from public.sessions where user_id = :A) = 1, 'one record');
-- the same commit replayed (e.g. a retry after a lost response) is refused, so no duplicate
select expect(not (public.focus_write(2, 'laptop', 'Mac', null, null, null, null,
  jsonb_build_object('task', '线代', 'started_at', 1762300000000, 'ended_at', 1762301500000, 'duration_ms', 1500000, 'mode', 'pomodoro', 'tz', 'UTC'))->>'ok')::boolean, 'replayed commit is refused');
select expect((select count(*) from public.sessions where user_id = :A) = 1, 'still one record');

-- a bad record rolls the whole write back (state is not cleared either)
select expect_error($$ select public.focus_write(3, 'laptop', 'Mac', null, null, null, null, '{"started_at": 1, "ended_at": 2, "duration_ms": -5, "tz": "UTC"}') $$, 'check constraint');
select expect((public.focus_get()->'row'->>'version')::int = 3, 'failed write changes nothing');

-- a reflection is saved at most once, even by a device that has the current version
select test_reset();
select test_as(:A);
select expect((public.focus_write(3, 'phone', 'iPhone', null, '{"startedAt": 777}')->>'ok')::boolean, 'pending 777 is open');
select expect((public.focus_write(4, 'phone', 'iPhone', null, null, null, null,
  jsonb_build_object('task', 'k', 'started_at', 1762300000000, 'ended_at', 1762300600000, 'duration_ms', 600000, 'mode', 'countdown', 'tz', 'UTC'), 777)->>'ok')::boolean, 'saved with its key');
create temp table again as select public.focus_write(5, 'laptop', 'Mac', null, null, null, null,
  jsonb_build_object('task', 'k', 'started_at', 1762300000000, 'ended_at', 1762300600000, 'duration_ms', 600000, 'mode', 'countdown', 'tz', 'UTC'), 777) as j;
select expect(not (select (j->>'ok')::boolean from again) and (select (j->>'saved')::boolean from again), 'same key refused at the current version');
select expect((select j->'row'->'saved_keys' from again) = '[777]'::jsonb, 'saved keys are reported');
select expect((select count(*) from public.sessions where task = 'k') = 1, 'one record for key 777');
-- only the last 20 keys are kept
do $$ declare v bigint; begin
  for i in 1..25 loop
    v := (public.focus_get()->'row'->>'version')::bigint;
    perform public.focus_write(v, 'phone', 'iPhone', null, null, null, null,
      jsonb_build_object('task', 'loop', 'started_at', 1762300000000 + i, 'ended_at', 1762300600000 + i, 'duration_ms', 600000, 'mode', 'countdown', 'tz', 'UTC'), 1000 + i);
  end loop;
end $$;
select expect(jsonb_array_length(public.focus_get()->'row'->'saved_keys') = 20, 'keeps 20 keys');
select expect((public.focus_get()->'row'->'saved_keys'->>19)::int = 1025, 'newest key last');
select expect((public.focus_get()->'row'->'saved_keys'->>0)::int = 1006, 'oldest kept key');

-- nobody else can read or write it directly
select test_as(:B);
select expect((select count(*) from public.focus_state) = 0, 'B cannot read A''s timer');
update public.focus_state set state = '{}' where user_id = :A;
select expect_error($$ insert into public.focus_state(user_id, version) values ('00000000-0000-0000-0000-00000000000b', 5) $$, 'row-level security');
select test_as(:A);
update public.focus_state set version = 99;
delete from public.focus_state;
select expect((public.focus_get()->'row'->>'version')::int = 30, 'direct updates and deletes change nothing, even for the owner');
select expect((public.focus_get()->'row'->'state') = 'null'::jsonb, 'B''s update did not land');
select test_as(null);
select expect_error($$ select public.focus_get() $$, 'not signed in');

-- “time's up” push: once per block, not for blocks long gone
select test_reset();
delete from net.requests;
update public.focus_state set due_at = now() - interval '1 minute', due_info = '{"phase":"focus","task":"线代","break_min":5}', due_notified_at = null where user_id = :A;
select expect(public.focus_due_tick() = 1, 'one due block');
select expect(public.focus_due_tick() = 0, 'only notified once');
select expect((select body->>'type' from net.requests order by id desc limit 1) = 'focus_due', 'push event type');
select expect((select body->'record'->>'user_id' from net.requests order by id desc limit 1) = '00000000-0000-0000-0000-00000000000a', 'push goes to the owner');
select expect((select body->'record'->>'break_min' from net.requests order by id desc limit 1) = '5', 'push carries the due info');
update public.focus_state set due_at = now() - interval '2 hours', due_notified_at = null where user_id = :A;
select expect(public.focus_due_tick() = 0, 'stale blocks are skipped');
-- a new due time re-arms the notification
select test_as(:A);
select public.focus_write(30, 'laptop', 'Mac', '{"phase":"break"}', null, now() - interval '5 seconds', '{"phase":"break"}');
select test_reset();
select expect(public.focus_due_tick() = 1, 'new block notifies again');
select test_as(:A);
select expect_error($$ select public.focus_due_tick() $$, 'permission denied');
select test_reset();
select expect((select count(*) from cron.job where jobname = 'tongchuang-focus-due') = 1, 'cron job is scheduled');
