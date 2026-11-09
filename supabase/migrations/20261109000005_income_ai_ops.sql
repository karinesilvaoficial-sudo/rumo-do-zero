-- RUMO · 0005 · Novas rendas, conteúdo/IA, convites, notificações, filas e operação

-- ---------------------------------------------------------------------------
-- Novas rendas e comercial
-- ---------------------------------------------------------------------------
create table public.income_profiles (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  skills text[] not null default '{}',
  experience text check (char_length(experience) <= 2000),
  interests text[] not null default '{}',
  region text check (char_length(region) <= 120),
  weekly_hours int check (weekly_hours between 0 and 80),
  resources text check (char_length(resources) <= 2000),
  capital_cents bigint check (capital_cents is null or capital_cents >= 0),   -- null = não informado
  restrictions text check (char_length(restrictions) <= 2000),
  goal_monthly_cents bigint check (goal_monthly_cents is null or goal_monthly_cents >= 0),
  business jsonb not null default '{}'::jsonb,   -- oferta atual, capacidade ociosa, custos, canais, ticket informado
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create table public.income_paths (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  path_type text not null check (path_type in ('services', 'freelance', 'products', 'digital_services', 'assets', 'business_sales')),
  rationale text not null,
  offer text not null,
  target_customer text not null,
  resources text not null,
  investment_min_cents bigint check (investment_min_cents is null or investment_min_cents >= 0),
  investment_max_cents bigint check (investment_max_cents is null or investment_max_cents >= 0),
  assumptions text not null,          -- origem e premissas das estimativas
  time_needed text not null,
  limitations text not null,
  validation_experiment text not null,
  plan_7d jsonb not null default '[]'::jsonb,
  plan_30d jsonb not null default '[]'::jsonb,
  decision_metric text not null,
  status text not null default 'suggested' check (status in ('suggested', 'active', 'paused', 'abandoned', 'continued')),
  origin text not null default 'ai' check (origin in ('ai', 'user')),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (id, workspace_id)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  path_id uuid,
  title text not null check (char_length(title) between 1 and 200),
  due_date date,
  status text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  position int not null default 0,
  created_at timestamptz not null default now(),
  foreign key (path_id, workspace_id) references public.income_paths (id, workspace_id) on delete cascade
);
create index tasks_ws_idx on public.tasks (workspace_id, status, due_date);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  email text check (char_length(email) <= 200),
  phone text check (char_length(phone) <= 40),
  stage text not null default 'lead' check (stage in ('lead', 'contacted', 'proposal', 'won', 'lost')),
  notes text check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  unique (id, workspace_id)
);

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  contact_id uuid,
  path_id uuid,
  title text not null check (char_length(title) between 1 and 160),
  amount_cents bigint check (amount_cents is null or amount_cents > 0),
  status text not null default 'draft' check (status in ('draft', 'ready', 'sent', 'accepted', 'rejected')),
  document_id uuid,
  revenue_transaction_id uuid unique,  -- vínculo explícito e único com o financeiro
  version int not null default 1,
  created_at timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (contact_id, workspace_id) references public.contacts (id, workspace_id) on delete set null (contact_id),
  foreign key (path_id, workspace_id) references public.income_paths (id, workspace_id) on delete set null (path_id),
  foreign key (revenue_transaction_id, workspace_id) references public.transactions (id, workspace_id)
);

-- ---------------------------------------------------------------------------
-- Documentos, relatórios, conversas, intenções e áudio
-- ---------------------------------------------------------------------------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  kind text not null check (kind in ('proposal', 'service_description', 'quote', 'outreach', 'promo_script', 'plan', 'narrative_report')),
  title text not null check (char_length(title) between 1 and 160),
  body_md text not null check (char_length(body_md) <= 60000),   -- renderizado como texto seguro (sem HTML bruto)
  path_id uuid,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (id, workspace_id)
);

create table public.report_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  requested_by uuid not null,
  kind text not null check (kind in ('summary_pdf', 'full_pdf', 'csv', 'xlsx')),
  params jsonb not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed', 'expired')),
  attempts int not null default 0,
  lease_until timestamptz,
  storage_path text,
  byte_size bigint,
  error text,
  idempotency_key text not null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (workspace_id, idempotency_key)
);
create index report_jobs_status_idx on public.report_jobs (status, created_at);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'Nova conversa' check (char_length(title) <= 120),
  summary text,
  summary_version int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id)
);
create index conversations_user_idx on public.conversations (user_id, workspace_id, updated_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  conversation_id uuid not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) <= 40000),
  meta jsonb not null default '{}'::jsonb,   -- fontes consultadas, período, intenções propostas
  input_mode text not null default 'text' check (input_mode in ('text', 'voice')),
  created_at timestamptz not null default now(),
  foreign key (conversation_id, workspace_id) references public.conversations (id, workspace_id) on delete cascade
);
create index messages_conv_idx on public.messages (conversation_id, created_at);

create table public.ai_action_intents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null,
  conversation_id uuid,
  tool text not null check (tool in ('create_goal', 'categorize_transaction', 'upsert_budget', 'create_commitment', 'record_transaction', 'create_task')),
  payload jsonb not null,
  payload_hash text not null,
  summary text not null,
  status text not null default 'prepared' check (status in ('prepared', 'executing', 'executed', 'rejected', 'expired', 'failed')),
  expires_at timestamptz not null,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  executed_at timestamptz
);
create index intents_user_idx on public.ai_action_intents (user_id, workspace_id, created_at desc);

create table public.audio_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete cascade,  -- null = tutorial genérico
  user_id uuid,                                                           -- null = tutorial genérico
  kind text not null check (kind in ('tutorial', 'personal_tts', 'recording')),
  -- chave inclui usuário, espaço, conteúdo, voz, modelo e versão → sem entrega cruzada
  cache_key text not null unique,
  voice_id text,
  model_id text,
  storage_path text not null,
  duration_ms int,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  check ((kind = 'tutorial') = (workspace_id is null and user_id is null))
);

-- ---------------------------------------------------------------------------
-- Notificações, outbox e suporte
-- ---------------------------------------------------------------------------
create table public.notification_preferences (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('due_reminder', 'invitation', 'report_ready', 'billing', 'goal')),
  in_app boolean not null default true,
  email boolean not null default true,
  include_amounts boolean not null default false,  -- valores em e-mail apenas por opção explícita
  send_hour int not null default 8 check (send_hour between 0 and 23),
  primary key (user_id, kind)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  link text check (link like '/%'),
  dedupe_key text unique,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.outbox (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('email', 'report', 'reconcile', 'recurring')),
  dedupe_key text not null unique,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  attempts int not null default 0,
  max_attempts int not null default 5,
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  last_error text,
  provider_ref text,
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index outbox_ready_idx on public.outbox (status, next_attempt_at);

create table public.support_grants (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  granted_by uuid not null,
  support_user_id uuid not null,
  reason text not null check (char_length(reason) between 5 and 500),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- Leitura temporária concedida pelo proprietário a suporte autorizado (somente leitura, auditada)
create or replace function private.is_member(ws uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_role(ws, 'reader') or exists (
    select 1 from public.support_grants g
    where g.workspace_id = ws and g.support_user_id = auth.uid() and g.revoked_at is null and g.expires_at > now()
  )
$$;

-- Fila: reserva com lease e SKIP LOCKED (consumidores concorrentes não pegam o mesmo item)
create or replace function private.claim_outbox(p_kind text, p_batch int, p_lease_seconds int)
returns setof public.outbox language sql security definer set search_path = '' as $$
  update public.outbox o set status = 'processing', attempts = o.attempts + 1,
    lease_until = now() + make_interval(secs => p_lease_seconds)
  where o.id in (
    select id from public.outbox
    where kind = p_kind and next_attempt_at <= now()
      and (status = 'pending' or (status = 'processing' and lease_until < now()))
      and attempts < max_attempts
    order by next_attempt_at
    for update skip locked
    limit p_batch
  )
  returning o.*
$$;

create or replace function private.finish_outbox(p_id uuid, p_ok boolean, p_error text, p_provider_ref text)
returns void language sql security definer set search_path = '' as $$
  update public.outbox set
    status = case when p_ok then 'sent' when attempts >= max_attempts then 'failed' else 'pending' end,
    last_error = case when p_ok then null else left(p_error, 500) end,
    provider_ref = coalesce(p_provider_ref, provider_ref),
    lease_until = null,
    next_attempt_at = case when p_ok then next_attempt_at else now() + make_interval(secs => least(3600, 30 * power(2, attempts)::int)) end,
    done_at = case when p_ok then now() else done_at end
  where id = p_id and status = 'processing'
$$;

create or replace function private.claim_report_job(p_lease_seconds int)
returns setof public.report_jobs language sql security definer set search_path = '' as $$
  update public.report_jobs j set status = 'running', attempts = j.attempts + 1,
    lease_until = now() + make_interval(secs => p_lease_seconds)
  where j.id = (
    select id from public.report_jobs
    where (status = 'queued' or (status = 'running' and lease_until < now())) and attempts < 3
    order by created_at for update skip locked limit 1
  ) returning j.*
$$;

revoke execute on function private.claim_outbox(text, int, int) from public;
revoke execute on function private.finish_outbox(uuid, boolean, text, text) from public;
revoke execute on function private.claim_report_job(int) from public;
grant execute on function private.claim_outbox(text, int, int) to service_role;
grant execute on function private.finish_outbox(uuid, boolean, text, text) to service_role;
grant execute on function private.claim_report_job(int) to service_role;

-- ---------------------------------------------------------------------------
-- Convites e membros
-- ---------------------------------------------------------------------------
create or replace function private.guest_count(owner uuid)
returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from (
    select lower(u.email) e from public.memberships m
      join public.workspaces w on w.id = m.workspace_id
      join auth.users u on u.id = m.user_id
      where w.owner_id = owner and m.user_id <> owner
    union
    select lower(i.email) from public.invitations i
      join public.workspaces w on w.id = i.workspace_id
      where w.owner_id = owner and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
  ) g
$$;

create or replace function private.create_invitation(ws uuid, p_email text, p_role public.member_role, p_token_hash text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  owner uuid := private.workspace_owner(ws);
  lim int;
  iid uuid;
  already boolean;
begin
  perform private.require_role(ws, 'admin');
  if p_role = 'owner' then raise exception 'invalid_role' using errcode = '22023'; end if;
  if p_role = 'admin' and not private.has_role(ws, 'owner') then raise exception 'forbidden' using errcode = '42501'; end if;
  if exists (select 1 from public.memberships m join auth.users u on u.id = m.user_id
             where m.workspace_id = ws and lower(u.email) = lower(p_email)) then
    raise exception 'already_member' using errcode = '23505';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(owner::text || ':guests', 0));
  select p.max_guests into lim from public.plans p where p.code = private.effective_plan(owner);
  -- convidado já contado (em outro espaço do mesmo titular) não consome nova vaga
  select exists (
    select 1 from public.memberships m join public.workspaces w on w.id = m.workspace_id join auth.users u on u.id = m.user_id
    where w.owner_id = owner and lower(u.email) = lower(p_email)
    union all
    select 1 from public.invitations i join public.workspaces w on w.id = i.workspace_id
    where w.owner_id = owner and lower(i.email) = lower(p_email) and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
  ) into already;
  if not already and private.guest_count(owner) >= lim then
    raise exception 'quota_exceeded:guests' using errcode = 'P0001';
  end if;
  -- reenviar = revogar pendente anterior e emitir novo token
  update public.invitations set revoked_at = now()
    where workspace_id = ws and lower(email) = lower(p_email) and accepted_at is null and revoked_at is null;
  insert into public.invitations (workspace_id, email, role, token_hash, invited_by, expires_at)
  values (ws, lower(btrim(p_email)), p_role, p_token_hash, auth.uid(), now() + interval '7 days')
  returning id into iid;
  perform private.audit(ws, 'invite', 'invitation', iid::text, jsonb_build_object('role', p_role));
  return iid;
end $$;
comment on function private.create_invitation(uuid, text, public.member_role, text) is 'rpc';

create or replace function private.accept_invitation(p_token_hash text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  inv record;
  me record;
begin
  select id, email, email_confirmed_at into me from auth.users where id = auth.uid();
  if not found then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into inv from public.invitations where token_hash = p_token_hash for update;
  if not found or inv.revoked_at is not null or inv.accepted_at is not null or inv.expires_at <= now() then
    raise exception 'invitation_invalid' using errcode = 'P0002';
  end if;
  -- apenas o destinatário com e-mail confirmado
  if lower(me.email) <> lower(inv.email) or me.email_confirmed_at is null then
    raise exception 'invitation_wrong_recipient' using errcode = '42501';
  end if;
  insert into public.memberships (workspace_id, user_id, role, invited_by)
  values (inv.workspace_id, me.id, inv.role, inv.invited_by)
  on conflict (workspace_id, user_id) do nothing;
  update public.invitations set accepted_at = now(), accepted_by = me.id where id = inv.id;
  perform private.audit(inv.workspace_id, 'accept', 'invitation', inv.id::text, jsonb_build_object('role', inv.role));
  return inv.workspace_id;
end $$;
comment on function private.accept_invitation(text) is 'rpc';

create or replace function private.revoke_invitation(ws uuid, p_invitation_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_role(ws, 'admin');
  update public.invitations set revoked_at = now()
  where id = p_invitation_id and workspace_id = ws and accepted_at is null and revoked_at is null;
  perform private.audit(ws, 'revoke', 'invitation', p_invitation_id::text, '{}'::jsonb);
end $$;
comment on function private.revoke_invitation(uuid, uuid) is 'rpc';

create or replace function private.remove_member(ws uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare target public.member_role;
begin
  if p_user_id = auth.uid() then
    -- sair do espaço (exceto o proprietário)
    if private.member_role_of(ws) = 'owner' then raise exception 'owner_cannot_leave' using errcode = '42501'; end if;
  else
    perform private.require_role(ws, 'admin');
    select role into target from public.memberships where workspace_id = ws and user_id = p_user_id;
    if target = 'owner' then raise exception 'cannot_remove_owner' using errcode = '42501'; end if;
    if target = 'admin' and not private.has_role(ws, 'owner') then raise exception 'forbidden' using errcode = '42501'; end if;
  end if;
  delete from public.memberships where workspace_id = ws and user_id = p_user_id;
  -- conversas do membro removido no espaço deixam de ser acessíveis (RLS exige vínculo)
  perform private.audit(ws, 'remove', 'membership', p_user_id::text, '{}'::jsonb);
end $$;
comment on function private.remove_member(uuid, uuid) is 'rpc';

create or replace function private.change_member_role(ws uuid, p_user_id uuid, p_role public.member_role)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_role(ws, 'owner');
  if p_role = 'owner' then raise exception 'invalid_role' using errcode = '22023'; end if;
  update public.memberships set role = p_role where workspace_id = ws and user_id = p_user_id and role <> 'owner';
  perform private.audit(ws, 'change_role', 'membership', p_user_id::text, jsonb_build_object('role', p_role));
end $$;
comment on function private.change_member_role(uuid, uuid, public.member_role) is 'rpc';

-- ---------------------------------------------------------------------------
-- Renda: vínculos com o financeiro (explícitos e idempotentes)
-- ---------------------------------------------------------------------------
create or replace function private.link_proposal_revenue(ws uuid, p_proposal_id uuid, p_existing_transaction_id uuid,
  p_amount_cents bigint, p_date date, p_account_id uuid, p_category_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  pr record;
  tid uuid;
begin
  perform private.require_role(ws, 'collaborator');
  select * into pr from public.proposals where id = p_proposal_id and workspace_id = ws for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if pr.revenue_transaction_id is not null then return pr.revenue_transaction_id; end if;  -- idempotente
  if p_existing_transaction_id is not null then
    -- vincula lançamento já existente (não cria outro)
    select id into tid from public.transactions
      where id = p_existing_transaction_id and workspace_id = ws and kind = 'income' and reversed_at is null and reversal_of is null;
    if not found then raise exception 'transaction_invalid' using errcode = '22023'; end if;
  else
    perform private.require_same_ws_account(ws, p_account_id);
    perform private.require_category(ws, p_category_id, 'income');
    tid := private.insert_tx(ws, 'income', p_amount_cents, left('Receita: ' || pr.title, 200), p_category_id, p_account_id, null,
      p_date, p_date, null, 'proposal', pr.id, 'proposal-revenue:' || pr.id::text);
  end if;
  update public.proposals set revenue_transaction_id = tid, status = 'accepted', version = version + 1 where id = pr.id;
  perform private.audit(ws, 'link_revenue', 'proposal', pr.id::text, jsonb_build_object('transaction_id', tid));
  return tid;
end $$;
comment on function private.link_proposal_revenue(uuid, uuid, uuid, bigint, date, uuid, uuid) is 'rpc';

-- ---------------------------------------------------------------------------
-- Intenções da IA: preparar (não grava efeito) → confirmar (revalida e executa uma vez)
-- ---------------------------------------------------------------------------
create or replace function private.prepare_intent(ws uuid, p_conversation_id uuid, p_tool text, p_payload jsonb, p_summary text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  iid uuid;
  h text;
  exp timestamptz := now() + interval '10 minutes';
begin
  perform private.require_role(ws, 'collaborator');
  h := encode(extensions.digest(convert_to(p_tool || '|' || ws::text || '|' || auth.uid()::text || '|' || (p_payload)::text, 'UTF8'), 'sha256'), 'hex');
  insert into public.ai_action_intents (workspace_id, user_id, conversation_id, tool, payload, payload_hash, summary, expires_at)
  values (ws, auth.uid(), p_conversation_id, p_tool, p_payload, h, left(p_summary, 500), exp)
  returning id into iid;
  return jsonb_build_object('intent_id', iid, 'payload_hash', h, 'expires_at', exp);
end $$;
comment on function private.prepare_intent(uuid, uuid, text, jsonb, text) is 'rpc';

create or replace function private.confirm_intent(ws uuid, p_intent_id uuid, p_payload_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  i record;
  p jsonb;
  out_id uuid;
  out_ver int;
begin
  perform private.require_role(ws, 'collaborator');
  select * into i from public.ai_action_intents where id = p_intent_id and workspace_id = ws for update;
  if not found or i.user_id <> auth.uid() then raise exception 'intent_not_found' using errcode = 'P0002'; end if;
  if i.status = 'executed' then return i.result || jsonb_build_object('already_executed', true); end if;
  if i.status <> 'prepared' then raise exception 'intent_not_executable:%', i.status using errcode = '22023'; end if;
  if i.payload_hash <> p_payload_hash then raise exception 'intent_hash_mismatch' using errcode = '22023'; end if;
  if i.expires_at <= now() then
    update public.ai_action_intents set status = 'expired' where id = i.id;
    return jsonb_build_object('status', 'expired');
  end if;
  p := i.payload;
  case i.tool
    when 'create_goal' then
      out_id := private.create_goal(ws, p->>'name', (p->>'target_cents')::bigint, (p->>'target_date')::date);
    when 'categorize_transaction' then
      select version into out_ver from public.transactions where id = (p->>'transaction_id')::uuid and workspace_id = ws;
      if out_ver is null or out_ver <> (p->>'expected_version')::int then raise exception 'version_conflict' using errcode = '40001'; end if;
      out_ver := private.edit_transaction(ws, (p->>'transaction_id')::uuid, (p->>'expected_version')::int, null,
        (p->>'category_id')::uuid, null, null, null, null, null);
      out_id := (p->>'transaction_id')::uuid;
    when 'upsert_budget' then
      out_id := private.upsert_budget(ws, (p->>'category_id')::uuid, (p->>'month')::date, (p->>'amount_cents')::bigint);
    when 'create_commitment' then
      out_id := private.create_commitment(ws, p->>'direction', p->>'description', (p->>'category_id')::uuid,
        (p->>'amount_cents')::bigint, (p->>'due_date')::date, null, 'intent:' || i.id::text);
    when 'record_transaction' then
      out_id := private.record_transaction(ws, p->>'kind', (p->>'amount_cents')::bigint, p->>'description',
        (p->>'category_id')::uuid, (p->>'account_id')::uuid, (p->>'date')::date, (p->>'date')::date, null, 'intent:' || i.id::text);
    when 'create_task' then
      insert into public.tasks (workspace_id, title, due_date) values (ws, p->>'title', (p->>'due_date')::date) returning id into out_id;
  end case;
  update public.ai_action_intents set status = 'executed', executed_at = now(),
    result = jsonb_build_object('status', 'executed', 'entity_id', out_id, 'tool', i.tool)
  where id = i.id;
  perform private.audit(ws, 'execute', 'ai_intent', i.id::text, jsonb_build_object('tool', i.tool, 'entity_id', out_id));
  return jsonb_build_object('status', 'executed', 'entity_id', out_id, 'tool', i.tool);
end $$;
comment on function private.confirm_intent(uuid, uuid, text) is 'rpc';

create or replace function private.reject_intent(ws uuid, p_intent_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.ai_action_intents set status = 'rejected'
  where id = p_intent_id and workspace_id = ws and user_id = auth.uid() and status = 'prepared'
$$;
comment on function private.reject_intent(uuid, uuid) is 'rpc';

-- ---------------------------------------------------------------------------
-- Escritas simples via funções (renda, contatos, documentos, conversas)
-- ---------------------------------------------------------------------------
create or replace function private.upsert_income_profile(ws uuid, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_role(ws, 'collaborator');
  insert into public.income_profiles (workspace_id, skills, experience, interests, region, weekly_hours, resources,
    capital_cents, restrictions, goal_monthly_cents, business, updated_by, updated_at)
  values (ws,
    coalesce(array(select jsonb_array_elements_text(p->'skills')), '{}'), p->>'experience',
    coalesce(array(select jsonb_array_elements_text(p->'interests')), '{}'), p->>'region',
    (p->>'weekly_hours')::int, p->>'resources', (p->>'capital_cents')::bigint, p->>'restrictions',
    (p->>'goal_monthly_cents')::bigint, coalesce(p->'business', '{}'::jsonb), auth.uid(), now())
  on conflict (workspace_id) do update set
    skills = excluded.skills, experience = excluded.experience, interests = excluded.interests, region = excluded.region,
    weekly_hours = excluded.weekly_hours, resources = excluded.resources, capital_cents = excluded.capital_cents,
    restrictions = excluded.restrictions, goal_monthly_cents = excluded.goal_monthly_cents, business = excluded.business,
    updated_by = excluded.updated_by, updated_at = now();
end $$;
comment on function private.upsert_income_profile(uuid, jsonb) is 'rpc';

create or replace function private.save_income_path(ws uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare pid uuid;
begin
  perform private.require_role(ws, 'collaborator');
  insert into public.income_paths (workspace_id, title, path_type, rationale, offer, target_customer, resources,
    investment_min_cents, investment_max_cents, assumptions, time_needed, limitations, validation_experiment,
    plan_7d, plan_30d, decision_metric, origin, created_by)
  values (ws, p->>'title', p->>'path_type', p->>'rationale', p->>'offer', p->>'target_customer', p->>'resources',
    (p->>'investment_min_cents')::bigint, (p->>'investment_max_cents')::bigint, p->>'assumptions', p->>'time_needed',
    p->>'limitations', p->>'validation_experiment', coalesce(p->'plan_7d', '[]'), coalesce(p->'plan_30d', '[]'),
    p->>'decision_metric', coalesce(p->>'origin', 'ai'), auth.uid())
  returning id into pid;
  -- tarefas do plano de 7 dias
  insert into public.tasks (workspace_id, path_id, title, position)
  select ws, pid, left(t.value #>> '{}', 200), t.ordinality from jsonb_array_elements(coalesce(p->'plan_7d', '[]')) with ordinality t;
  return pid;
end $$;
comment on function private.save_income_path(uuid, jsonb) is 'rpc';

create or replace function private.set_path_status(ws uuid, p_path_id uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_role(ws, 'collaborator');
  update public.income_paths set status = p_status where id = p_path_id and workspace_id = ws;
end $$;
comment on function private.set_path_status(uuid, uuid, text) is 'rpc';

create or replace function private.set_task_status(ws uuid, p_task_id uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_role(ws, 'collaborator');
  update public.tasks set status = p_status where id = p_task_id and workspace_id = ws;
end $$;
comment on function private.set_task_status(uuid, uuid, text) is 'rpc';

create or replace function private.save_contact(ws uuid, p_id uuid, p_name text, p_email text, p_phone text, p_stage text, p_notes text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare cid uuid;
begin
  perform private.require_role(ws, 'collaborator');
  if p_id is null then
    insert into public.contacts (workspace_id, name, email, phone, stage, notes)
    values (ws, btrim(p_name), p_email, p_phone, coalesce(p_stage, 'lead'), p_notes) returning id into cid;
  else
    update public.contacts set name = btrim(p_name), email = p_email, phone = p_phone, stage = coalesce(p_stage, stage), notes = p_notes
    where id = p_id and workspace_id = ws returning id into cid;
    if cid is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  end if;
  return cid;
end $$;
comment on function private.save_contact(uuid, uuid, text, text, text, text, text) is 'rpc';

create or replace function private.save_proposal(ws uuid, p_title text, p_contact_id uuid, p_path_id uuid, p_amount_cents bigint, p_document_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare pid uuid;
begin
  perform private.require_role(ws, 'collaborator');
  insert into public.proposals (workspace_id, title, contact_id, path_id, amount_cents, document_id, status)
  values (ws, btrim(p_title), p_contact_id, p_path_id, p_amount_cents, p_document_id, case when p_document_id is null then 'draft' else 'ready' end)
  returning id into pid;
  return pid;
end $$;
comment on function private.save_proposal(uuid, text, uuid, uuid, bigint, uuid) is 'rpc';

create or replace function private.save_document(ws uuid, p_kind text, p_title text, p_body text, p_path_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare did uuid;
begin
  perform private.require_role(ws, 'collaborator');
  insert into public.documents (workspace_id, kind, title, body_md, path_id, created_by)
  values (ws, p_kind, btrim(p_title), p_body, p_path_id, auth.uid()) returning id into did;
  return did;
end $$;
comment on function private.save_document(uuid, text, text, text, uuid) is 'rpc';

create or replace function private.start_conversation(ws uuid, p_title text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare cid uuid;
begin
  if not private.is_member(ws) then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.conversations (workspace_id, user_id, title) values (ws, auth.uid(), coalesce(left(p_title, 120), 'Nova conversa'))
  returning id into cid;
  return cid;
end $$;
comment on function private.start_conversation(uuid, text) is 'rpc';

create or replace function private.append_message(ws uuid, p_conversation_id uuid, p_role text, p_content text, p_meta jsonb, p_input_mode text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare mid uuid;
begin
  if not exists (select 1 from public.conversations c where c.id = p_conversation_id and c.workspace_id = ws and c.user_id = auth.uid())
     or not private.is_member(ws) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.messages (workspace_id, conversation_id, role, content, meta, input_mode)
  values (ws, p_conversation_id, p_role, p_content, coalesce(p_meta, '{}'), coalesce(p_input_mode, 'text')) returning id into mid;
  update public.conversations set updated_at = now() where id = p_conversation_id;
  return mid;
end $$;
comment on function private.append_message(uuid, uuid, text, text, jsonb, text) is 'rpc';

create or replace function private.request_report(ws uuid, p_kind text, p_params jsonb, p_idempotency_key text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare jid uuid;
begin
  if not private.is_member(ws) then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.report_jobs (workspace_id, requested_by, kind, params, idempotency_key)
  values (ws, auth.uid(), p_kind, p_params, p_idempotency_key)
  on conflict (workspace_id, idempotency_key) do nothing;
  select id into jid from public.report_jobs where workspace_id = ws and idempotency_key = p_idempotency_key;
  return jid;
end $$;
comment on function private.request_report(uuid, text, jsonb, text) is 'rpc';

create or replace function private.grant_support_access(ws uuid, p_support_user_id uuid, p_reason text, p_hours int)
returns uuid language plpgsql security definer set search_path = '' as $$
declare gid uuid;
begin
  perform private.require_role(ws, 'owner');
  if p_hours < 1 or p_hours > 72 then raise exception 'invalid_duration' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles where id = p_support_user_id and is_platform_admin) then
    raise exception 'not_support_user' using errcode = '22023';
  end if;
  insert into public.support_grants (workspace_id, granted_by, support_user_id, reason, expires_at)
  values (ws, auth.uid(), p_support_user_id, p_reason, now() + make_interval(hours => p_hours)) returning id into gid;
  perform private.audit(ws, 'grant', 'support_access', gid::text, jsonb_build_object('hours', p_hours));
  return gid;
end $$;
comment on function private.grant_support_access(uuid, uuid, text, int) is 'rpc';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['income_profiles','income_paths','tasks','contacts','proposals','documents','report_jobs']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (private.is_member(workspace_id))', t || '_select_member', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.ai_action_intents enable row level security;
alter table public.audio_assets enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notifications enable row level security;
alter table public.outbox enable row level security;
alter table public.support_grants enable row level security;

-- conversas são privadas de quem as criou e exigem vínculo atual com o espaço
create policy conversations_own on public.conversations for select to authenticated
  using (user_id = auth.uid() and private.is_member(workspace_id));
create policy messages_own on public.messages for select to authenticated
  using (exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = auth.uid())
         and private.is_member(workspace_id));
create policy intents_own on public.ai_action_intents for select to authenticated
  using (user_id = auth.uid() and private.is_member(workspace_id));
create policy audio_own on public.audio_assets for select to authenticated
  using (kind = 'tutorial' or (user_id = auth.uid() and private.is_member(workspace_id)));
create policy notif_prefs_own on public.notification_preferences for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_own on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_mark_read on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy support_grants_owner on public.support_grants for select to authenticated
  using (private.has_role(workspace_id, 'owner') or support_user_id = auth.uid());

revoke all on public.conversations, public.messages, public.ai_action_intents, public.audio_assets,
  public.notification_preferences, public.notifications, public.outbox, public.support_grants from anon, authenticated;
grant select on public.conversations, public.messages, public.ai_action_intents, public.audio_assets,
  public.notifications, public.support_grants to authenticated;
grant select, insert, update on public.notification_preferences to authenticated;
grant update (read_at) on public.notifications to authenticated;
