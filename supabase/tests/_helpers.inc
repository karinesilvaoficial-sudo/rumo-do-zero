create schema if not exists t;
create or replace function t.login(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
  execute 'set local role authenticated';
end $$;
create or replace function t.logout() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub', '', true); end $$;
create or replace function t.eq(label text, got anyelement, expected anyelement) returns void language plpgsql as $$
begin
  if got is distinct from expected then raise exception 'ASSERT % : got %, expected %', label, got, expected; end if;
end $$;
create or replace function t.throws(label text, stmt text, expected_fragment text) returns void language plpgsql as $$
begin
  begin execute stmt;
  exception when others then
    if position(expected_fragment in sqlerrm) = 0 and position(expected_fragment in sqlstate) = 0 then
      raise exception 'ASSERT % : wrong error "%"(%), expected "%"', label, sqlerrm, sqlstate, expected_fragment;
    end if;
    return;
  end;
  raise exception 'ASSERT % : expected error "%" but statement succeeded', label, expected_fragment;
end $$;
grant usage on schema t to authenticated, service_role;
grant execute on all functions in schema t to authenticated, service_role;
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-00000000000a', 'ana@exemplo.test', now()),
  ('00000000-0000-0000-0000-00000000000b', 'bruno@exemplo.test', now()),
  ('00000000-0000-0000-0000-00000000000c', 'carla@exemplo.test', now()),
  ('00000000-0000-0000-0000-00000000000d', 'davi@exemplo.test', null);
