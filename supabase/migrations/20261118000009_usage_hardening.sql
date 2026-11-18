-- Endurecimento de cotas (auditoria 2026-11-18). Não destrutivo.
-- 1) Reserva com chave repetida não reaproveita reserva antiga: replay = erro (evita IA ilimitada).
create or replace function private.reserve_usage(ws uuid, metric text, amount int, idem text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  owner uuid;
  bal record;
  rid uuid;
begin
  perform private.require_role(ws, 'reader');
  if amount <= 0 then raise exception 'invalid_amount'; end if;
  owner := private.workspace_owner(ws);
  perform pg_advisory_xact_lock(hashtextextended(owner::text || ':' || metric, 0));
  if exists (select 1 from public.usage_ledger ul where ul.idempotency_key = idem and ul.owner_id = owner) then
    raise exception 'duplicate_request' using errcode = 'P0001';
  end if;
  select * into bal from private.usage_balance(owner, metric);
  if bal.available < amount then
    raise exception 'quota_exceeded:%', metric using errcode = 'P0001';
  end if;
  insert into public.usage_ledger (owner_id, workspace_id, actor_id, metric, window_start, reserved, idempotency_key)
  values (owner, ws, auth.uid(), metric, bal.window_start, amount, idem)
  returning id into rid;
  return rid;
end $$;

-- 2) Liquidação só pelo servidor (service_role); uso cobrado nunca passa do reservado.
revoke execute on function private.settle_usage(uuid, int, bigint, boolean) from public, anon, authenticated;
revoke execute on function public.settle_usage(uuid, int, bigint, boolean) from public, anon, authenticated;

create or replace function public.svc_settle_usage(rid uuid, actual int, cost_micros bigint default null, cost_estimated boolean default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  select * into r from public.usage_ledger where id = rid for update;
  if not found then raise exception 'reservation_not_found'; end if;
  if r.state <> 'reserved' then return; end if;
  if actual <= 0 then
    update public.usage_ledger set state = 'released', used = 0, settled_at = now(),
      provider_cost_micros = cost_micros, provider_cost_estimated = cost_estimated where id = rid;
  else
    update public.usage_ledger set state = 'committed', used = least(actual, r.reserved), settled_at = now(),
      provider_cost_micros = cost_micros, provider_cost_estimated = cost_estimated where id = rid;
  end if;
end $$;
revoke execute on function public.svc_settle_usage(uuid, int, bigint, boolean) from public, anon, authenticated;
grant execute on function public.svc_settle_usage(uuid, int, bigint, boolean) to service_role;

-- 3) Fuso horário inválido não pode derrubar o cron de lembretes de todos.
create or replace function private.validate_workspace_timezone()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'invalid_timezone' using errcode = '22023';
  end if;
  return new;
end $$;
drop trigger if exists workspaces_timezone_check on public.workspaces;
create trigger workspaces_timezone_check before insert or update of timezone on public.workspaces
  for each row execute function private.validate_workspace_timezone();
update public.workspaces set timezone = 'America/Sao_Paulo'
  where timezone not in (select name from pg_catalog.pg_timezone_names);

-- 4) Relatórios completos (PDF completo / Excel) respeitam o plano também na fila.
create or replace function private.report_kind_allowed(ws uuid, p_kind text)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_kind in ('summary_pdf', 'csv')
      or private.effective_plan(private.workspace_owner(ws)) <> 'free'
$$;
revoke execute on function private.report_kind_allowed(uuid, text) from public, anon;
grant execute on function private.report_kind_allowed(uuid, text) to authenticated, service_role;

create or replace function private.request_report(ws uuid, p_kind text, p_params jsonb, p_idempotency_key text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare jid uuid; k text;
begin
  if not private.is_member(ws) then raise exception 'forbidden' using errcode = '42501'; end if;
  if not private.report_kind_allowed(ws, p_kind) then raise exception 'plan_required' using errcode = 'P0001'; end if;
  k := auth.uid()::text || ':' || p_idempotency_key;   -- chave por usuário: um membro não sobrescreve o pedido de outro
  insert into public.report_jobs (workspace_id, requested_by, kind, params, idempotency_key)
  values (ws, auth.uid(), p_kind, p_params, k)
  on conflict (workspace_id, idempotency_key) do nothing;
  select id into jid from public.report_jobs where workspace_id = ws and idempotency_key = k and requested_by = auth.uid();
  if jid is null then raise exception 'duplicate_request' using errcode = 'P0001'; end if;
  return jid;
end $$;
