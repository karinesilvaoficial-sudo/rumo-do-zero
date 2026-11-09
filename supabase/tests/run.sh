#!/usr/bin/env bash
# Sobe um Postgres efêmero, aplica stub + migrações e executa os testes SQL.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)}"
DATA="$ROOT/.tmp/pgdata"; PORT="${PGPORT_TEST:-54329}"
rm -rf "$DATA"; mkdir -p "$DATA"
if [ "$(id -u)" = "0" ]; then RUN="runuser -u postgres --"; chown -R postgres "$ROOT/.tmp"; else RUN=""; fi
$RUN "$PGBIN/initdb" -D "$DATA" -A trust -U postgres >/dev/null
$RUN "$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k /tmp" -l "$DATA/log" start -w >/dev/null
trap '$RUN "$PGBIN/pg_ctl" -D "$DATA" stop -m fast >/dev/null' EXIT
PSQL="psql -h /tmp -p $PORT -U postgres -d postgres -v ON_ERROR_STOP=1 -q"
$PSQL -f "$ROOT/supabase/tests/00_supabase_stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do echo "migrate $(basename "$f")"; $PSQL -f "$f"; done
fail=0
cd "$ROOT"
for t in "$ROOT"/supabase/tests/[1-9]*.sql; do
  if out=$($PSQL -f "$t" 2>&1); then echo "PASS $(basename "$t")"; [ -n "$out" ] && echo "$out" | sed 's/^/   /';
  else echo "FAIL $(basename "$t")"; echo "$out" | sed 's/^/   /'; fail=1; fi
done
for t in "$ROOT"/supabase/tests/9*.sh; do
  if out=$(PGPORT_TEST=$PORT bash "$t" 2>&1); then echo "PASS $(basename "$t")"; echo "$out" | sed 's/^/   /';
  else echo "FAIL $(basename "$t")"; echo "$out" | sed 's/^/   /'; fail=1; fi
done
exit $fail
