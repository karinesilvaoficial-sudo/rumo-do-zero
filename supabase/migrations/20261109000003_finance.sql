-- RUMO · 0003 · Domínio financeiro
-- Política (docs/politica-financeira.md):
--   * transactions = fato financeiro canônico; ledger_entries = efeito no caixa por conta.
--   * Saldo de conta = saldo inicial + soma do ledger. Saldo inicial NÃO é receita.
--   * Transferência: 1 transação, 2 lançamentos de ledger (−/+). Não é receita nem despesa.
--   * Compra no cartão: despesa por competência na data da compra (kind card_purchase), sem ledger.
--     Pagamento de fatura: saída de caixa (kind card_payment), NÃO é despesa. Encargos: card_charge.
--   * Pagamento de principal de dívida: saída de caixa (debt_payment), não é despesa; juros são despesa.
--   * Exclusão = estorno: transação espelho (reversal_of) com ledger invertido; histórico preservado.
--   * Realizado (transactions), previsto (commitments abertos) e simulado (scenarios) são tabelas distintas.

create type public.tx_kind as enum
  ('income', 'expense', 'transfer', 'card_purchase', 'card_charge', 'card_payment', 'debt_payment');

-- Limite por valor: R$ 100 bilhões em centavos — somas seguem seguras em JS (< 2^53)
create domain public.cents as bigint check (value between 1 and 10000000000000);

-- ---------------------------------------------------------------------------
-- Contas e categorias
-- ---------------------------------------------------------------------------
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  kind text not null default 'checking' check (kind in ('checking', 'savings', 'cash', 'investment', 'other')),
  opening_balance_cents bigint not null default 0 check (abs(opening_balance_cents) <= 10000000000000),
  opening_date date not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, workspace_id)
);
create index accounts_ws_idx on public.accounts (workspace_id);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  kind text not null check (kind in ('income', 'expense')),
  is_system boolean not null default false,
  archived_at timestamptz,
  unique (id, workspace_id)
);
create unique index categories_unique_name on public.categories (workspace_id, kind, lower(name));

-- ---------------------------------------------------------------------------
-- Fatos financeiros e ledger
-- ---------------------------------------------------------------------------
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  kind public.tx_kind not null,
  amount_cents public.cents not null,
  description text not null check (char_length(description) between 1 and 200),
  notes text check (char_length(notes) <= 2000),
  category_id uuid,
  account_id uuid,                -- origem (saída) ou destino (receita)
  to_account_id uuid,             -- destino da transferência
  competence_date date not null,
  settled_date date,              -- data do efeito no caixa (null para card_purchase/card_charge)
  reversal_of uuid unique references public.transactions (id),
  reversed_at timestamptz,
  source text not null default 'manual' check (source in ('manual', 'commitment', 'card', 'debt', 'goal', 'proposal', 'ai_intent', 'import')),
  source_id uuid,
  version int not null default 1,
  idempotency_key text not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, idempotency_key),
  unique (id, workspace_id),
  foreign key (category_id, workspace_id) references public.categories (id, workspace_id),
  foreign key (account_id, workspace_id) references public.accounts (id, workspace_id),
  foreign key (to_account_id, workspace_id) references public.accounts (id, workspace_id),
  check (kind <> 'transfer' or (account_id is not null and to_account_id is not null and account_id <> to_account_id and category_id is null)),
  check (kind = 'transfer' or to_account_id is null),
  check (kind not in ('income', 'expense', 'card_payment', 'debt_payment') or (account_id is not null and settled_date is not null)),
  check (kind not in ('card_purchase', 'card_charge') or (account_id is null and settled_date is null))
);
create index transactions_ws_comp_idx on public.transactions (workspace_id, competence_date desc, created_at desc);
create index transactions_ws_kind_idx on public.transactions (workspace_id, kind, competence_date);
create index transactions_source_idx on public.transactions (source, source_id);

create table public.ledger_entries (
  id bigint generated always as identity primary key,
  workspace_id uuid not null,
  transaction_id uuid not null,
  account_id uuid not null,
  amount_cents bigint not null check (amount_cents <> 0),   -- assinado: + entra, − sai
  entry_date date not null,
  foreign key (transaction_id, workspace_id) references public.transactions (id, workspace_id) on delete cascade,
  foreign key (account_id, workspace_id) references public.accounts (id, workspace_id)
);
create index ledger_account_idx on public.ledger_entries (account_id, entry_date);
create index ledger_ws_date_idx on public.ledger_entries (workspace_id, entry_date);

-- ---------------------------------------------------------------------------
-- Compromissos (a pagar/receber), recorrências e liquidações
-- ---------------------------------------------------------------------------
create table public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  direction text not null check (direction in ('payable', 'receivable')),
  description text not null check (char_length(description) between 1 and 200),
  category_id uuid,
  amount_cents public.cents not null,
  frequency text not null check (frequency in ('weekly', 'monthly', 'yearly')),
  start_date date not null,
  end_date date check (end_date is null or end_date >= start_date),
  active boolean not null default true,
  version int not null default 1,
  created_at timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (category_id, workspace_id) references public.categories (id, workspace_id)
);

create table public.commitments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  direction text not null check (direction in ('payable', 'receivable')),
  description text not null check (char_length(description) between 1 and 200),
  category_id uuid,
  amount_cents public.cents not null,
  due_date date not null,
  competence_date date not null,
  cancelled_at timestamptz,
  recurring_rule_id uuid,
  occurrence_date date,
  detached boolean not null default false,  -- editado individualmente: "editar próximas" não sobrescreve
  contact_id uuid,
  version int not null default 1,
  idempotency_key text not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (workspace_id, idempotency_key),
  unique (id, workspace_id),
  -- mesma ocorrência não nasce duas vezes
  unique (recurring_rule_id, occurrence_date),
  foreign key (category_id, workspace_id) references public.categories (id, workspace_id),
  foreign key (recurring_rule_id, workspace_id) references public.recurring_rules (id, workspace_id)
);
create index commitments_ws_due_idx on public.commitments (workspace_id, due_date);

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  commitment_id uuid not null,
  transaction_id uuid not null unique,
  amount_cents public.cents not null,
  settled_date date not null,
  foreign key (commitment_id, workspace_id) references public.commitments (id, workspace_id) on delete cascade,
  foreign key (transaction_id, workspace_id) references public.transactions (id, workspace_id)
);
create index settlements_commitment_idx on public.settlements (commitment_id);

-- ---------------------------------------------------------------------------
-- Cartões (manuais — sem conexão bancária)
-- ---------------------------------------------------------------------------
create table public.credit_cards (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  closing_day int not null check (closing_day between 1 and 28),
  due_day int not null check (due_day between 1 and 28),
  limit_cents bigint check (limit_cents is null or limit_cents > 0),
  payment_account_id uuid,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (payment_account_id, workspace_id) references public.accounts (id, workspace_id)
);

create table public.card_invoices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  card_id uuid not null,
  reference_month date not null check (extract(day from reference_month) = 1),
  closing_date date not null,
  due_date date not null,
  unique (card_id, reference_month),
  unique (id, workspace_id),
  foreign key (card_id, workspace_id) references public.credit_cards (id, workspace_id) on delete cascade
);

create table public.card_purchases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  card_id uuid not null,
  transaction_id uuid not null unique,
  description text not null check (char_length(description) between 1 and 200),
  purchase_date date not null,
  total_cents public.cents not null,
  installments_count int not null check (installments_count between 1 and 48),
  created_at timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (card_id, workspace_id) references public.credit_cards (id, workspace_id) on delete cascade,
  foreign key (transaction_id, workspace_id) references public.transactions (id, workspace_id)
);

create table public.installments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  purchase_id uuid not null,
  number int not null check (number >= 1),
  amount_cents public.cents not null,
  invoice_id uuid not null,
  unique (purchase_id, number),
  foreign key (purchase_id, workspace_id) references public.card_purchases (id, workspace_id) on delete cascade,
  foreign key (invoice_id, workspace_id) references public.card_invoices (id, workspace_id)
);
create index installments_invoice_idx on public.installments (invoice_id);

create table public.card_invoice_items (
  -- encargos informados (juros, multa, IOF, anuidade) e pagamentos da fatura
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  invoice_id uuid not null,
  item_kind text not null check (item_kind in ('charge', 'payment')),
  transaction_id uuid not null unique,
  amount_cents public.cents not null,
  foreign key (invoice_id, workspace_id) references public.card_invoices (id, workspace_id) on delete cascade,
  foreign key (transaction_id, workspace_id) references public.transactions (id, workspace_id)
);

-- ---------------------------------------------------------------------------
-- Dívidas
-- ---------------------------------------------------------------------------
create table public.debts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  creditor text check (char_length(creditor) <= 80),
  outstanding_cents bigint not null check (outstanding_cents >= 0),
  -- taxa informada pelo usuário (fração ao mês, ex. 0.0299). NULL = desconhecida; nunca assumida zero.
  monthly_rate numeric(12, 8) check (monthly_rate is null or (monthly_rate >= 0 and monthly_rate < 1)),
  installment_cents bigint check (installment_cents is null or installment_cents > 0),
  remaining_installments int check (remaining_installments is null or remaining_installments >= 0),
  due_day int check (due_day between 1 and 28),
  status text not null default 'active' check (status in ('active', 'settled', 'archived')),
  version int not null default 1,
  created_at timestamptz not null default now(),
  unique (id, workspace_id)
);

-- ---------------------------------------------------------------------------
-- Planejamento: orçamentos, metas, cenários
-- ---------------------------------------------------------------------------
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  category_id uuid not null,
  month date not null check (extract(day from month) = 1),
  amount_cents public.cents not null,
  unique (workspace_id, category_id, month),
  foreign key (category_id, workspace_id) references public.categories (id, workspace_id)
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  target_cents public.cents not null,
  target_date date,
  priority int not null default 0,
  status text not null default 'active' check (status in ('active', 'achieved', 'archived')),
  version int not null default 1,
  created_at timestamptz not null default now(),
  unique (id, workspace_id)
);

create table public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  goal_id uuid not null,
  amount_cents bigint not null check (amount_cents <> 0 and abs(amount_cents) <= 10000000000000),
  contribution_date date not null,
  note text check (char_length(note) <= 200),
  idempotency_key text not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (workspace_id, idempotency_key),
  foreign key (goal_id, workspace_id) references public.goals (id, workspace_id) on delete cascade
);

create table public.scenarios (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  kind text not null check (kind in ('conservative', 'central', 'optimistic', 'custom')),
  assumptions jsonb not null default '{}'::jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS: leitura por membros; escrita direta revogada (somente via funções).
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['accounts','categories','transactions','ledger_entries','recurring_rules',
    'commitments','settlements','credit_cards','card_invoices','card_purchases','installments',
    'card_invoice_items','debts','budgets','goals','goal_contributions','scenarios']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (private.is_member(workspace_id))', t || '_select_member', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;
