-- RUMO · 0002 · Planos, direitos de acesso, consumo e limites
-- A matriz canônica está em packages/contracts/src/plans.json; supabase/tests verifica que
-- a semente abaixo é idêntica. Enforcement acontece aqui, no banco, e no servidor Node.

create table public.plans (
  code text primary key check (code in ('free', 'pro', 'max', 'unlimited')),
  name text not null,
  rank int not null unique,
  monthly_cents bigint not null check (monthly_cents >= 0),
  annual_cents bigint not null check (annual_cents >= 0),
  max_workspaces int,          -- null = sem limite comercial fixo
  max_entries_month int,
  max_active_goals int,
  max_guests int not null,
  ai_credits_month int not null,
  tts_seconds_month int not null,
  stt_seconds_month int not null,
  storage_bytes bigint not null,
  check (annual_cents = monthly_cents * 10)
);

insert into public.plans values
  ('free',      'Free',      0,     0,      0,    1,   100,    3,  0,   3,   60,   180,   104857600),
  ('pro',       'Pro',       1,  1990,  19900,    2,  2000,   20,  2,  50,  300,   900,   524288000),
  ('max',       'Max',       2,  4990,  49900,    5, 20000,  100, 10, 150, 1200,  3600,  2147483648),
  ('unlimited', 'Ilimitado', 3, 14990, 149900, null,  null, null, 25, 500, 3600, 10800, 10737418240);

alter table public.plans enable row level security;
create policy plans_read on public.plans for select to anon, authenticated using (true);
revoke all on public.plans from anon, authenticated;
grant select on public.plans to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Cobrança (cópia local mínima; o provedor é a fonte de verdade da cobrança)
-- ---------------------------------------------------------------------------
create table public.billing_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text unique,
  -- âncora das janelas mensais de cota (definida no primeiro período pago; não muda por troca de plano)
  quota_anchor timestamptz,
  created_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  stripe_subscription_id text not null unique,
  plan_code text not null references public.plans (code),
  billing_interval text not null check (billing_interval in ('month', 'year')),
  status text not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  provider_updated_at timestamptz not null,   -- created do evento mais recente aplicado (ordem)
  created_at timestamptz not null default now()
);
create index subscriptions_user_idx on public.subscriptions (user_id);

-- Direitos de acesso: cada período pago (fatura de cartão ou Pix pontual) é uma linha idempotente.
create table public.access_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_code text not null references public.plans (code) check (plan_code <> 'free'),
  source text not null check (source in ('stripe_subscription', 'pix_prepaid', 'admin_grant')),
  source_ref text not null unique,            -- invoice id / payment_intent id / grant id
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  revoked_at timestamptz,
  revoke_reason text,
  created_at timestamptz not null default now()
);
create index access_periods_user_idx on public.access_periods (user_id, ends_at desc);

create table public.provider_events (
  id text primary key,                         -- id do evento no provedor
  provider text not null check (provider in ('stripe')),
  type text not null,
  provider_created_at timestamptz not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  attempts int not null default 0,
  last_error text
);

-- ---------------------------------------------------------------------------
-- Plano efetivo e janela de cota
-- ---------------------------------------------------------------------------
create or replace function private.effective_plan(uid uuid, at_time timestamptz default now())
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((
    select p.code from public.access_periods ap
    join public.plans p on p.code = ap.plan_code
    where ap.user_id = uid and ap.revoked_at is null
      and ap.starts_at <= at_time and ap.ends_at > at_time
    order by p.rank desc limit 1
  ), 'free')
$$;

-- Janela mensal. Pago: âncora da assinatura, com meses curtos ajustados ao último dia.
-- Free (sem âncora): mês de calendário em America/Sao_Paulo.
create or replace function private.quota_window(uid uuid, at_time timestamptz default now(),
  out window_start timestamptz, out window_end timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  anchor timestamptz;
  months int;
  local_now timestamp;
begin
  select ba.quota_anchor into anchor from public.billing_accounts ba where ba.user_id = uid;
  if anchor is null or anchor > at_time then
    local_now := at_time at time zone 'America/Sao_Paulo';
    window_start := date_trunc('month', local_now) at time zone 'America/Sao_Paulo';
    window_end := (date_trunc('month', local_now) + interval '1 month') at time zone 'America/Sao_Paulo';
    return;
  end if;
  -- diferença de meses de calendário; depois ajusta para que start <= at_time < end.
  -- anchor + N meses (sempre a partir da âncora) ajusta 31/jan → 28/fev → 31/mar sem deriva.
  months := ((extract(year from at_time) - extract(year from anchor)) * 12
             + extract(month from at_time) - extract(month from anchor))::int;
  while anchor + make_interval(months => months) > at_time loop months := months - 1; end loop;
  while anchor + make_interval(months => months + 1) <= at_time loop months := months + 1; end loop;
  window_start := anchor + make_interval(months => months);
  window_end := anchor + make_interval(months => months + 1);
end $$;

-- O titular da assinatura que paga pelas franquias de um espaço
create or replace function private.workspace_owner(ws uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select w.owner_id from public.workspaces w where w.id = ws
$$;

-- ---------------------------------------------------------------------------
-- Consumo (IA, voz, transcrição). Reserva → uso real → liberação.
-- ---------------------------------------------------------------------------
create table public.usage_ledger (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete set null,
  actor_id uuid,
  metric text not null check (metric in ('ai_credits', 'tts_seconds', 'stt_seconds')),
  window_start timestamptz not null,
  reserved int not null check (reserved > 0),
  used int check (used >= 0),
  state text not null default 'reserved' check (state in ('reserved', 'committed', 'released')),
  idempotency_key text not null unique,
  provider_cost_micros bigint,               -- custo real do provedor em micro-USD, quando informado
  provider_cost_estimated boolean,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
create index usage_ledger_owner_idx on public.usage_ledger (owner_id, metric, window_start);

create or replace function private.metric_limit(plan text, metric text)
returns int language sql stable security definer set search_path = '' as $$
  select case metric
    when 'ai_credits' then p.ai_credits_month
    when 'tts_seconds' then p.tts_seconds_month
    when 'stt_seconds' then p.stt_seconds_month
  end from public.plans p where p.code = plan
$$;

-- Saldo: limite − (committed.used + reserved.reserved) na janela atual
create or replace function private.usage_balance(owner uuid, metric text)
returns table (limit_amount int, consumed int, available int, window_start timestamptz, window_end timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  w record;
  lim int;
  cons int;
begin
  select * into w from private.quota_window(owner);
  lim := private.metric_limit(private.effective_plan(owner), metric);
  select coalesce(sum(case when ul.state = 'committed' then ul.used when ul.state = 'reserved' then ul.reserved else 0 end), 0)
    into cons
  from public.usage_ledger ul
  where ul.owner_id = owner and ul.metric = usage_balance.metric and ul.window_start = w.window_start;
  return query select lim, cons, greatest(lim - cons, 0), w.window_start, w.window_end;
end $$;

-- Reserva atômica: advisory lock por titular+métrica impede corrida entre requisições simultâneas.
create or replace function private.reserve_usage(ws uuid, metric text, amount int, idem text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  owner uuid;
  bal record;
  rid uuid;
begin
  -- leitores também usam IA/voz (consultas), consumindo a franquia do titular
  perform private.require_role(ws, 'reader');
  if amount <= 0 then raise exception 'invalid_amount'; end if;
  owner := private.workspace_owner(ws);
  select ul.id into rid from public.usage_ledger ul where ul.idempotency_key = idem and ul.owner_id = owner;
  if found then return rid; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner::text || ':' || metric, 0));
  select * into bal from private.usage_balance(owner, metric);
  if bal.available < amount then
    raise exception 'quota_exceeded:%', metric using errcode = 'P0001';
  end if;
  insert into public.usage_ledger (owner_id, workspace_id, actor_id, metric, window_start, reserved, idempotency_key)
  values (owner, ws, auth.uid(), metric, bal.window_start, amount, idem)
  returning id into rid;
  return rid;
end $$;

-- Finaliza: uso real (≤ reservado é o caso normal; acima é registrado como estouro técnico, não cobrado)
create or replace function private.settle_usage(rid uuid, actual int, cost_micros bigint default null, cost_estimated boolean default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  select * into r from public.usage_ledger where id = rid for update;
  if not found then raise exception 'reservation_not_found'; end if;
  if r.actor_id is distinct from auth.uid() then raise exception 'forbidden' using errcode = '42501'; end if;
  if r.state <> 'reserved' then return; end if;   -- idempotente
  if actual <= 0 then
    update public.usage_ledger set state = 'released', used = 0, settled_at = now(),
      provider_cost_micros = cost_micros, provider_cost_estimated = cost_estimated where id = rid;
  else
    update public.usage_ledger set state = 'committed', used = actual, settled_at = now(),
      provider_cost_micros = cost_micros, provider_cost_estimated = cost_estimated where id = rid;
  end if;
end $$;

-- Reservas abandonadas (função caiu) são liberadas pela tarefa de manutenção
create or replace function private.release_stale_reservations(older_than interval default interval '15 minutes')
returns int language sql security definer set search_path = '' as $$
  with u as (
    update public.usage_ledger set state = 'released', used = 0, settled_at = now()
    where state = 'reserved' and created_at < now() - older_than
    returning 1
  ) select count(*)::int from u
$$;

grant execute on function private.effective_plan(uuid, timestamptz) to authenticated;
grant execute on function private.quota_window(uuid, timestamptz) to authenticated;
grant execute on function private.reserve_usage(uuid, text, int, text) to authenticated;
grant execute on function private.settle_usage(uuid, int, bigint, boolean) to authenticated;
revoke execute on function private.release_stale_reservations(interval) from public;
grant execute on function private.release_stale_reservations(interval) to service_role;

-- ---------------------------------------------------------------------------
-- Limites de requisição persistentes e atômicos
-- ---------------------------------------------------------------------------
create table private.rate_limits (
  bucket text not null,
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (bucket, window_start)
);

create or replace function private.hit_rate_limit(bucket text, max_hits int, window_seconds int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  ws timestamptz := to_timestamp(floor(extract(epoch from now()) / window_seconds) * window_seconds);
  n int;
begin
  insert into private.rate_limits as rl (bucket, window_start, hits) values (bucket, ws, 1)
  on conflict (bucket, window_start) do update set hits = rl.hits + 1
  returning hits into n;
  return n <= max_hits;
end $$;
revoke execute on function private.hit_rate_limit(text, int, int) from public;
grant execute on function private.hit_rate_limit(text, int, int) to service_role;

-- ---------------------------------------------------------------------------
-- Configurações operacionais (tetos de gasto, chaves de recurso). Só service_role escreve.
-- ---------------------------------------------------------------------------
create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
insert into public.app_settings (key, value) values
  -- Sem teto mensal configurado, rotas de custo externo ficam desligadas (seção 20).
  ('cost_caps', '{"monthly_usd_cap": null, "alert_levels": [0.5, 0.8, 1.0]}'),
  ('unit_costs', '{"as_of": null, "note": "preencher com preços datados do provedor"}');
alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;

alter table public.billing_accounts enable row level security;
alter table public.subscriptions enable row level security;
alter table public.access_periods enable row level security;
alter table public.provider_events enable row level security;
alter table public.usage_ledger enable row level security;

create policy billing_self on public.billing_accounts for select to authenticated using (user_id = auth.uid());
create policy subs_self on public.subscriptions for select to authenticated using (user_id = auth.uid());
create policy access_self on public.access_periods for select to authenticated using (user_id = auth.uid());
create policy usage_self on public.usage_ledger for select to authenticated using (owner_id = auth.uid());

revoke all on public.billing_accounts, public.subscriptions, public.access_periods,
  public.provider_events, public.usage_ledger from anon, authenticated;
grant select on public.billing_accounts, public.subscriptions, public.access_periods, public.usage_ledger to authenticated;
