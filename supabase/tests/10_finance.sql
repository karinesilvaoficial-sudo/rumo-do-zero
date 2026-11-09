begin;
\i supabase/tests/_helpers.inc
select t.login('00000000-0000-0000-0000-00000000000a');
do $$
declare
  ws uuid; acc1 uuid; acc2 uuid; cat_sal uuid; cat_food uuid; s jsonb; tid uuid; tid2 uuid; rid uuid;
  cid uuid; card uuid; inv record; n int; v int; rule uuid; debt uuid; arr bigint[];
begin
  ws := public.create_workspace('personal', 'Pessoal');
  acc1 := public.create_account(ws, 'Conta corrente', 'checking', 50000, '2026-11-01');   -- saldo inicial R$ 500
  acc2 := public.create_account(ws, 'Poupança', 'savings', 0, '2026-11-01');
  select id into cat_sal from public.categories where workspace_id = ws and name = 'Salário';
  select id into cat_food from public.categories where workspace_id = ws and name = 'Alimentação';

  -- (1) Receita 1.000 e despesa 250 → variação 750; saldo inicial não é receita
  perform public.record_transaction(ws, 'income', 100000, 'Salário', cat_sal, acc1, '2026-11-05', '2026-11-05', null, 'k1');
  perform public.record_transaction(ws, 'expense', 25000, 'Mercado', cat_food, acc1, '2026-11-06', '2026-11-06', null, 'k2');
  s := public.financial_summary(ws, '2026-11-01', '2026-11-30');
  perform t.eq('1 income', s->>'income_cents', '100000');
  perform t.eq('1 expense', s->>'expense_cents', '25000');
  perform t.eq('1 result', s->>'result_cents', '75000');
  perform t.eq('1 balance = opening + 750', s->>'balance_cents', '125000');

  -- idempotência: mesmo key não duplica
  perform public.record_transaction(ws, 'expense', 25000, 'Mercado', cat_food, acc1, '2026-11-06', '2026-11-06', null, 'k2');
  s := public.financial_summary(ws, '2026-11-01', '2026-11-30');
  perform t.eq('idem expense', s->>'expense_cents', '25000');

  -- (2) Transferência de 100 preserva total e não altera receitas/despesas
  perform public.record_transfer(ws, acc1, acc2, 10000, '2026-11-07', null, 'k3');
  s := public.financial_summary(ws, '2026-11-01', '2026-11-30');
  perform t.eq('2 balance', s->>'balance_cents', '125000');
  perform t.eq('2 income', s->>'income_cents', '100000');
  perform t.eq('2 expense', s->>'expense_cents', '25000');
  perform t.eq('2 cash_out excludes transfer', s->>'cash_out_cents', '25000');
  perform t.eq('2 acc2', (select (x->>'balance_cents') from jsonb_array_elements(public.account_balances(ws, '2026-11-30')) x where x->>'name' = 'Poupança'), '10000');

  -- (3) R$ 100 em 3 parcelas: 33,33 · 33,33 · 33,34 = 100,00 e datas de fatura previstas
  card := public.create_card(ws, 'Cartão Azul', 10, 20, 500000, acc1);
  tid := public.record_card_purchase(ws, card, 'Fone', cat_food, '2026-11-12', 10000, 3, 'k4');
  select array_agg(i.amount_cents order by i.number) into arr from public.installments i join public.card_purchases p on p.id = i.purchase_id where p.transaction_id = tid;
  perform t.eq('3 split', arr, array[3333, 3333, 3334]::bigint[]);
  perform t.eq('3 sum', (select sum(x) from unnest(arr) x), 10000::numeric);
  -- compra dia 12 ≥ fechamento 10 → primeira fatura dez/2026, vencimento 20/12
  perform t.eq('3 dates', (select array_agg(ci.due_date order by i.number) from public.installments i
    join public.card_invoices ci on ci.id = i.invoice_id join public.card_purchases p on p.id = i.purchase_id where p.transaction_id = tid),
    array['2026-12-20', '2027-01-20', '2027-02-20']::date[]);

  -- (4) Compra no cartão + pagamento da fatura não duplicam despesa
  select ci.* into inv from public.card_invoices ci where ci.card_id = card and ci.reference_month = '2026-12-01';
  perform public.pay_invoice(ws, inv.id, 3333, '2026-12-20', acc1, 'k5');
  s := public.financial_summary(ws, '2026-11-01', '2026-12-31');
  perform t.eq('4 expense once', s->>'expense_cents', '35000');      -- 250 + 100 (compra) ; pagamento não é despesa
  perform t.eq('4 cash_out has payment', s->>'cash_out_cents', '28333');
  perform t.throws('4 overpay', format('select public.pay_invoice(%L, %L, 1, %L, %L, %L)', ws, inv.id, '2026-12-21', acc1, 'k6'), 'exceeds_pending');

  -- (5) Pagamento parcial, cancelamento e estorno
  cid := public.create_commitment(ws, 'payable', 'Aluguel', null, 120000, '2026-11-10', null, 'k7');
  perform public.settle_commitment(ws, cid, 50000, '2026-11-10', acc1, 'k8');
  perform t.eq('5 pending after partial', (select (x->>'pending_cents') from jsonb_array_elements(public.upcoming_commitments(ws, '2026-12-31')) x where x->>'id' = cid::text), '70000');
  perform t.throws('5 exceeds', format('select public.settle_commitment(%L, %L, 80000, %L, %L, %L)', ws, cid, '2026-11-11', acc1, 'k9'), 'exceeds_pending');
  perform t.throws('5 date required', format('select public.settle_commitment(%L, %L, 100, null, %L, %L)', ws, cid, acc1, 'k9b'), 'date_and_amount_required');
  select version into v from public.commitments where id = cid;
  perform public.cancel_commitment(ws, cid, v);
  perform t.eq('5 cancelled not pending', (select count(*) from jsonb_array_elements(public.upcoming_commitments(ws, '2026-12-31')) x where x->>'id' = cid::text), 0::bigint);
  -- estorno do salário: receita sai do resultado, histórico preservado, saldo recalculado
  select id, version into tid2, v from public.transactions where workspace_id = ws and idempotency_key = 'k1';
  rid := public.reverse_transaction(ws, tid2, v, 'lançado em duplicidade');
  perform t.eq('5 reversal idempotent', public.reverse_transaction(ws, tid2, v + 1, 'x'), rid);
  s := public.financial_summary(ws, '2026-11-01', '2026-11-30');
  perform t.eq('5 income after reversal', s->>'income_cents', '0');
  perform t.eq('5 history kept', (select count(*) from public.transactions where id in (tid2, rid)), 2::bigint);
  perform t.throws('5 version conflict', format('select public.edit_transaction(%L, (select id from public.transactions where idempotency_key = %L and workspace_id = %L), 99, %L, null, null, null, null, null, null)', ws, 'k2', ws, 'x'), 'version_conflict');

  -- (6) Mesma recorrência executada duas vezes → uma ocorrência por data
  rule := public.create_recurring_rule(ws, 'payable', 'Internet', null, 9990, 'monthly', '2027-01-31', null);
  n := public.generate_occurrences(ws, rule, '2027-04-30');
  perform t.eq('6 rerun creates none', n, 0);
  perform t.eq('6 occurrences', (select array_agg(due_date order by due_date) from public.commitments where recurring_rule_id = rule),
    array['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']::date[]);
  -- editar próximas a partir de março não altera jan/fev
  select version into v from public.recurring_rules where id = rule;
  perform t.eq('6 edit from', public.edit_rule_from(ws, rule, v, '2027-03-01', 12990, null), 2);
  perform t.eq('6 feb unchanged', (select amount_cents from public.commitments where recurring_rule_id = rule and due_date = '2027-02-28')::bigint, 9990::bigint);

  -- (7) Dívida com taxa desconhecida permanece NULL (nunca zero); principal não é despesa
  debt := public.create_debt(ws, 'Empréstimo', 'Banco X', 300000, null, null, null, 15);
  perform t.eq('7 rate unknown', (select monthly_rate from public.debts where id = debt), null::numeric);
  perform public.pay_debt(ws, debt, 20000, 3500, '2026-11-15', acc1, 'k10');
  s := public.financial_summary(ws, '2026-11-01', '2026-11-30');
  perform t.eq('7 only interest is expense', s->>'expense_cents', '88500');   -- 250 + 100 cartão + 500 aluguel parcial + 35 juros (principal 200 fica fora)
  perform t.eq('7 outstanding', (select outstanding_cents from public.debts where id = debt), 280000::bigint);

  -- valores inválidos
  perform t.throws('neg amount', format('select public.record_transaction(%L, %L, -5, %L, null, %L, %L, %L, null, %L)', ws, 'expense', 'x', acc1, '2026-11-01', '2026-11-01', 'k11'), 'invalid_amount');
  perform t.throws('float-free domain', format('select public.record_transaction(%L, %L, 0, %L, null, %L, %L, %L, null, %L)', ws, 'expense', 'x', acc1, '2026-11-01', '2026-11-01', 'k12'), 'invalid_amount');
  raise notice 'finance: all assertions passed';
end $$;
rollback;
