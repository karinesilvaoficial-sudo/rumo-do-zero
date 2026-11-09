-- RUMO · 0004 · Comandos e agregações financeiras
-- Todas as escritas passam por estas funções: autorização explícita, transação atômica,
-- idempotência, verificação de versão e auditoria. Funções marcadas com COMMENT 'rpc'
-- recebem um wrapper SECURITY INVOKER em public (exposto pelo PostgREST).

-- ---------------------------------------------------------------------------
-- Utilitários
-- ---------------------------------------------------------------------------
create or replace function private.split_installments(total bigint, n int)
returns table (number int, amount_cents bigint)
language sql immutable set search_path = '' as $$
  -- parcelas iguais (piso) e resíduo na última: 100,00/3 → 33,33 · 33,33 · 33,34
  select g, case when g < n then total / n else total - (total / n) * (n - 1) end
  from generate_series(1, n) g
$$;

create or replace function private.require_same_ws_account(ws uuid, acc uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if acc is null then return; end if;
  if not exists (select 1 from public.accounts a where a.id = acc and a.workspace_id = ws and a.archived_at is null) then
    raise exception 'account_not_found' using errcode = 'P0002';
  end if;
end $$;

create or replace function private.require_category(ws uuid, cat uuid, expected_kind text)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if cat is null then return; end if;
  if not exists (select 1 from public.categories c where c.id = cat and c.workspace_id = ws and c.kind = expected_kind) then
    raise exception 'category_invalid' using errcode = 'P0002';
  end if;
end $$;

-- Franquia de lançamentos novos por mês (somada nos espaços do titular). Estornos não contam.
create or replace function private.check_entry_quota(ws uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  owner uuid := private.workspace_owner(ws);
  lim int;
  w record;
  n int;
begin
  select p.max_entries_month into lim from public.plans p where p.code = private.effective_plan(owner);
  if lim is null then return; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner::text || ':entries', 0));
  select * into w from private.quota_window(owner);
  select count(*) into n from public.transactions t
    join public.workspaces wk on wk.id = t.workspace_id
    where wk.owner_id = owner and t.reversal_of is null
      and t.created_at >= w.window_start and t.created_at < w.window_end;
  if n >= lim then
    raise exception 'quota_exceeded:entries' using errcode = 'P0001';
  end if;
end $$;

-- Inserção base de um fato + ledger. Uso interno.
create or replace function private.insert_tx(
  ws uuid, k public.tx_kind, amount bigint, descr text, cat uuid, acc uuid, to_acc uuid,
  comp date, settled date, note text, src text, src_id uuid, idem text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare tid uuid;
begin
  if amount is null or amount <= 0 then raise exception 'invalid_amount' using errcode = '22023'; end if;
  perform private.check_entry_quota(ws);
  insert into public.transactions (workspace_id, kind, amount_cents, description, notes, category_id,
    account_id, to_account_id, competence_date, settled_date, source, source_id, idempotency_key, created_by)
  values (ws, k, amount, btrim(descr), nullif(btrim(note), ''), cat, acc, to_acc, comp, settled, src, src_id, idem, auth.uid())
  returning id into tid;

  if k = 'income' then
    insert into public.ledger_entries (workspace_id, transaction_id, account_id, amount_cents, entry_date)
    values (ws, tid, acc, amount, settled);
  elsif k in ('expense', 'card_payment', 'debt_payment') then
    insert into public.ledger_entries (workspace_id, transaction_id, account_id, amount_cents, entry_date)
    values (ws, tid, acc, -amount, settled);
  elsif k = 'transfer' then
    insert into public.ledger_entries (workspace_id, transaction_id, account_id, amount_cents, entry_date)
    values (ws, tid, acc, -amount, settled), (ws, tid, to_acc, amount, settled);
  end if;  -- card_purchase / card_charge: sem efeito de caixa
  return tid;
end $$;

create or replace function private.existing_tx(ws uuid, idem text)
returns uuid language sql stable security definer set search_path = '' as $$
  select t.id from public.transactions t where t.workspace_id = ws and t.idempotency_key = idem
$$;

-- ---------------------------------------------------------------------------
-- Espaços
-- ---------------------------------------------------------------------------
create or replace function private.create_workspace(p_kind public.workspace_kind, p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  lim int;
  n int;
  wid uuid;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':workspaces', 0));
  select p.max_workspaces into lim from public.plans p where p.code = private.effective_plan(uid);
  select count(*) into n from public.workspaces w where w.owner_id = uid and w.archived_at is null and not w.read_only;
  if lim is not null and n >= lim then raise exception 'quota_exceeded:workspaces' using errcode = 'P0001'; end if;

  insert into public.workspaces (owner_id, kind, name) values (uid, p_kind, btrim(p_name)) returning id into wid;
  insert into public.memberships (workspace_id, user_id, role) values (wid, uid, 'owner');

  insert into public.categories (workspace_id, name, kind, is_system)
  select wid, c.name, c.kind, true from (values
    ('Salário', 'income'), ('Vendas', 'income'), ('Serviços', 'income'), ('Outras receitas', 'income'),
    ('Moradia', 'expense'), ('Alimentação', 'expense'), ('Transporte', 'expense'), ('Saúde', 'expense'),
    ('Educação', 'expense'), ('Lazer', 'expense'), ('Assinaturas', 'expense'), ('Impostos e taxas', 'expense'),
    ('Juros e encargos', 'expense'), ('Fornecedores', 'expense'), ('Folha e pró-labore', 'expense'),
    ('Marketing', 'expense'), ('Outras despesas', 'expense')
  ) as c(name, kind)
  where p_kind = 'business' or c.name not in ('Fornecedores', 'Folha e pró-labore', 'Vendas');

  perform private.audit(wid, 'create', 'workspace', wid::text, jsonb_build_object('kind', p_kind));
  return wid;
end $$;
comment on function private.create_workspace(public.workspace_kind, text) is 'rpc';

-- ---------------------------------------------------------------------------
-- Contas e categorias
-- ---------------------------------------------------------------------------
create or replace function private.create_account(ws uuid, p_name text, p_kind text, p_opening_cents bigint, p_opening_date date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare aid uuid;
begin
  perform private.require_role(ws, 'admin');
  insert into public.accounts (workspace_id, name, kind, opening_balance_cents, opening_date)
  values (ws, btrim(p_name), coalesce(p_kind, 'checking'), coalesce(p_opening_cents, 0), p_opening_date)
  returning id into aid;
  perform private.audit(ws, 'create', 'account', aid::text, jsonb_build_object('opening_cents', p_opening_cents));
  return aid;
end $$;
comment on function private.create_account(uuid, text, text, bigint, date) is 'rpc';

create or replace function private.create_category(ws uuid, p_name text, p_kind text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare cid uuid;
begin
  perform private.require_role(ws, 'collaborator');
  insert into public.categories (workspace_id, name, kind) values (ws, btrim(p_name), p_kind)
  on conflict (workspace_id, kind, lower(name)) do update set archived_at = null
  returning id into cid;
  return cid;
end $$;
comment on function private.create_category(uuid, text, text) is 'rpc';

-- ---------------------------------------------------------------------------
-- Lançamentos realizados
-- ---------------------------------------------------------------------------
create or replace function private.record_transaction(
  ws uuid, p_kind text, p_amount_cents bigint, p_description text, p_category_id uuid,
  p_account_id uuid, p_competence_date date, p_settled_date date, p_notes text, p_idempotency_key text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare tid uuid;
begin
  perform private.require_role(ws, 'collaborator');
  tid := private.existing_tx(ws, p_idempotency_key);
  if tid is not null then return tid; end if;
  if p_kind not in ('income', 'expense') then raise exception 'invalid_kind' using errcode = '22023'; end if;
  perform private.require_same_ws_account(ws, p_account_id);
  perform private.require_category(ws, p_category_id, p_kind);
  tid := private.insert_tx(ws, p_kind::public.tx_kind, p_amount_cents, p_description, p_category_id, p_account_id, null,
    coalesce(p_competence_date, p_settled_date), p_settled_date, p_notes, 'manual', null, p_idempotency_key);
  perform private.audit(ws, 'create', 'transaction', tid::text, jsonb_build_object('kind', p_kind, 'amount_cents', p_amount_cents));
  return tid;
end $$;
comment on function private.record_transaction(uuid, text, bigint, text, uuid, uuid, date, date, text, text) is 'rpc';

create or replace function private.record_transfer(
  ws uuid, p_from uuid, p_to uuid, p_amount_cents bigint, p_date date, p_description text, p_idempotency_key text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare tid uuid;
begin
  perform private.require_role(ws, 'collaborator');
  tid := private.existing_tx(ws, p_idempotency_key);
  if tid is not null then return tid; end if;
  perform private.require_same_ws_account(ws, p_from);
  perform private.require_same_ws_account(ws, p_to);
  tid := private.insert_tx(ws, 'transfer', p_amount_cents, coalesce(nullif(btrim(p_description), ''), 'Transferência entre contas'),
    null, p_from, p_to, p_date, p_date, null, 'manual', null, p_idempotency_key);
  perform private.audit(ws, 'create', 'transfer', tid::text, jsonb_build_object('amount_cents', p_amount_cents));
  return tid;
end $$;
comment on function private.record_transfer(uuid, uuid, uuid, bigint, date, text, text) is 'rpc';

-- Estorno: espelho com ledger invertido. Colaborador+ pode estornar (regra uniforme), com auditoria.
create or replace function private.reverse_transaction(ws uuid, p_transaction_id uuid, p_expected_version int, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  t record;
  rid uuid;
begin
  perform private.require_role(ws, 'collaborator');
  select * into t from public.transactions where id = p_transaction_id and workspace_id = ws for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if t.reversal_of is not null then raise exception 'cannot_reverse_reversal' using errcode = '22023'; end if;
  if t.reversed_at is not null then
    select id into rid from public.transactions where reversal_of = t.id;
    return rid;  -- idempotente
  end if;
  if t.version <> p_expected_version then raise exception 'version_conflict' using errcode = '40001'; end if;

  insert into public.transactions (workspace_id, kind, amount_cents, description, category_id, account_id, to_account_id,
    competence_date, settled_date, reversal_of, source, source_id, idempotency_key, created_by)
  values (ws, t.kind, t.amount_cents, left('Estorno: ' || t.description, 200), t.category_id, t.account_id, t.to_account_id,
    t.competence_date, case when t.settled_date is null then null else greatest(t.settled_date, current_date) end,
    t.id, t.source, t.source_id, 'reversal:' || t.id::text, auth.uid())
  returning id into rid;

  insert into public.ledger_entries (workspace_id, transaction_id, account_id, amount_cents, entry_date)
  select ws, rid, le.account_id, -le.amount_cents, greatest(le.entry_date, current_date)
  from public.ledger_entries le where le.transaction_id = t.id;

  update public.transactions set reversed_at = now(), version = version + 1, updated_at = now() where id = t.id;
  perform private.audit(ws, 'reverse', 'transaction', t.id::text,
    jsonb_build_object('reversal_id', rid, 'amount_cents', t.amount_cents, 'reason', left(p_reason, 200)));
  return rid;
end $$;
comment on function private.reverse_transaction(uuid, uuid, int, text) is 'rpc';

-- Edição com controle de versão. Valor/conta/data alteram o ledger dentro da mesma transação.
create or replace function private.edit_transaction(
  ws uuid, p_transaction_id uuid, p_expected_version int, p_description text, p_category_id uuid,
  p_competence_date date, p_notes text, p_amount_cents bigint, p_account_id uuid, p_settled_date date)
returns int language plpgsql security definer set search_path = '' as $$
declare t record;
begin
  perform private.require_role(ws, 'collaborator');
  select * into t from public.transactions where id = p_transaction_id and workspace_id = ws for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if t.version <> p_expected_version then raise exception 'version_conflict' using errcode = '40001'; end if;
  if t.reversed_at is not null or t.reversal_of is not null then raise exception 'reversed_is_immutable' using errcode = '22023'; end if;
  if t.kind not in ('income', 'expense') then raise exception 'edit_via_source' using errcode = '22023'; end if;
  if p_amount_cents is not null and p_amount_cents <= 0 then raise exception 'invalid_amount' using errcode = '22023'; end if;
  perform private.require_same_ws_account(ws, p_account_id);
  perform private.require_category(ws, p_category_id, t.kind::text);

  update public.transactions set
    description = coalesce(nullif(btrim(p_description), ''), description),
    category_id = coalesce(p_category_id, category_id),
    competence_date = coalesce(p_competence_date, competence_date),
    notes = coalesce(p_notes, notes),
    amount_cents = coalesce(p_amount_cents, amount_cents),
    account_id = coalesce(p_account_id, account_id),
    settled_date = coalesce(p_settled_date, settled_date),
    version = version + 1, updated_at = now()
  where id = t.id;

  delete from public.ledger_entries where transaction_id = t.id;
  insert into public.ledger_entries (workspace_id, transaction_id, account_id, amount_cents, entry_date)
  select ws, x.id, x.account_id, case when x.kind = 'income' then x.amount_cents else -x.amount_cents end, x.settled_date
  from public.transactions x where x.id = t.id;

  perform private.audit(ws, 'update', 'transaction', t.id::text,
    jsonb_build_object('from_cents', t.amount_cents, 'to_cents', coalesce(p_amount_cents, t.amount_cents)));
  return t.version + 1;
end $$;
comment on function private.edit_transaction(uuid, uuid, int, text, uuid, date, text, bigint, uuid, date) is 'rpc';

-- ---------------------------------------------------------------------------
-- Compromissos, recorrências e liquidações
-- ---------------------------------------------------------------------------
create or replace function private.create_commitment(
  ws uuid, p_direction text, p_description text, p_category_id uuid, p_amount_cents bigint,
  p_due_date date, p_competence_date date, p_idempotency_key text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare cid uuid;
begin
  perform private.require_role(ws, 'collaborator');
  select id into cid from public.commitments where workspace_id = ws and idempotency_key = p_idempotency_key;
  if found then return cid; end if;
  perform private.require_category(ws, p_category_id, case p_direction when 'receivable' then 'income' else 'expense' end);
  insert into public.commitments (workspace_id, direction, description, category_id, amount_cents, due_date,
    competence_date, idempotency_key, created_by)
  values (ws, p_direction, btrim(p_description), p_category_id, p_amount_cents, p_due_date,
    coalesce(p_competence_date, p_due_date), p_idempotency_key, auth.uid())
  returning id into cid;
  perform private.audit(ws, 'create', 'commitment', cid::text, jsonb_build_object('amount_cents', p_amount_cents));
  return cid;
end $$;
comment on function private.create_commitment(uuid, text, text, uuid, bigint, date, date, text) is 'rpc';

create or replace function private.commitment_settled(cid uuid)
returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce(sum(s.amount_cents), 0)::bigint from public.settlements s
  join public.transactions t on t.id = s.transaction_id
  where s.commitment_id = cid and t.reversed_at is null
$$;

-- Pagamento/recebimento (parcial permitido). Exige data e valor; não excede o pendente.
create or replace function private.settle_commitment(
  ws uuid, p_commitment_id uuid, p_amount_cents bigint, p_settled_date date, p_account_id uuid, p_idempotency_key text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  c record;
  pending bigint;
  tid uuid;
begin
  perform private.require_role(ws, 'collaborator');
  tid := private.existing_tx(ws, p_idempotency_key);
  if tid is not null then return tid; end if;
  if p_settled_date is null or p_amount_cents is null then raise exception 'date_and_amount_required' using errcode = '22023'; end if;
  select * into c from public.commitments where id = p_commitment_id and workspace_id = ws for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if c.cancelled_at is not null then raise exception 'commitment_cancelled' using errcode = '22023'; end if;
  pending := c.amount_cents - private.commitment_settled(c.id);
  if p_amount_cents > pending then raise exception 'exceeds_pending' using errcode = '22023'; end if;
  perform private.require_same_ws_account(ws, p_account_id);

  tid := private.insert_tx(ws, (case c.direction when 'receivable' then 'income' else 'expense' end)::public.tx_kind,
    p_amount_cents, c.description, c.category_id, p_account_id, null, c.competence_date, p_settled_date, null,
    'commitment', c.id, p_idempotency_key);
  insert into public.settlements (workspace_id, commitment_id, transaction_id, amount_cents, settled_date)
  values (ws, c.id, tid, p_amount_cents, p_settled_date);
  update public.commitments set version = version + 1 where id = c.id;
  perform private.audit(ws, 'settle', 'commitment', c.id::text, jsonb_build_object('amount_cents', p_amount_cents, 'transaction_id', tid));
  return tid;
end $$;
comment on function private.settle_commitment(uuid, uuid, bigint, date, uuid, text) is 'rpc';

create or replace function private.cancel_commitment(ws uuid, p_commitment_id uuid, p_expected_version int)
returns void language plpgsql security definer set search_path = '' as $$
declare c record;
begin
  perform private.require_role(ws, 'collaborator');
  select * into c from public.commitments where id = p_commitment_id and workspace_id = ws for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if c.cancelled_at is not null then return; end if;
  if c.version <> p_expected_version then raise exception 'version_conflict' using errcode = '40001'; end if;
  -- o já liquidado permanece como realizado; cancela-se apenas o saldo pendente
  update public.commitments set cancelled_at = now(), version = version + 1 where id = c.id;
  perform private.audit(ws, 'cancel', 'commitment', c.id::text, '{}'::jsonb);
end $$;
comment on function private.cancel_commitment(uuid, uuid, int) is 'rpc';

create or replace function private.create_recurring_rule(
  ws uuid, p_direction text, p_description text, p_category_id uuid, p_amount_cents bigint,
  p_frequency text, p_start_date date, p_end_date date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare rid uuid;
begin
  perform private.require_role(ws, 'collaborator');
  perform private.require_category(ws, p_category_id, case p_direction when 'receivable' then 'income' else 'expense' end);
  insert into public.recurring_rules (workspace_id, direction, description, category_id, amount_cents, frequency, start_date, end_date)
  values (ws, p_direction, btrim(p_description), p_category_id, p_amount_cents, p_frequency, p_start_date, p_end_date)
  returning id into rid;
  perform private.generate_occurrences(ws, rid, (p_start_date + interval '3 months')::date);
  return rid;
end $$;

-- Gera ocorrências até "until". ON CONFLICT garante uma única ocorrência por data,
-- mesmo com execuções repetidas ou concorrentes.
create or replace function private.generate_occurrences(ws uuid, p_rule_id uuid, p_until date)
returns int language plpgsql security definer set search_path = '' as $$
declare
  r record;
  step interval;
  d date;
  i int := 0;
  created int := 0;
  n int;
begin
  perform private.require_role(ws, 'collaborator');
  select * into r from public.recurring_rules where id = p_rule_id and workspace_id = ws;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not r.active then return 0; end if;
  step := case r.frequency when 'weekly' then interval '1 week' when 'monthly' then interval '1 month' else interval '1 year' end;
  loop
    d := (r.start_date + step * i)::date;   -- calculado a partir do início: 31/jan → 28/fev → 31/mar
    exit when d > p_until or (r.end_date is not null and d > r.end_date) or i > 520;
    insert into public.commitments (workspace_id, direction, description, category_id, amount_cents, due_date,
      competence_date, recurring_rule_id, occurrence_date, idempotency_key, created_by)
    values (ws, r.direction, r.description, r.category_id, r.amount_cents, d, d, r.id, d,
      'rule:' || r.id::text || ':' || d::text, auth.uid())
    on conflict do nothing;
    get diagnostics n = row_count;
    created := created + n;
    i := i + 1;
  end loop;
  return created;
end $$;
comment on function private.create_recurring_rule(uuid, text, text, uuid, bigint, text, date, date) is 'rpc';
comment on function private.generate_occurrences(uuid, uuid, date) is 'rpc';

-- "Editar as próximas": altera a regra e as ocorrências futuras ainda sem liquidação e não destacadas.
create or replace function private.edit_rule_from(
  ws uuid, p_rule_id uuid, p_expected_version int, p_from date, p_amount_cents bigint, p_description text)
returns int language plpgsql security definer set search_path = '' as $$
declare
  r record;
  n int;
begin
  perform private.require_role(ws, 'collaborator');
  select * into r from public.recurring_rules where id = p_rule_id and workspace_id = ws for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if r.version <> p_expected_version then raise exception 'version_conflict' using errcode = '40001'; end if;
  update public.recurring_rules set amount_cents = coalesce(p_amount_cents, amount_cents),
    description = coalesce(nullif(btrim(p_description), ''), description), version = version + 1
  where id = r.id;
  update public.commitments c set amount_cents = coalesce(p_amount_cents, c.amount_cents),
    description = coalesce(nullif(btrim(p_description), ''), c.description), version = c.version + 1
  where c.recurring_rule_id = r.id and c.occurrence_date >= p_from and not c.detached and c.cancelled_at is null
    and not exists (select 1 from public.settlements s where s.commitment_id = c.id);
  get diagnostics n = row_count;
  perform private.audit(ws, 'update_from', 'recurring_rule', r.id::text, jsonb_build_object('from', p_from, 'affected', n));
  return n;
end $$;
comment on function private.edit_rule_from(uuid, uuid, int, date, bigint, text) is 'rpc';

-- "Editar só esta ocorrência"
create or replace function private.edit_commitment(
  ws uuid, p_commitment_id uuid, p_expected_version int, p_amount_cents bigint, p_due_date date, p_description text)
returns int language plpgsql security definer set search_path = '' as $$
declare c record;
begin
  perform private.require_role(ws, 'collaborator');
  select * into c from public.commitments where id = p_commitment_id and workspace_id = ws for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if c.version <> p_expected_version then raise exception 'version_conflict' using errcode = '40001'; end if;
  if p_amount_cents is not null and p_amount_cents < private.commitment_settled(c.id) then
    raise exception 'below_settled' using errcode = '22023';
  end if;
  update public.commitments set amount_cents = coalesce(p_amount_cents, amount_cents), due_date = coalesce(p_due_date, due_date),
    description = coalesce(nullif(btrim(p_description), ''), description),
    detached = recurring_rule_id is not null, version = version + 1
  where id = c.id;
  return c.version + 1;
end $$;
comment on function private.edit_commitment(uuid, uuid, int, bigint, date, text) is 'rpc';

-- ---------------------------------------------------------------------------
-- Cartões
-- ---------------------------------------------------------------------------
create or replace function private.create_card(ws uuid, p_name text, p_closing_day int, p_due_day int, p_limit_cents bigint, p_payment_account_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare cid uuid;
begin
  perform private.require_role(ws, 'admin');
  perform private.require_same_ws_account(ws, p_payment_account_id);
  insert into public.credit_cards (workspace_id, name, closing_day, due_day, limit_cents, payment_account_id)
  values (ws, btrim(p_name), p_closing_day, p_due_day, p_limit_cents, p_payment_account_id) returning id into cid;
  return cid;
end $$;
comment on function private.create_card(uuid, text, int, int, bigint, uuid) is 'rpc';

-- Fatura do mês de referência (mês do fechamento). Compra no dia do fechamento ou depois → próxima fatura.
create or replace function private.ensure_invoice(ws uuid, p_card_id uuid, p_reference_month date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  c record;
  closing date;
  due date;
  iid uuid;
begin
  select * into c from public.credit_cards where id = p_card_id and workspace_id = ws;
  closing := p_reference_month + (c.closing_day - 1);
  due := case when c.due_day > c.closing_day then p_reference_month + (c.due_day - 1)
              else (p_reference_month + interval '1 month')::date + (c.due_day - 1) end;
  insert into public.card_invoices (workspace_id, card_id, reference_month, closing_date, due_date)
  values (ws, p_card_id, p_reference_month, closing, due)
  on conflict (card_id, reference_month) do nothing;
  select id into iid from public.card_invoices where card_id = p_card_id and reference_month = p_reference_month;
  return iid;
end $$;

create or replace function private.record_card_purchase(
  ws uuid, p_card_id uuid, p_description text, p_category_id uuid, p_purchase_date date,
  p_total_cents bigint, p_installments int, p_idempotency_key text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  c record;
  tid uuid;
  pid uuid;
  first_ref date;
  inst record;
begin
  perform private.require_role(ws, 'collaborator');
  tid := private.existing_tx(ws, p_idempotency_key);
  if tid is not null then return tid; end if;
  select * into c from public.credit_cards where id = p_card_id and workspace_id = ws and archived_at is null;
  if not found then raise exception 'card_not_found' using errcode = 'P0002'; end if;
  perform private.require_category(ws, p_category_id, 'expense');
  if p_installments < 1 or p_installments > 48 then raise exception 'invalid_installments' using errcode = '22023'; end if;
  if p_total_cents < p_installments then raise exception 'invalid_amount' using errcode = '22023'; end if;

  tid := private.insert_tx(ws, 'card_purchase', p_total_cents, p_description, p_category_id, null, null,
    p_purchase_date, null, null, 'card', p_card_id, p_idempotency_key);
  insert into public.card_purchases (workspace_id, card_id, transaction_id, description, purchase_date, total_cents, installments_count)
  values (ws, p_card_id, tid, btrim(p_description), p_purchase_date, p_total_cents, p_installments) returning id into pid;

  first_ref := date_trunc('month', p_purchase_date)::date;
  if extract(day from p_purchase_date) >= c.closing_day then first_ref := (first_ref + interval '1 month')::date; end if;

  for inst in select * from private.split_installments(p_total_cents, p_installments) loop
    insert into public.installments (workspace_id, purchase_id, number, amount_cents, invoice_id)
    values (ws, pid, inst.number, inst.amount_cents,
      private.ensure_invoice(ws, p_card_id, (first_ref + make_interval(months => inst.number - 1))::date));
  end loop;
  perform private.audit(ws, 'create', 'card_purchase', pid::text, jsonb_build_object('total_cents', p_total_cents, 'n', p_installments));
  return tid;
end $$;
comment on function private.record_card_purchase(uuid, uuid, text, uuid, date, bigint, int, text) is 'rpc';

create or replace function private.invoice_totals(p_invoice_id uuid)
returns table (installments_cents bigint, charges_cents bigint, paid_cents bigint, total_cents bigint, pending_cents bigint)
language sql stable security definer set search_path = '' as $$
  with i as (
    select coalesce(sum(it.amount_cents), 0)::bigint v from public.installments it
    join public.card_purchases p on p.id = it.purchase_id
    join public.transactions t on t.id = p.transaction_id
    where it.invoice_id = p_invoice_id and t.reversed_at is null
  ), ch as (
    select coalesce(sum(x.amount_cents) filter (where x.item_kind = 'charge'), 0)::bigint c,
           coalesce(sum(x.amount_cents) filter (where x.item_kind = 'payment'), 0)::bigint p
    from public.card_invoice_items x join public.transactions t on t.id = x.transaction_id
    where x.invoice_id = p_invoice_id and t.reversed_at is null
  )
  select i.v, ch.c, ch.p, i.v + ch.c, i.v + ch.c - ch.p from i, ch
$$;

-- Encargos informados (juros/multa/IOF/anuidade) são despesa; nunca estimados.
create or replace function private.record_invoice_charge(ws uuid, p_invoice_id uuid, p_amount_cents bigint, p_description text, p_idempotency_key text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  inv record;
  tid uuid;
  cat uuid;
begin
  perform private.require_role(ws, 'collaborator');
  tid := private.existing_tx(ws, p_idempotency_key);
  if tid is not null then return tid; end if;
  select * into inv from public.card_invoices where id = p_invoice_id and workspace_id = ws;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select id into cat from public.categories where workspace_id = ws and kind = 'expense' and lower(name) = 'juros e encargos';
  tid := private.insert_tx(ws, 'card_charge', p_amount_cents, coalesce(nullif(btrim(p_description), ''), 'Encargos do cartão'),
    cat, null, null, inv.closing_date, null, null, 'card', inv.card_id, p_idempotency_key);
  insert into public.card_invoice_items (workspace_id, invoice_id, item_kind, transaction_id, amount_cents)
  values (ws, inv.id, 'charge', tid, p_amount_cents);
  return tid;
end $$;
comment on function private.record_invoice_charge(uuid, uuid, bigint, text, text) is 'rpc';

-- Pagamento de fatura: saída de caixa, NÃO é nova despesa (a despesa foi a compra).
create or replace function private.pay_invoice(ws uuid, p_invoice_id uuid, p_amount_cents bigint, p_date date, p_account_id uuid, p_idempotency_key text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  inv record;
  tot record;
  tid uuid;
begin
  perform private.require_role(ws, 'collaborator');
  tid := private.existing_tx(ws, p_idempotency_key);
  if tid is not null then return tid; end if;
  select * into inv from public.card_invoices where id = p_invoice_id and workspace_id = ws for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into tot from private.invoice_totals(inv.id);
  if p_amount_cents > tot.pending_cents then raise exception 'exceeds_pending' using errcode = '22023'; end if;
  perform private.require_same_ws_account(ws, p_account_id);
  tid := private.insert_tx(ws, 'card_payment', p_amount_cents, 'Pagamento de fatura', null, p_account_id, null,
    p_date, p_date, null, 'card', inv.card_id, p_idempotency_key);
  insert into public.card_invoice_items (workspace_id, invoice_id, item_kind, transaction_id, amount_cents)
  values (ws, inv.id, 'payment', tid, p_amount_cents);
  perform private.audit(ws, 'pay', 'card_invoice', inv.id::text, jsonb_build_object('amount_cents', p_amount_cents));
  return tid;
end $$;
comment on function private.pay_invoice(uuid, uuid, bigint, date, uuid, text) is 'rpc';

-- ---------------------------------------------------------------------------
-- Dívidas
-- ---------------------------------------------------------------------------
create or replace function private.create_debt(ws uuid, p_name text, p_creditor text, p_outstanding_cents bigint,
  p_monthly_rate numeric, p_installment_cents bigint, p_remaining_installments int, p_due_day int)
returns uuid language plpgsql security definer set search_path = '' as $$
declare did uuid;
begin
  perform private.require_role(ws, 'collaborator');
  insert into public.debts (workspace_id, name, creditor, outstanding_cents, monthly_rate, installment_cents, remaining_installments, due_day)
  values (ws, btrim(p_name), p_creditor, p_outstanding_cents, p_monthly_rate, p_installment_cents, p_remaining_installments, p_due_day)
  returning id into did;
  return did;
end $$;
comment on function private.create_debt(uuid, text, text, bigint, numeric, bigint, int, int) is 'rpc';

-- Principal reduz a dívida (saída de caixa, não despesa). Juros/encargos são despesa separada.
create or replace function private.pay_debt(ws uuid, p_debt_id uuid, p_principal_cents bigint, p_interest_cents bigint,
  p_date date, p_account_id uuid, p_idempotency_key text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  d record;
  tid uuid;
  cat uuid;
begin
  perform private.require_role(ws, 'collaborator');
  tid := private.existing_tx(ws, p_idempotency_key || ':principal');
  if tid is not null then return tid; end if;
  select * into d from public.debts where id = p_debt_id and workspace_id = ws for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if coalesce(p_principal_cents, 0) <= 0 then raise exception 'invalid_amount' using errcode = '22023'; end if;
  if p_principal_cents > d.outstanding_cents then raise exception 'exceeds_outstanding' using errcode = '22023'; end if;
  perform private.require_same_ws_account(ws, p_account_id);
  tid := private.insert_tx(ws, 'debt_payment', p_principal_cents, left('Amortização: ' || d.name, 200), null, p_account_id, null,
    p_date, p_date, null, 'debt', d.id, p_idempotency_key || ':principal');
  if coalesce(p_interest_cents, 0) > 0 then
    select id into cat from public.categories where workspace_id = ws and kind = 'expense' and lower(name) = 'juros e encargos';
    perform private.insert_tx(ws, 'expense', p_interest_cents, left('Juros: ' || d.name, 200), cat, p_account_id, null,
      p_date, p_date, null, 'debt', d.id, p_idempotency_key || ':interest');
  end if;
  update public.debts set outstanding_cents = outstanding_cents - p_principal_cents,
    remaining_installments = case when remaining_installments > 0 then remaining_installments - 1 else remaining_installments end,
    status = case when outstanding_cents - p_principal_cents = 0 then 'settled' else status end,
    version = version + 1
  where id = d.id;
  return tid;
end $$;
comment on function private.pay_debt(uuid, uuid, bigint, bigint, date, uuid, text) is 'rpc';

-- ---------------------------------------------------------------------------
-- Metas e orçamentos
-- ---------------------------------------------------------------------------
create or replace function private.create_goal(ws uuid, p_name text, p_target_cents bigint, p_target_date date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  owner uuid := private.workspace_owner(ws);
  lim int;
  n int;
  gid uuid;
begin
  perform private.require_role(ws, 'collaborator');
  perform pg_advisory_xact_lock(hashtextextended(owner::text || ':goals', 0));
  select p.max_active_goals into lim from public.plans p where p.code = private.effective_plan(owner);
  select count(*) into n from public.goals g join public.workspaces w on w.id = g.workspace_id
    where w.owner_id = owner and g.status = 'active';
  if lim is not null and n >= lim then raise exception 'quota_exceeded:goals' using errcode = 'P0001'; end if;
  insert into public.goals (workspace_id, name, target_cents, target_date) values (ws, btrim(p_name), p_target_cents, p_target_date)
  returning id into gid;
  perform private.audit(ws, 'create', 'goal', gid::text, jsonb_build_object('target_cents', p_target_cents));
  return gid;
end $$;
comment on function private.create_goal(uuid, text, bigint, date) is 'rpc';

create or replace function private.contribute_goal(ws uuid, p_goal_id uuid, p_amount_cents bigint, p_date date, p_note text, p_idempotency_key text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  cid uuid;
  g record;
begin
  perform private.require_role(ws, 'collaborator');
  select id into cid from public.goal_contributions where workspace_id = ws and idempotency_key = p_idempotency_key;
  if found then return cid; end if;
  select * into g from public.goals where id = p_goal_id and workspace_id = ws for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into public.goal_contributions (workspace_id, goal_id, amount_cents, contribution_date, note, idempotency_key, created_by)
  values (ws, g.id, p_amount_cents, p_date, p_note, p_idempotency_key, auth.uid()) returning id into cid;
  update public.goals set status = case when (select sum(amount_cents) from public.goal_contributions where goal_id = g.id) >= g.target_cents
    then 'achieved' else 'active' end, version = version + 1 where id = g.id and status <> 'archived';
  return cid;
end $$;
comment on function private.contribute_goal(uuid, uuid, bigint, date, text, text) is 'rpc';

create or replace function private.upsert_budget(ws uuid, p_category_id uuid, p_month date, p_amount_cents bigint)
returns uuid language plpgsql security definer set search_path = '' as $$
declare bid uuid;
begin
  perform private.require_role(ws, 'collaborator');
  perform private.require_category(ws, p_category_id, 'expense');
  insert into public.budgets (workspace_id, category_id, month, amount_cents)
  values (ws, p_category_id, date_trunc('month', p_month)::date, p_amount_cents)
  on conflict (workspace_id, category_id, month) do update set amount_cents = excluded.amount_cents
  returning id into bid;
  return bid;
end $$;
comment on function private.upsert_budget(uuid, uuid, date, bigint) is 'rpc';

-- Leitura de agregados por tarefas de servidor (fila de relatórios/lembretes) sem sessão de usuário.
-- Só o papel service_role (claim do JWT emitido pelo Supabase) passa; quem pediu é reverificado na aplicação.
create or replace function private.is_service_role()
returns boolean language sql stable set search_path = '' as $$
  -- coalesce final: ausência de claim => false (nunca NULL, que anularia o NOT nas verificações)
  select coalesce(coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
                           nullif(current_setting('request.jwt.claim.role', true), '')) = 'service_role', false)
$$;

create or replace function private.can_read(ws uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.is_member(ws), false) or private.is_service_role()
$$;

-- ---------------------------------------------------------------------------
-- Agregações canônicas (dashboard, relatórios, IA e PDF consomem estes valores)
-- Valores em centavos retornados como TEXTO para evitar perda de precisão em JSON.
-- ---------------------------------------------------------------------------
create or replace function private.financial_summary(ws uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  res jsonb;
begin
  if not private.can_read(ws) then raise exception 'forbidden' using errcode = '42501'; end if;
  with fx as (
    select t.* from public.transactions t
    where t.workspace_id = ws and t.reversed_at is null and t.reversal_of is null
  ),
  comp as (
    select
      coalesce(sum(amount_cents) filter (where kind = 'income'), 0) as income,
      coalesce(sum(amount_cents) filter (where kind in ('expense', 'card_purchase', 'card_charge')), 0) as expense
    from fx where competence_date between p_from and p_to
  ),
  cash as (
    select
      coalesce(sum(le.amount_cents) filter (where le.amount_cents > 0 and t.kind <> 'transfer'), 0) as cash_in,
      coalesce(-sum(le.amount_cents) filter (where le.amount_cents < 0 and t.kind <> 'transfer'), 0) as cash_out
    from public.ledger_entries le join public.transactions t on t.id = le.transaction_id
    where le.workspace_id = ws and le.entry_date between p_from and p_to
  ),
  bal as (
    select coalesce(sum(a.opening_balance_cents), 0)
      + coalesce((select sum(le.amount_cents) from public.ledger_entries le
                  join public.accounts a2 on a2.id = le.account_id
                  where le.workspace_id = ws and le.entry_date <= p_to and a2.archived_at is null), 0) as balance
    from public.accounts a where a.workspace_id = ws and a.archived_at is null
  ),
  pend as (
    select
      coalesce(sum(c.amount_cents - private.commitment_settled(c.id)) filter (where c.direction = 'payable'), 0) as payable,
      coalesce(sum(c.amount_cents - private.commitment_settled(c.id)) filter (where c.direction = 'receivable'), 0) as receivable,
      count(*) filter (where c.due_date < current_date) as overdue_count
    from public.commitments c
    where c.workspace_id = ws and c.cancelled_at is null and c.due_date <= p_to + 30
      and c.amount_cents > private.commitment_settled(c.id)
  )
  select jsonb_build_object(
    'workspace_id', ws, 'from', p_from, 'to', p_to, 'currency', 'BRL',
    'basis', jsonb_build_object('result', 'competence', 'cash', 'ledger'),
    'income_cents', comp.income::text,
    'expense_cents', comp.expense::text,
    'result_cents', (comp.income - comp.expense)::text,
    'cash_in_cents', cash.cash_in::text,
    'cash_out_cents', cash.cash_out::text,
    'balance_cents', bal.balance::text,
    'pending_payable_cents', pend.payable::text,
    'pending_receivable_cents', pend.receivable::text,
    'overdue_count', pend.overdue_count,
    'accounts_count', (select count(*) from public.accounts a where a.workspace_id = ws and a.archived_at is null),
    'transactions_count', (select count(*) from fx where competence_date between p_from and p_to)
  ) into res from comp, cash, bal, pend;
  return res;
end $$;
comment on function private.financial_summary(uuid, date, date) is 'rpc';

create or replace function private.category_breakdown(ws uuid, p_from date, p_to date, p_kind text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.can_read(ws) then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('category_id', x.category_id, 'name', x.name, 'amount_cents', x.total::text, 'count', x.n)
      order by x.total desc)
    from (
      select t.category_id, coalesce(c.name, 'Sem categoria') as name, sum(t.amount_cents) as total, count(*) as n
      from public.transactions t left join public.categories c on c.id = t.category_id
      where t.workspace_id = ws and t.reversed_at is null and t.reversal_of is null
        and t.competence_date between p_from and p_to
        and ((p_kind = 'income' and t.kind = 'income') or (p_kind = 'expense' and t.kind in ('expense', 'card_purchase', 'card_charge')))
      group by t.category_id, c.name
    ) x), '[]'::jsonb);
end $$;
comment on function private.category_breakdown(uuid, date, date, text) is 'rpc';

create or replace function private.monthly_series(ws uuid, p_months int, p_until date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.can_read(ws) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_months < 1 or p_months > 36 then raise exception 'invalid_range' using errcode = '22023'; end if;
  return (
    select jsonb_agg(jsonb_build_object(
      'month', m.month,
      'complete', (m.month + interval '1 month')::date <= p_until + 1,
      'income_cents', coalesce(s.income, 0)::text,
      'expense_cents', coalesce(s.expense, 0)::text
    ) order by m.month)
    from (select (date_trunc('month', p_until) - make_interval(months => g))::date as month
          from generate_series(0, p_months - 1) g) m
    left join lateral (
      select sum(t.amount_cents) filter (where t.kind = 'income') income,
             sum(t.amount_cents) filter (where t.kind in ('expense', 'card_purchase', 'card_charge')) expense
      from public.transactions t
      where t.workspace_id = ws and t.reversed_at is null and t.reversal_of is null
        and t.competence_date >= m.month and t.competence_date < (m.month + interval '1 month')::date
        and t.competence_date <= p_until
    ) s on true
  );
end $$;
comment on function private.monthly_series(uuid, int, date) is 'rpc';

create or replace function private.account_balances(ws uuid, p_as_of date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.can_read(ws) then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('account_id', a.id, 'name', a.name, 'kind', a.kind,
      'opening_cents', a.opening_balance_cents::text,
      'balance_cents', (a.opening_balance_cents + coalesce((select sum(le.amount_cents) from public.ledger_entries le
        where le.account_id = a.id and le.entry_date <= p_as_of), 0))::text) order by a.created_at)
    from public.accounts a where a.workspace_id = ws and a.archived_at is null), '[]'::jsonb);
end $$;
comment on function private.account_balances(uuid, date) is 'rpc';

create or replace function private.upcoming_commitments(ws uuid, p_until date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.can_read(ws) then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(x order by x->>'due_date') from (
      select jsonb_build_object('id', c.id, 'direction', c.direction, 'description', c.description,
        'due_date', c.due_date, 'amount_cents', c.amount_cents::text,
        'pending_cents', (c.amount_cents - private.commitment_settled(c.id))::text,
        'overdue', c.due_date < current_date, 'version', c.version, 'source', 'commitment') x
      from public.commitments c
      where c.workspace_id = ws and c.cancelled_at is null and c.due_date <= p_until
        and c.amount_cents > private.commitment_settled(c.id)
      union all
      select jsonb_build_object('id', i.id, 'direction', 'payable', 'description', 'Fatura ' || cc.name,
        'due_date', i.due_date, 'amount_cents', tot.total_cents::text, 'pending_cents', tot.pending_cents::text,
        'overdue', i.due_date < current_date, 'version', 0, 'source', 'card_invoice')
      from public.card_invoices i join public.credit_cards cc on cc.id = i.card_id
      cross join lateral private.invoice_totals(i.id) tot
      where i.workspace_id = ws and i.due_date <= p_until and tot.pending_cents > 0
    ) s), '[]'::jsonb);
end $$;
comment on function private.upcoming_commitments(uuid, date) is 'rpc';

create or replace function private.goal_progress(ws uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.can_read(ws) then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'status', g.status, 'target_cents', g.target_cents::text,
      'saved_cents', coalesce(s.total, 0)::text, 'target_date', g.target_date, 'version', g.version)
      order by g.priority desc, g.created_at)
    from public.goals g left join lateral (
      select sum(gc.amount_cents) total from public.goal_contributions gc where gc.goal_id = g.id) s on true
    where g.workspace_id = ws and g.status <> 'archived'), '[]'::jsonb);
end $$;
comment on function private.goal_progress(uuid) is 'rpc';

create or replace function private.card_invoices_summary(ws uuid, p_from date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.can_read(ws) then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', i.id, 'card_id', i.card_id, 'reference_month', i.reference_month,
      'closing_date', i.closing_date, 'due_date', i.due_date,
      'installments_cents', t.installments_cents::text, 'charges_cents', t.charges_cents::text,
      'paid_cents', t.paid_cents::text, 'total_cents', t.total_cents::text, 'pending_cents', t.pending_cents::text)
      order by i.due_date)
    from public.card_invoices i cross join lateral private.invoice_totals(i.id) t
    where i.workspace_id = ws and (i.due_date >= p_from or t.pending_cents > 0)), '[]'::jsonb);
end $$;
comment on function private.card_invoices_summary(uuid, date) is 'rpc';

create or replace function private.daily_expenses(ws uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.can_read(ws) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_to - p_from > 400 then raise exception 'invalid_range' using errcode = '22023'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('date', d, 'amount_cents', v::text) order by d) from (
    select t.competence_date d, sum(t.amount_cents) v from public.transactions t
    where t.workspace_id = ws and t.reversed_at is null and t.reversal_of is null
      and t.kind in ('expense', 'card_purchase', 'card_charge') and t.competence_date between p_from and p_to
    group by t.competence_date) x), '[]'::jsonb);
end $$;
comment on function private.daily_expenses(uuid, date, date) is 'rpc';

-- ---------------------------------------------------------------------------
-- Publicação: wrappers SECURITY INVOKER em public para funções 'rpc'
-- ---------------------------------------------------------------------------
create or replace function private.publish_rpcs()
returns void language plpgsql set search_path = '' as $$
declare
  r record;
  call_args text;
begin
  for r in
    select p.oid, p.proname, pg_get_function_arguments(p.oid) as args, pg_get_function_result(p.oid) as res, p.proargnames
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and obj_description(p.oid, 'pg_proc') = 'rpc'
  loop
    select string_agg('"' || a || '"', ', ') into call_args from unnest(r.proargnames) a;
    execute format('create or replace function public.%I(%s) returns %s language sql security invoker set search_path = '''' as $f$ select private.%I(%s) $f$',
      r.proname, r.args, r.res, r.proname, coalesce(call_args, ''));
    execute format('revoke execute on function public.%I(%s) from public, anon', r.proname, pg_get_function_identity_arguments(r.oid));
    execute format('grant execute on function public.%I(%s) to authenticated, service_role', r.proname, pg_get_function_identity_arguments(r.oid));
    execute format('revoke execute on function private.%I(%s) from public', r.proname, pg_get_function_identity_arguments(r.oid));
    execute format('grant execute on function private.%I(%s) to authenticated', r.proname, pg_get_function_identity_arguments(r.oid));
  end loop;
end $$;

select private.publish_rpcs();
