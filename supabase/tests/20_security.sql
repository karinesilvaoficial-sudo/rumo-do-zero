begin;
\i supabase/tests/_helpers.inc
-- concede plano Max à Ana (como service_role/admin de teste) para permitir 2 espaços e convidados
insert into public.access_periods (user_id, plan_code, source, source_ref, starts_at, ends_at)
values ('00000000-0000-0000-0000-00000000000a', 'max', 'admin_grant', 'test-grant-a', now() - interval '1 day', now() + interval '30 days');
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
select t.login('00000000-0000-0000-0000-00000000000a');
do $$
declare ws_p uuid; ws_b uuid; acc uuid;
begin
  ws_p := public.create_workspace('personal', 'Pessoal Ana');
  ws_b := public.create_workspace('business', 'Loja Ana');
  acc := public.create_account(ws_p, 'Conta', 'checking', 1000, '2026-11-01');
  perform public.record_transaction(ws_p, 'expense', 500, 'Farmácia', null, acc, '2026-11-02', '2026-11-02', null, 's1');
  insert into ids values ('ws_p', ws_p), ('ws_b', ws_b), ('acc', acc);
  -- convida Bruno como leitor e Carla como colaboradora no NEGÓCIO
  perform public.create_invitation(ws_b, 'bruno@exemplo.test', 'reader', 'hash-bruno');
  perform public.create_invitation(ws_b, 'carla@exemplo.test', 'collaborator', 'hash-carla');
  perform public.create_invitation(ws_b, 'davi@exemplo.test', 'reader', 'hash-davi');
end $$;

-- (11) convite com destinatário errado / e-mail não confirmado / revogado não funciona
select t.login('00000000-0000-0000-0000-00000000000c');
select t.throws('11 wrong recipient', $$select public.accept_invitation('hash-bruno')$$, 'invitation_wrong_recipient');
select t.login('00000000-0000-0000-0000-00000000000d');
select t.throws('11 unconfirmed email', $$select public.accept_invitation('hash-davi')$$, 'invitation_wrong_recipient');
select t.login('00000000-0000-0000-0000-00000000000b');
select public.accept_invitation('hash-bruno');
select t.throws('11 reuse token', $$select public.accept_invitation('hash-bruno')$$, 'invitation_invalid');
select t.login('00000000-0000-0000-0000-00000000000c');
select public.accept_invitation('hash-carla');

-- (10) membro do negócio não vê o espaço pessoal da proprietária
select t.login('00000000-0000-0000-0000-00000000000b');
select t.eq('10 sees only business', (select array_agg(name) from public.workspaces), array['Loja Ana']);
select t.eq('10 no personal tx', (select count(*) from public.transactions), 0::bigint);
-- (9) trocar IDs no payload não dá acesso
select t.throws('9 rpc other ws', format('select public.financial_summary(%L, %L, %L)', (select v from ids where k='ws_p'), '2026-11-01', '2026-11-30'), 'forbidden');
select t.throws('9 write other ws', format('select public.record_transaction(%L, %L, 100, %L, null, %L, %L, %L, null, %L)',
  (select v from ids where k='ws_p'), 'income', 'x', (select v from ids where k='acc'), '2026-11-01', '2026-11-01', 'evil'), 'forbidden');
-- (11) leitor não grava
select t.throws('11 reader cannot write', format('select public.create_goal(%L, %L, 1000, null)', (select v from ids where k='ws_b'), 'x'), 'forbidden');
-- (13) cliente não grava direto em tabelas, nem troca plano/papel/proprietário
select t.throws('13 direct insert tx', format('insert into public.transactions (workspace_id, kind, amount_cents, description, competence_date, idempotency_key, created_by) values (%L, %L, 1, %L, now(), %L, auth.uid())', (select v from ids where k='ws_b'), 'card_purchase', 'x', 'z'), 'permission denied');
select t.throws('13 grant self plan', $$insert into public.access_periods (user_id, plan_code, source, source_ref, starts_at, ends_at) values (auth.uid(), 'unlimited', 'admin_grant', 'x', now(), now() + interval '1 year')$$, 'permission denied');
select t.throws('13 self promote', format('update public.memberships set role = %L where workspace_id = %L', 'owner', (select v from ids where k='ws_b')), 'permission denied');
select t.throws('13 platform admin flag', $$update public.profiles set is_platform_admin = true where id = auth.uid()$$, 'permission denied');
select t.throws('13 usage ledger', $$delete from public.usage_ledger$$, 'permission denied');

-- (11) colaboradora grava no negócio, mas não administra membros nem cobrança
select t.login('00000000-0000-0000-0000-00000000000c');
select t.throws('11 collab cannot invite', format('select public.create_invitation(%L, %L, %L, %L)', (select v from ids where k='ws_b'), 'x@y.test', 'reader', 'h'), 'forbidden');
select t.throws('11 collab cannot remove', format('select public.remove_member(%L, %L)', (select v from ids where k='ws_b'), '00000000-0000-0000-0000-00000000000b'), 'forbidden');
select t.throws('11 collab cannot create account', format('select public.create_account(%L, %L, null, 0, %L)', (select v from ids where k='ws_b'), 'x', '2026-11-01'), 'forbidden');
select t.throws('cross-ws account', format('select public.record_transaction(%L, %L, 100, %L, null, %L, %L, %L, null, %L)',
  (select v from ids where k='ws_b'), 'income', 'x', (select v from ids where k='acc'), '2026-11-01', '2026-11-01', 'cross'), 'account_not_found');

-- (12) remover membro invalida as próximas consultas e operações
select t.login('00000000-0000-0000-0000-00000000000a');
select public.remove_member((select v from ids where k='ws_b'), '00000000-0000-0000-0000-00000000000c');
select public.revoke_invitation((select v from ids where k='ws_b'), (select id from public.invitations where token_hash = 'hash-davi'));
select t.login('00000000-0000-0000-0000-00000000000c');
select t.eq('12 removed sees nothing', (select count(*) from public.workspaces), 0::bigint);
select t.throws('12 removed cannot write', format('select public.create_goal(%L, %L, 1000, null)', (select v from ids where k='ws_b'), 'x'), 'forbidden');
select t.logout();
update auth.users set email_confirmed_at = now() where id = '00000000-0000-0000-0000-00000000000d';
select t.login('00000000-0000-0000-0000-00000000000d');
select t.throws('11 revoked invitation', $$select public.accept_invitation('hash-davi')$$, 'invitation_invalid');

-- (13) proprietária não pode trocar owner_id do espaço
select t.login('00000000-0000-0000-0000-00000000000a');
select t.throws('13 owner_id immutable', format('update public.workspaces set owner_id = %L where id = %L', '00000000-0000-0000-0000-00000000000b', (select v from ids where k='ws_b')), 'permission denied');

-- (9/21) storage: áudio pessoal só do próprio usuário; espaço alheio negado
select t.logout();
insert into storage.objects (bucket_id, name) values
  ('private-files', (select v from ids where k='ws_b')::text || '/audio/00000000-0000-0000-0000-00000000000a/x.mp3'),
  ('private-files', (select v from ids where k='ws_b')::text || '/documents/proposta.pdf'),
  ('private-files', (select v from ids where k='ws_p')::text || '/documents/pessoal.pdf');
select t.login('00000000-0000-0000-0000-00000000000b');
select t.eq('21 storage visibility', (select array_agg(name order by name) from storage.objects),
  array[(select v from ids where k='ws_b')::text || '/documents/proposta.pdf']);

-- tabelas sem RLS no schema public: nenhuma
select t.logout();
select t.eq('rls everywhere', (select count(*) from pg_tables where schemaname = 'public' and not rowsecurity), 0::bigint);
-- funções privilegiadas com search_path fixo
select t.eq('definer search_path', (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('private','public') and p.prosecdef and not coalesce(p.proconfig::text like '%search_path=%', false)), 0::bigint);
-- anon não executa RPCs
select t.eq('anon no rpc', (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute') and p.proname not like 'gen_%'), 0::bigint);
select 'security: all assertions passed' as result;
rollback;
