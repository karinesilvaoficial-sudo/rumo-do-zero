#!/usr/bin/env bash
# A semente de planos no banco é idêntica à matriz canônica em packages/contracts/src/plans.json
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PSQL="psql -h /tmp -p ${PGPORT_TEST:-54329} -U postgres -d postgres -qtA"
DB=$($PSQL -c "select json_agg(json_build_array(code,name,rank,monthly_cents,annual_cents,max_workspaces,max_entries_month,max_active_goals,max_guests,ai_credits_month,tts_seconds_month,stt_seconds_month,storage_bytes) order by rank)::text from public.plans")
JS=$(python3 -I -c "
import json,sys
d=json.load(open(sys.argv[1]))
k=['code','name','rank','monthly_cents','annual_cents','max_workspaces','max_entries_month','max_active_goals','max_guests','ai_credits_month','tts_seconds_month','stt_seconds_month','storage_bytes']
print(json.dumps([[p[x] for x in k] for p in d['plans']]))" "$ROOT/packages/contracts/src/plans.json")
python3 -I -c "import json,sys; a=json.loads(sys.argv[1]); b=json.loads(sys.argv[2]); assert a==b, (a,b); assert all(p[4]==p[3]*10 for p in a); print('plans: DB == contracts/plans.json; anual = 10 × mensal')" "$DB" "$JS"
