-- RUMO · 0007 · Funções das tarefas agendadas (executadas só pelo service_role via cron protegido)

-- Gera ocorrências de todas as regras ativas até p_until. Idempotente: unique(rule, occurrence_date).
create or replace function private.cron_generate_occurrences(p_until date)
returns int language plpgsql security definer set search_path = '' as $$
declare
  r record;
  step interval;
  d date;
  i int;
  n int;
  total int := 0;
begin
  for r in select * from public.recurring_rules where active loop
    step := case r.frequency when 'weekly' then interval '1 week' when 'monthly' then interval '1 month' else interval '1 year' end;
    i := 0;
    loop
      d := (r.start_date + step * i)::date;
      exit when d > p_until or (r.end_date is not null and d > r.end_date) or i > 520;
      insert into public.commitments (workspace_id, direction, description, category_id, amount_cents, due_date,
        competence_date, recurring_rule_id, occurrence_date, idempotency_key, created_by)
      values (r.workspace_id, r.direction, r.description, r.category_id, r.amount_cents, d, d, r.id, d,
        'rule:' || r.id::text || ':' || d::text, (select owner_id from public.workspaces where id = r.workspace_id))
      on conflict do nothing;
      get diagnostics n = row_count;
      total := total + n;
      i := i + 1;
    end loop;
  end loop;
  return total;
end $$;

-- Lembretes de vencimento: usa compromissos ATUALIZADOS (não avisa o que já foi pago), data de negócio
-- no fuso de cada espaço, preferências por usuário, e dedupe por compromisso+data+usuário.
create or replace function private.cron_due_reminders(p_now timestamptz default now())
returns int language plpgsql security definer set search_path = '' as $$
declare
  n int := 0;
  c record;
begin
  for c in
    select cm.id, cm.description, cm.due_date, cm.direction, w.id as ws, w.name as ws_name, m.user_id, u.email,
           (cm.amount_cents - private.commitment_settled(cm.id)) as pending,
           coalesce(np.in_app, true) as in_app, coalesce(np.email, true) as by_email, coalesce(np.include_amounts, false) as amounts
    from public.commitments cm
    join public.workspaces w on w.id = cm.workspace_id
    join public.memberships m on m.workspace_id = w.id and m.role in ('owner', 'admin')
    join auth.users u on u.id = m.user_id
    left join public.notification_preferences np on np.user_id = m.user_id and np.kind = 'due_reminder'
    where cm.cancelled_at is null
      and cm.due_date = ((p_now at time zone w.timezone)::date + 1)
      and cm.amount_cents > private.commitment_settled(cm.id)
  loop
    if c.in_app then
      insert into public.notifications (user_id, workspace_id, kind, title, body, link, dedupe_key)
      values (c.user_id, c.ws, 'due_reminder', 'Vence amanhã: ' || left(c.description, 80),
        c.ws_name || ' · ' || case c.direction when 'payable' then 'a pagar' else 'a receber' end, '/app/planejamento',
        'due:' || c.id || ':' || c.due_date || ':' || c.user_id)
      on conflict (dedupe_key) do nothing;
      get diagnostics n = row_count;
    end if;
    if c.by_email and c.email is not null then
      insert into public.outbox (kind, dedupe_key, payload)
      values ('email', 'email:due:' || c.id || ':' || c.due_date || ':' || c.user_id,
        jsonb_build_object('to', c.email, 'template', 'due_reminder', 'title', 'Vence amanhã: ' || left(c.description, 80),
          'body', c.ws_name || ' · ' || case c.direction when 'payable' then 'conta a pagar' else 'valor a receber' end ||
            case when c.amounts then ' · pendente: ' || (c.pending / 100)::text || ',' || lpad((c.pending % 100)::text, 2, '0') || ' reais' else '' end,
          'commitment_id', c.id, 'due_date', c.due_date))
      on conflict (dedupe_key) do nothing;
    end if;
  end loop;
  return n;
end $$;

-- No envio, o worker reconfere se o compromisso continua pendente (pode ter sido pago entre agendar e enviar)
create or replace function private.cron_commitment_still_due(p_commitment uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.commitments c where c.id = p_commitment and c.cancelled_at is null
    and c.amount_cents > private.commitment_settled(c.id))
$$;

create or replace function private.cron_housekeeping()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  released int;
  expired int;
  rl int;
begin
  released := private.release_stale_reservations(interval '15 minutes');
  update public.report_jobs set status = 'expired' where status = 'done' and expires_at < now();
  get diagnostics expired = row_count;
  delete from private.rate_limits where window_start < now() - interval '1 day';
  get diagnostics rl = row_count;
  -- falhas persistentes ficam visíveis (status failed) no painel administrativo
  update public.report_jobs set status = 'failed', error = 'max_attempts' where status in ('queued', 'running') and attempts >= 3 and coalesce(lease_until, now()) < now();
  return jsonb_build_object('released_reservations', released, 'expired_reports', expired, 'rate_limit_rows', rl);
end $$;

revoke execute on function private.cron_generate_occurrences(date) from public;
revoke execute on function private.cron_due_reminders(timestamptz) from public;
revoke execute on function private.cron_commitment_still_due(uuid) from public;
revoke execute on function private.cron_housekeeping() from public;
grant execute on function private.cron_generate_occurrences(date) to service_role;
grant execute on function private.cron_due_reminders(timestamptz) to service_role;
grant execute on function private.cron_commitment_still_due(uuid) to service_role;
grant execute on function private.cron_housekeeping() to service_role;
