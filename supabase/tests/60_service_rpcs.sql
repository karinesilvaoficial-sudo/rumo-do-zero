begin;
\i supabase/tests/_helpers.inc
select t.eq('authenticated cannot call svc', has_function_privilege('authenticated', 'public.svc_cron_housekeeping()', 'execute'), false);
select t.eq('anon cannot call svc', has_function_privilege('anon', 'public.svc_hit_rate_limit(text,int,int)', 'execute'), false);
select t.eq('service can call svc', has_function_privilege('service_role', 'public.svc_claim_outbox(text,int,int)', 'execute'), true);
set local role service_role;
select t.eq('rate limit works', public.svc_hit_rate_limit('x', 1, 60), true);
select t.eq('rate limit blocks', public.svc_hit_rate_limit('x', 1, 60), false);
reset role;
select 'service rpcs: all assertions passed';
rollback;
