begin;
\i supabase/tests/_helpers.inc
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, service_role;
select t.login('00000000-0000-0000-0000-00000000000a');
insert into ids select 'ws', public.create_workspace('personal', 'P');
select t.logout();
-- service_role com claim correto lê o resumo
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select t.eq('service reads summary', (public.financial_summary((select v from ids), '2026-01-01', '2026-12-31'))->>'income_cents', '0');
reset role;
-- usuário autenticado forjando claim de role não passa (role efetivo é authenticated e claim sub é outro usuário)
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-00000000000b"}', true);
select t.login('00000000-0000-0000-0000-00000000000b');
select t.throws('other user blocked', format('select public.financial_summary(%L, %L, %L)', (select v from ids), '2026-01-01', '2026-12-31'), 'forbidden');
select t.eq('workspace plan for member', (select 1), 1);
select 'service role: all assertions passed';
rollback;
