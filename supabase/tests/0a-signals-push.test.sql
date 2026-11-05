-- v1.11 signals + push subscriptions
\set A '''00000000-0000-0000-0000-00000000000a'''
\set B '''00000000-0000-0000-0000-00000000000b'''
\set C '''00000000-0000-0000-0000-00000000000c'''

-- A pokes B: allowed, B and A can read it, C cannot
select test_as(:A);
insert into public.signals(to_user, kind) values (:B, 'poke');
select expect((select count(*) from public.signals) = 1, 'sender sees own signal');
select test_as(:B);
select expect((select count(*) from public.signals where to_user = :B) = 1, 'recipient sees the signal');
select test_as(:C);
select expect((select count(*) from public.signals) = 0, 'stranger sees nothing');

-- C cannot signal A or B (no shared room); nobody can signal themselves or forge the sender
select expect_error($$ insert into public.signals(to_user, kind) values ('00000000-0000-0000-0000-00000000000a', 'poke') $$, 'row-level security');
select test_as(:A);
select expect_error($$ insert into public.signals(to_user, kind) values ('00000000-0000-0000-0000-00000000000a', 'poke') $$, 'row-level security');
select expect_error($$ insert into public.signals(from_user, to_user, kind) values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a', 'poke') $$, 'row-level security');
select test_as(null);
select expect_error($$ insert into public.signals(to_user, kind) values ('00000000-0000-0000-0000-00000000000b', 'poke') $$, 'row-level security|permission');

-- content checks
select test_as(:A);
select expect_error($$ insert into public.signals(to_user, kind, payload) values ('00000000-0000-0000-0000-00000000000b', 'cheer', '{"text": ""}') $$, 'signal text');
select expect_error($$ insert into public.signals(to_user, kind, payload) values ('00000000-0000-0000-0000-00000000000b', 'invite', '{"mode": "x", "minutes": 25}') $$, 'bad invite');
select expect_error($$ insert into public.signals(to_user, kind) values ('00000000-0000-0000-0000-00000000000b', 'hug') $$, 'check constraint');
insert into public.signals(to_user, kind, payload) values (:B, 'invite', '{"mode": "pomodoro", "minutes": 25, "task": "线代"}');

-- rate limit: the 4th signal to the same person within a minute is refused
insert into public.signals(to_user, kind, payload) values (:B, 'cheer', '{"text": "加油"}');
select expect_error($$ insert into public.signals(to_user, kind) values ('00000000-0000-0000-0000-00000000000b', 'poke') $$, 'too many signals');

-- no push config yet: nothing is sent
select test_reset();
select expect((select count(*) from net.requests) = 0, 'no push requests without config');

-- with a config, each insert hands one event to the push function
insert into public.push_config(function_url, secret) values ('https://example.supabase.co/functions/v1/webpush', 's3cret');
delete from public.signals;
select test_as(:B);
insert into public.signals(to_user, kind) values (:A, 'poke');
select test_reset();
select expect((select count(*) from net.requests) = 1, 'one push request per signal');
select expect((select body->>'type' from net.requests) = 'signals', 'event type is the table');
select expect((select body->'record'->>'to_user' from net.requests) = '00000000-0000-0000-0000-00000000000a', 'event carries the row');
select expect((select headers->>'x-tongchuang-secret' from net.requests) = 's3cret', 'secret header is sent');

-- the config and the dispatcher are off limits to users
select test_as(:A);
select expect_error($$ select * from public.push_config $$, 'permission denied');
select expect_error($$ select public.push_notify('{}') $$, 'permission denied');

-- push subscriptions: mine only; a device that signs in as someone else moves to them
select public.save_push_subscription('https://push.example/abc', 'p256', 'authkey', 'Safari');
select public.save_push_subscription('https://push.example/abc', 'p256-2', 'authkey', 'Safari');
select expect((select count(*) from public.push_subscriptions) = 1, 'saving twice keeps one row');
select expect((select p256dh from public.push_subscriptions) = 'p256-2', 'keys are updated');
select test_as(:B);
select expect((select count(*) from public.push_subscriptions) = 0, 'B cannot see A''s devices');
select expect_error($$ insert into public.push_subscriptions(endpoint, user_id, p256dh, auth) values ('https://push.example/x', '00000000-0000-0000-0000-00000000000a', 'p', 'a') $$, 'row-level security');
select public.save_push_subscription('https://push.example/abc', 'p256-b', 'authkey-b', 'Safari');
select test_reset();
select expect((select user_id from public.push_subscriptions where endpoint = 'https://push.example/abc') = '00000000-0000-0000-0000-00000000000b', 'device moved to B');
select test_as(null);
select expect_error($$ select public.save_push_subscription('https://push.example/zzz', 'p', 'a', '') $$, 'not signed in');
select test_reset();
