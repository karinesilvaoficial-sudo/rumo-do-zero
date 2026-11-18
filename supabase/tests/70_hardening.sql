begin;
\i supabase/tests/_helpers.inc
select t.login('00000000-0000-0000-0000-00000000000c');
do $$
declare ws uuid;
begin
  ws := public.create_workspace('personal', 'Carla');
  perform t.throws('bad timezone', format('update public.workspaces set timezone = %L where id = %L', 'Marte/Base', ws), 'invalid_timezone');
  update public.workspaces set timezone = 'America/Manaus' where id = ws;
  perform t.throws('free full pdf', format('select public.request_report(%L, %L, %L::jsonb, %L)', ws, 'full_pdf', '{}', 'k1'), 'plan_required');
  perform t.eq('free summary ok', public.request_report(ws, 'summary_pdf', '{}'::jsonb, 'k2') is not null, true);
end $$;
rollback;
