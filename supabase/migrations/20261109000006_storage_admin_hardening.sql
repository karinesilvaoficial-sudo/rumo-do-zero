-- RUMO · 0006 · Storage privado, painel administrativo e endurecimento final

-- ---------------------------------------------------------------------------
-- Storage: bucket privado; caminho {workspace_id}/{area}/... ; áudio pessoal em {ws}/audio/{user_id}/...
-- Upload é feito pelo servidor após autorização; leitura por URL assinada temporária.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('private-files', 'private-files', false, 26214400,
  array['application/pdf', 'text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'audio/mpeg', 'audio/webm', 'audio/ogg', 'audio/mp4', 'image/svg+xml', 'image/png'])
on conflict (id) do update set public = false;

insert into storage.buckets (id, name, public) values ('public-tutorials', 'public-tutorials', false)
on conflict (id) do nothing;

create or replace function private.storage_can_read(object_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  parts text[] := string_to_array(object_name, '/');
  ws uuid;
begin
  if array_length(parts, 1) < 3 or object_name like '%..%' then return false; end if;
  begin ws := parts[1]::uuid; exception when others then return false; end;
  if not private.is_member(ws) then return false; end if;
  if parts[2] in ('audio', 'recordings') then
    return parts[3] = auth.uid()::text;   -- áudio pessoal só do próprio usuário
  end if;
  if parts[2] = 'reports' then
    -- relatório só para quem pediu ou admin do espaço
    return exists (select 1 from public.report_jobs j where j.workspace_id = ws and j.storage_path = object_name
      and (j.requested_by = auth.uid() or private.has_role(ws, 'admin')));
  end if;
  return true;
end $$;
grant execute on function private.storage_can_read(text) to authenticated;

create policy rumo_private_read on storage.objects for select to authenticated
  using (bucket_id = 'private-files' and private.storage_can_read(name));
create policy rumo_tutorials_read on storage.objects for select to authenticated
  using (bucket_id = 'public-tutorials');

-- ---------------------------------------------------------------------------
-- Administração da plataforma: saúde e operação, sem leitura das finanças dos clientes
-- ---------------------------------------------------------------------------
create or replace function private.require_platform_admin()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_platform_admin) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end $$;

create or replace function private.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_platform_admin();
  return jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'workspaces', (select count(*) from public.workspaces where archived_at is null),
    'active_30d', (select count(distinct created_by) from public.transactions where created_at > now() - interval '30 days'),
    'paid_access', (select jsonb_object_agg(plan_code, n) from (
        select plan_code, count(distinct user_id) n from public.access_periods
        where revoked_at is null and starts_at <= now() and ends_at > now() group by plan_code) x),
    'subscriptions_by_status', (select jsonb_object_agg(status, n) from (select status, count(*) n from public.subscriptions group by status) s),
    'usage_month', (select jsonb_object_agg(metric, jsonb_build_object('used', used, 'reserved_open', open_r, 'released', rel, 'cost_micros', cost))
       from (select metric, coalesce(sum(used) filter (where state = 'committed'), 0) used,
                    coalesce(sum(reserved) filter (where state = 'reserved'), 0) open_r,
                    count(*) filter (where state = 'released') rel,
                    coalesce(sum(provider_cost_micros), 0) cost
             from public.usage_ledger where created_at > date_trunc('month', now()) group by metric) u),
    'outbox', (select jsonb_object_agg(status, n) from (select status, count(*) n from public.outbox group by status) o),
    'outbox_failed', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'attempts', attempts, 'error', last_error)), '[]')
       from (select * from public.outbox where status = 'failed' order by created_at desc limit 20) f),
    'webhooks_pending', (select count(*) from public.provider_events where processed_at is null),
    'webhook_errors', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'type', type, 'error', last_error)), '[]')
       from (select * from public.provider_events where last_error is not null order by received_at desc limit 20) e),
    'report_jobs', (select jsonb_object_agg(status, n) from (select status, count(*) n from public.report_jobs group by status) r),
    'cost_caps', (select value from public.app_settings where key = 'cost_caps'),
    'generated_at', now()
  );
end $$;
comment on function private.admin_overview() is 'rpc';

create or replace function private.admin_set_cost_cap(p_monthly_usd_cap numeric)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_platform_admin();
  if p_monthly_usd_cap is not null and p_monthly_usd_cap < 0 then raise exception 'invalid' using errcode = '22023'; end if;
  update public.app_settings set value = jsonb_set(value, '{monthly_usd_cap}', to_jsonb(p_monthly_usd_cap)),
    updated_by = auth.uid(), updated_at = now() where key = 'cost_caps';
  perform private.audit(null, 'set_cost_cap', 'app_settings', 'cost_caps', jsonb_build_object('cap', p_monthly_usd_cap));
end $$;
comment on function private.admin_set_cost_cap(numeric) is 'rpc';

-- Leitura dos tetos (servidor decide ligar/desligar rotas de custo)
create or replace function private.cost_guard()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'cap_usd', (select (value->>'monthly_usd_cap')::numeric from public.app_settings where key = 'cost_caps'),
    'spent_usd', (select coalesce(sum(provider_cost_micros), 0)::numeric / 1000000 from public.usage_ledger
                  where created_at >= date_trunc('month', now()))
  )
$$;
comment on function private.cost_guard() is 'rpc';

-- Exportação dos próprios dados e status do plano para a interface
create or replace function private.my_entitlements()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  plan text;
  w record;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  plan := private.effective_plan(uid);
  select * into w from private.quota_window(uid);
  return jsonb_build_object(
    'plan', plan,
    'limits', (select to_jsonb(p) from public.plans p where p.code = plan),
    'window_start', w.window_start, 'window_end', w.window_end,
    'usage', jsonb_build_object(
      'ai_credits', (select to_jsonb(b) from private.usage_balance(uid, 'ai_credits') b),
      'tts_seconds', (select to_jsonb(b) from private.usage_balance(uid, 'tts_seconds') b),
      'stt_seconds', (select to_jsonb(b) from private.usage_balance(uid, 'stt_seconds') b),
      'entries', (select count(*) from public.transactions t join public.workspaces wk on wk.id = t.workspace_id
                  where wk.owner_id = uid and t.reversal_of is null and t.created_at >= w.window_start and t.created_at < w.window_end),
      'workspaces', (select count(*) from public.workspaces where owner_id = uid and archived_at is null and not read_only),
      'active_goals', (select count(*) from public.goals g join public.workspaces wk on wk.id = g.workspace_id
                       where wk.owner_id = uid and g.status = 'active'),
      'guests', private.guest_count(uid)
    ),
    'access_until', (select max(ends_at) from public.access_periods where user_id = uid and revoked_at is null)
  );
end $$;
comment on function private.my_entitlements() is 'rpc';

-- ---------------------------------------------------------------------------
-- Endurecimento: nenhuma função privada executável por PUBLIC além do necessário
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema private from public;
alter default privileges in schema private revoke execute on functions from public;

comment on function private.reserve_usage(uuid, text, int, text) is 'rpc';
comment on function private.settle_usage(uuid, int, bigint, boolean) is 'rpc';

-- helpers usados em políticas RLS (avaliadas como o usuário chamador)
grant execute on function private.is_member(uuid) to authenticated;
grant execute on function private.has_role(uuid, public.member_role) to authenticated;
grant execute on function private.member_role_of(uuid) to authenticated;
grant execute on function private.storage_can_read(text) to authenticated;
grant execute on function private.reserve_usage(uuid, text, int, text) to authenticated;
grant execute on function private.settle_usage(uuid, int, bigint, boolean) to authenticated;
grant execute on all functions in schema private to service_role;

select private.publish_rpcs();
