-- RUMO · 0008 · Wrappers em public para funções de servidor (somente service_role).
-- O PostgREST expõe apenas o schema public; estas funções NÃO são executáveis por anon/authenticated.
-- Correção: parâmetro "bucket" ambíguo com a coluna de mesmo nome em private.hit_rate_limit.
-- Nova função (sem DROP); a antiga fica sem uso e sem permissão de execução.
revoke execute on function private.hit_rate_limit(text, int, int) from public, service_role;
create or replace function private.hit_rate_limit_v2(p_bucket text, p_max_hits int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  ws timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  n int;
begin
  insert into private.rate_limits as rl (bucket, window_start, hits) values (p_bucket, ws, 1)
  on conflict (bucket, window_start) do update set hits = rl.hits + 1
  returning rl.hits into n;
  return n <= p_max_hits;
end $$;
revoke execute on function private.hit_rate_limit_v2(text, int, int) from public;
grant execute on function private.hit_rate_limit_v2(text, int, int) to service_role;

create or replace function public.svc_hit_rate_limit(bucket text, max_hits int, window_seconds int)
returns boolean language sql security invoker set search_path = '' as $$ select private.hit_rate_limit_v2(bucket, max_hits, window_seconds) $$;
create or replace function public.svc_claim_outbox(p_kind text, p_batch int, p_lease_seconds int)
returns setof public.outbox language sql security invoker set search_path = '' as $$ select * from private.claim_outbox(p_kind, p_batch, p_lease_seconds) $$;
create or replace function public.svc_finish_outbox(p_id uuid, p_ok boolean, p_error text, p_provider_ref text)
returns void language sql security invoker set search_path = '' as $$ select private.finish_outbox(p_id, p_ok, p_error, p_provider_ref) $$;
create or replace function public.svc_claim_report_job(p_lease_seconds int)
returns setof public.report_jobs language sql security invoker set search_path = '' as $$ select * from private.claim_report_job(p_lease_seconds) $$;
create or replace function public.svc_cron_generate_occurrences(p_until date)
returns int language sql security invoker set search_path = '' as $$ select private.cron_generate_occurrences(p_until) $$;
create or replace function public.svc_cron_due_reminders()
returns int language sql security invoker set search_path = '' as $$ select private.cron_due_reminders(now()) $$;
create or replace function public.svc_cron_commitment_still_due(p_commitment uuid)
returns boolean language sql security invoker set search_path = '' as $$ select private.cron_commitment_still_due(p_commitment) $$;
create or replace function public.svc_cron_housekeeping()
returns jsonb language sql security invoker set search_path = '' as $$ select private.cron_housekeeping() $$;

do $$
declare f text;
begin
  foreach f in array array[
    'svc_hit_rate_limit(text, int, int)', 'svc_claim_outbox(text, int, int)', 'svc_finish_outbox(uuid, boolean, text, text)',
    'svc_claim_report_job(int)', 'svc_cron_generate_occurrences(date)', 'svc_cron_due_reminders()',
    'svc_cron_commitment_still_due(uuid)', 'svc_cron_housekeeping()']
  loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
