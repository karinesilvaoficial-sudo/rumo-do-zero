begin;
\i supabase/tests/_helpers.inc
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, service_role;
select t.login('00000000-0000-0000-0000-00000000000a');
do $$
declare ws uuid; acc uuid; c1 uuid; c2 uuid;
begin
  ws := public.create_workspace('personal', 'P');
  acc := public.create_account(ws, 'Conta', 'checking', 0, '2026-11-01');
  c1 := public.create_commitment(ws, 'payable', 'Luz', null, 10000, '2026-11-10', null, 'r1');
  c2 := public.create_commitment(ws, 'payable', 'Água', null, 5000, '2026-11-10', null, 'r2');
  perform public.settle_commitment(ws, c2, 5000, '2026-11-08', acc, 'r3');   -- já pago: não deve lembrar
  perform public.create_recurring_rule(ws, 'payable', 'Internet', null, 9990, 'monthly', '2026-11-05', null);
  insert into ids values ('ws', ws), ('c1', c1);
end $$;
select t.logout();
-- 23h30 de 09/11 em São Paulo = 02h30 UTC de 10/11 → "amanhã" no fuso do espaço é 10/11
select t.eq('reminders only pending, tz-aware', private.cron_due_reminders('2026-11-10 02:30:00+00'), 1);
select t.eq('no reminder for paid', (select count(*) from public.notifications where body like '%Água%' or title like '%Água%'), 0::bigint);
select t.eq('dedupe on rerun', private.cron_due_reminders('2026-11-10 02:30:00+00'), 0);
select t.eq('outbox once', (select count(*) from public.outbox where dedupe_key like 'email:due:%'), 1::bigint);
-- meio-dia UTC de 10/11 = 09h em SP → amanhã é 11/11 → nada vence
select t.eq('no reminder other day', private.cron_due_reminders('2026-11-10 12:00:00+00'), 0);
select t.eq('still due check', private.cron_commitment_still_due((select v from ids where k='c1')), true);
-- recorrências: geração em lote idempotente
select t.eq('cron generates', private.cron_generate_occurrences('2027-04-30') > 0, true);
select t.eq('cron rerun no dup', private.cron_generate_occurrences('2027-04-30'), 0);
select (private.cron_housekeeping())->>'released_reservations' is not null as ok;
select 'cron: all assertions passed';
rollback;
