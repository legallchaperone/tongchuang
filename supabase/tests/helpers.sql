-- test helpers: act as a signed-in user, and expect a statement to fail
create or replace function test_as(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), false);
  if u is null then execute 'set role anon'; else execute 'set role authenticated'; end if;
end $$;
create or replace function test_reset() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', false);
end $$;
create or replace function expect_error(stmt text, pattern text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlerrm !~* pattern then raise exception 'expected error matching "%", got "%" for: %', pattern, sqlerrm, stmt; end if;
    return;
  end;
  raise exception 'expected an error matching "%" but it succeeded: %', pattern, stmt;
end $$;
create or replace function expect(ok boolean, what text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FAILED: %', what; end if; end $$;
grant execute on function test_as(uuid), test_reset(), expect_error(text, text), expect(boolean, text) to anon, authenticated;

-- three people: A and B share a room, C is a stranger
insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@x.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@x.com'),
  ('00000000-0000-0000-0000-00000000000c', 'c@x.com');
insert into public.rooms(id, name, code, created_by) values ('10000000-0000-0000-0000-000000000001', '书房', 'ABC123', '00000000-0000-0000-0000-00000000000a');
insert into public.room_members(room_id, user_id) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b');
