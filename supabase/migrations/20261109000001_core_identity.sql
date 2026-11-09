-- RUMO · 0001 · Identidade, espaços, membros e convites
-- Convenções:
--   * valores monetários em centavos inteiros (bigint); nunca float.
--   * instantes em timestamptz (UTC); datas de negócio em date.
--   * toda entidade de cliente tem workspace_id (ou owner inequívoco).
--   * funções privilegiadas ficam no schema "private", com search_path vazio.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.workspace_kind as enum ('personal', 'business');
create type public.member_role as enum ('owner', 'admin', 'collaborator', 'reader');

-- ---------------------------------------------------------------------------
-- Perfis
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text check (char_length(full_name) <= 120),
  timezone text not null default 'America/Sao_Paulo' check (char_length(timezone) <= 64),
  reduce_motion boolean not null default false,
  hide_values boolean not null default false,
  onboarding_state jsonb not null default '{}'::jsonb,
  is_platform_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Espaços
-- ---------------------------------------------------------------------------
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete restrict,
  kind public.workspace_kind not null,
  name text not null check (char_length(name) between 1 and 80),
  currency char(3) not null default 'BRL' check (currency = 'BRL'),
  timezone text not null default 'America/Sao_Paulo',
  -- espaços excedentes após downgrade ficam somente leitura (nunca apagados)
  read_only boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create index workspaces_owner_idx on public.workspaces (owner_id);

create table public.memberships (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null,
  invited_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id);
-- exatamente um owner por espaço
create unique index memberships_one_owner on public.memberships (workspace_id) where role = 'owner';

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role public.member_role not null check (role <> 'owner'),
  token_hash text not null unique,           -- sha256 do token; o token em claro só vai no e-mail
  invited_by uuid not null references auth.users (id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
-- um convite pendente por e-mail/espaço
create unique index invitations_pending_unique
  on public.invitations (workspace_id, lower(email))
  where accepted_at is null and revoked_at is null;

-- ---------------------------------------------------------------------------
-- Funções de autorização (sem recursão: security definer lê memberships direto)
-- ---------------------------------------------------------------------------
create or replace function private.role_rank(r public.member_role)
returns int language sql immutable set search_path = '' as $$
  select case r when 'owner' then 4 when 'admin' then 3 when 'collaborator' then 2 else 1 end
$$;

create or replace function private.member_role_of(ws uuid)
returns public.member_role language sql stable security definer set search_path = '' as $$
  select m.role from public.memberships m
  where m.workspace_id = ws and m.user_id = auth.uid()
$$;

create or replace function private.has_role(ws uuid, min_role public.member_role)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.workspace_id = ws
      and m.user_id = auth.uid()
      and private.role_rank(m.role) >= private.role_rank(min_role)
  )
$$;

create or replace function private.is_member(ws uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_role(ws, 'reader')
$$;

-- Usado pelas funções de escrita: falha com erro explícito.
create or replace function private.require_role(ws uuid, min_role public.member_role)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not private.has_role(ws, min_role) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if private.role_rank(min_role) >= 2 and exists (
    select 1 from public.workspaces w where w.id = ws and (w.read_only or w.archived_at is not null)
  ) then
    raise exception 'workspace_read_only' using errcode = '42501';
  end if;
end $$;

grant execute on function private.role_rank(public.member_role) to authenticated;
grant execute on function private.member_role_of(uuid) to authenticated;
grant execute on function private.has_role(uuid, public.member_role) to authenticated;
grant execute on function private.is_member(uuid) to authenticated;
grant execute on function private.require_role(uuid, public.member_role) to authenticated;

-- ---------------------------------------------------------------------------
-- Auditoria
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  workspace_id uuid references public.workspaces (id) on delete set null,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  detail jsonb not null default '{}'::jsonb,   -- nunca descrições financeiras completas nem segredos
  created_at timestamptz not null default now()
);
create index audit_log_ws_idx on public.audit_log (workspace_id, created_at desc);

create or replace function private.audit(ws uuid, act text, ent text, ent_id text, det jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_log (workspace_id, actor_id, action, entity, entity_id, detail)
  values (ws, auth.uid(), act, ent, ent_id, coalesce(det, '{}'::jsonb))
$$;

-- ---------------------------------------------------------------------------
-- Novo usuário → perfil
-- ---------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), 120))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.audit_log enable row level security;

create policy profiles_select_self on public.profiles for select to authenticated
  using (id = auth.uid());
-- atualização só de campos de preferência; is_platform_admin protegido por privilégio de coluna
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy workspaces_select_member on public.workspaces for select to authenticated
  using (private.is_member(id));
create policy workspaces_update_owner on public.workspaces for update to authenticated
  using (private.has_role(id, 'owner'))
  with check (private.has_role(id, 'owner') and owner_id = auth.uid());

create policy memberships_select on public.memberships for select to authenticated
  using (user_id = auth.uid() or private.has_role(workspace_id, 'admin'));

create policy invitations_select_admin on public.invitations for select to authenticated
  using (private.has_role(workspace_id, 'admin'));

create policy audit_select_admin on public.audit_log for select to authenticated
  using (workspace_id is not null and private.has_role(workspace_id, 'admin'));

-- Privilégios de tabela: o cliente nunca grava diretamente em membros/convites/espaços
revoke all on public.profiles, public.workspaces, public.memberships, public.invitations, public.audit_log from anon, authenticated;
grant select on public.profiles, public.workspaces, public.memberships, public.invitations, public.audit_log to authenticated;
grant update (full_name, timezone, reduce_motion, hide_values, onboarding_state, updated_at) on public.profiles to authenticated;
grant update (name, timezone) on public.workspaces to authenticated;
