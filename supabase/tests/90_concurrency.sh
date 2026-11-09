#!/usr/bin/env bash
# (18/6) Concorrência real: 12 sessões simultâneas disputam 3 créditos de IA do Free
# e 12 sessões geram a mesma recorrência. Esperado: exatamente 3 reservas; ocorrências únicas.
set -euo pipefail
PSQL="psql -h /tmp -p ${PGPORT_TEST:-54329} -U postgres -d postgres -qtA -v ON_ERROR_STOP=1"
U=00000000-0000-0000-0000-0000000000e1
$PSQL -c "insert into auth.users (id, email, email_confirmed_at) values ('$U', 'conc@exemplo.test', now())"
WS=$($PSQL -c "select set_config('request.jwt.claim.sub', '$U', false); set role authenticated; select public.create_workspace('personal', 'C');" | tail -1)
RULE=$($PSQL -c "select set_config('request.jwt.claim.sub', '$U', false); set role authenticated; select public.create_recurring_rule('$WS', 'payable', 'Luz', null, 100, 'monthly', '2027-01-05', null);" | tail -1)
for i in $(seq 1 12); do
  ( $PSQL -c "select set_config('request.jwt.claim.sub', '$U', false); set role authenticated; select public.reserve_usage('$WS', 'ai_credits', 1, 'c$i');" >/dev/null 2>&1 || true ) &
  ( $PSQL -c "select set_config('request.jwt.claim.sub', '$U', false); set role authenticated; select public.generate_occurrences('$WS', '$RULE', '2027-12-31');" >/dev/null 2>&1 || true ) &
done
wait
N=$($PSQL -c "select count(*) from public.usage_ledger where workspace_id = '$WS'")
O=$($PSQL -c "select count(*) || '/' || count(distinct occurrence_date) from public.commitments where recurring_rule_id = '$RULE'")
[ "$N" = "3" ] || { echo "reservas concorrentes: $N (esperado 3)"; exit 1; }
[ "$O" = "12/12" ] || { echo "ocorrências: $O (esperado 12/12)"; exit 1; }
echo "concurrency: 12 sessões → $N reservas; ocorrências $O"
