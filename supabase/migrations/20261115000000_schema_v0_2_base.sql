-- =====================================================================
-- VALTIQ — schéma multi-organisation v0.2
-- À appliquer dans un projet Supabase NEUF (PostgreSQL 15+ requis pour
-- "on delete set null (colonne)"). Remplace schema.sql (v0.1).
--
-- Corrections par rapport à la v0.1 :
--  1. Références inter-tables verrouillées par organisation (FK composites)
--  2. Un admin ne peut plus créer / modifier / retirer un owner ;
--     il reste toujours au moins un owner par organisation
--  3. Règles d'automatisation et étapes du pipeline : écriture owner/admin
--  4. automation_runs : écrit uniquement par le serveur (service_role)
--  5. activities : actor_id = utilisateur connecté, journal non modifiable
--  6. Profil créé automatiquement à l'inscription (trigger sur auth.users)
--  7. Droits de modification de l'organisation et de son propre profil
--  8. updated_at automatique sur opportunities
--  9. Index sur organization_id et les clés étrangères
-- 10. Fonctions non exécutables par anon ; anon sans accès aux tables
-- 11. Étape « Perdu » créée ; règles d'automatisation désactivées par
--     défaut tant que le moteur serveur n'existe pas
--
-- STATUT : relu mais NON exécuté ni testé. Lancer rls_tests.sql avant tout usage.
-- =====================================================================

create extension if not exists pgcrypto;

create type public.member_role   as enum ('owner','admin','sales');
create type public.lead_status   as enum ('new','contacted','qualified','customer','lost');
create type public.task_status   as enum ('todo','doing','done');
create type public.task_priority as enum ('low','normal','high');

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.member_role not null default 'sales',
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  sector text,
  website text,
  email text,
  phone text,
  address text,
  owner_id uuid,
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (organization_id, owner_id)
    references public.organization_members (organization_id, user_id)
    on delete set null (owner_id)
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid,
  first_name text not null check (char_length(trim(first_name)) > 0),
  last_name  text not null check (char_length(trim(last_name)) > 0),
  email text,
  phone text,
  source text,
  status public.lead_status not null default 'new',
  owner_id uuid,
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (company_id, organization_id)
    references public.companies (id, organization_id)
    on delete set null (company_id),
  foreign key (organization_id, owner_id)
    references public.organization_members (organization_id, user_id)
    on delete set null (owner_id)
);

create table public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  position integer not null,
  probability integer not null default 0 check (probability between 0 and 100),
  unique (id, organization_id),
  -- différé pour pouvoir permuter deux positions dans une même transaction
  unique (organization_id, position) deferrable initially deferred
);

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  company_id uuid,
  contact_id uuid,
  stage_id uuid,
  amount numeric(12,2) not null default 0 check (amount >= 0),
  owner_id uuid,
  closed_at timestamptz,
  lost_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (company_id, organization_id)
    references public.companies (id, organization_id) on delete set null (company_id),
  foreign key (contact_id, organization_id)
    references public.contacts (id, organization_id) on delete set null (contact_id),
  foreign key (stage_id, organization_id)
    references public.pipeline_stages (id, organization_id) on delete set null (stage_id),
  foreign key (organization_id, owner_id)
    references public.organization_members (organization_id, user_id)
    on delete set null (owner_id)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  description text,
  due_at timestamptz,
  status public.task_status not null default 'todo',
  priority public.task_priority not null default 'normal',
  owner_id uuid,
  contact_id uuid,
  opportunity_id uuid,
  created_at timestamptz not null default now(),
  foreign key (contact_id, organization_id)
    references public.contacts (id, organization_id) on delete cascade,
  foreign key (opportunity_id, organization_id)
    references public.opportunities (id, organization_id) on delete cascade,
  foreign key (organization_id, owner_id)
    references public.organization_members (organization_id, user_id)
    on delete set null (owner_id)
);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  type text not null check (type in ('call','email','meeting','demo','note','stage_change')),
  body text not null,
  actor_id uuid,
  contact_id uuid,
  opportunity_id uuid,
  created_at timestamptz not null default now(),
  foreign key (contact_id, organization_id)
    references public.contacts (id, organization_id) on delete cascade,
  foreign key (opportunity_id, organization_id)
    references public.opportunities (id, organization_id) on delete cascade,
  foreign key (organization_id, actor_id)
    references public.organization_members (organization_id, user_id)
    on delete set null (actor_id)
);

create table public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  unique (id, organization_id),
  unique (organization_id, code)
);

create table public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  rule_id uuid,
  event_key text not null,
  status text not null check (status in ('success','failed','skipped')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, event_key),
  foreign key (rule_id, organization_id)
    references public.automation_rules (id, organization_id) on delete set null (rule_id)
);

-- ---------------------------------------------------------------------
-- Index (RLS filtre sur organization_id à chaque requête)
-- ---------------------------------------------------------------------
create index on public.organization_members (user_id);
create index on public.companies (organization_id);
create index on public.contacts (organization_id);
create index on public.contacts (organization_id, company_id);
create index on public.pipeline_stages (organization_id);
create index on public.opportunities (organization_id, stage_id);
create index on public.opportunities (organization_id, updated_at);
create index on public.opportunities (company_id);
create index on public.opportunities (contact_id);
create index on public.tasks (organization_id, status, due_at);
create index on public.tasks (contact_id);
create index on public.tasks (opportunity_id);
create index on public.activities (organization_id, created_at desc);
create index on public.activities (contact_id);
create index on public.activities (opportunity_id);
create index on public.automation_runs (organization_id, created_at desc);

-- ---------------------------------------------------------------------
-- Fonctions utilitaires
-- ---------------------------------------------------------------------
create or replace function public.is_org_member(org_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (
  select 1 from public.organization_members m
  where m.organization_id = org_id and m.user_id = (select auth.uid())
) $$;

create or replace function public.has_org_role(org_id uuid, allowed public.member_role[])
returns boolean language sql stable security definer set search_path = public
as $$ select exists (
  select 1 from public.organization_members m
  where m.organization_id = org_id and m.user_id = (select auth.uid())
    and m.role = any (allowed)
) $$;

-- updated_at automatique
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public
as $$ begin new.updated_at = now(); return new; end $$;

create trigger opportunities_set_updated_at
  before update on public.opportunities
  for each row execute function public.set_updated_at();

-- Profil créé automatiquement à l'inscription
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Il doit toujours rester au moins un owner dans une organisation
create or replace function public.protect_last_owner()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     -- pendant la suppression en cascade d'une organisation, celle-ci n'existe déjà plus
     and exists (select 1 from public.organizations o where o.id = old.organization_id)
     and not exists (
       select 1 from public.organization_members m
       where m.organization_id = old.organization_id
         and m.role = 'owner' and m.id <> old.id
     )
  then
    raise exception 'Une organisation doit toujours conserver au moins un propriétaire (owner).';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create trigger organization_members_protect_last_owner
  before update or delete on public.organization_members
  for each row execute function public.protect_last_owner();

-- ---------------------------------------------------------------------
-- Droits de base : anon n'a accès à rien
-- ---------------------------------------------------------------------
revoke all on all tables    in schema public from anon;
revoke all on all functions in schema public from anon, public;
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on functions from anon, public;

grant execute on function public.is_org_member(uuid)                         to authenticated;
grant execute on function public.has_org_role(uuid, public.member_role[])    to authenticated;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.organizations        enable row level security;
alter table public.profiles             enable row level security;
alter table public.organization_members enable row level security;
alter table public.companies            enable row level security;
alter table public.contacts             enable row level security;
alter table public.pipeline_stages      enable row level security;
alter table public.opportunities        enable row level security;
alter table public.tasks                enable row level security;
alter table public.activities           enable row level security;
alter table public.automation_rules     enable row level security;
alter table public.automation_runs      enable row level security;

-- organizations
create policy "members read organization" on public.organizations
  for select to authenticated using (public.is_org_member(id));
create policy "owners/admins update organization" on public.organizations
  for update to authenticated
  using (public.has_org_role(id, array['owner','admin']::public.member_role[]))
  with check (public.has_org_role(id, array['owner','admin']::public.member_role[]));
create policy "owners delete organization" on public.organizations
  for delete to authenticated
  using (public.has_org_role(id, array['owner']::public.member_role[]));
-- (la création passe uniquement par create_organization())

-- profiles
create policy "read own and teammates profiles" on public.profiles
  for select to authenticated using (
    id = (select auth.uid())
    or exists (
      select 1
      from public.organization_members mine
      join public.organization_members theirs using (organization_id)
      where mine.user_id = (select auth.uid()) and theirs.user_id = profiles.id
    )
  );
create policy "update own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- organization_members
create policy "members read memberships" on public.organization_members
  for select to authenticated using (public.is_org_member(organization_id));

-- owner : tout ; admin : tout sauf toucher au rôle owner
create policy "owners/admins add members" on public.organization_members
  for insert to authenticated with check (
    public.has_org_role(organization_id, array['owner']::public.member_role[])
    or (public.has_org_role(organization_id, array['admin']::public.member_role[]) and role <> 'owner')
  );
create policy "owners/admins change members" on public.organization_members
  for update to authenticated
  using (
    public.has_org_role(organization_id, array['owner']::public.member_role[])
    or (public.has_org_role(organization_id, array['admin']::public.member_role[]) and role <> 'owner')
  )
  with check (
    public.has_org_role(organization_id, array['owner']::public.member_role[])
    or (public.has_org_role(organization_id, array['admin']::public.member_role[]) and role <> 'owner')
  );
create policy "owners/admins remove members, anyone can leave" on public.organization_members
  for delete to authenticated using (
    user_id = (select auth.uid())
    or public.has_org_role(organization_id, array['owner']::public.member_role[])
    or (public.has_org_role(organization_id, array['admin']::public.member_role[]) and role <> 'owner')
  );

-- Données métier : tout membre lit/écrit, seuls owner/admin suppriment
do $$
declare t text;
begin
  foreach t in array array['companies','contacts','opportunities','tasks'] loop
    execute format('create policy "members read %1$s" on public.%1$I for select to authenticated using (public.is_org_member(organization_id))', t);
    execute format('create policy "members insert %1$s" on public.%1$I for insert to authenticated with check (public.is_org_member(organization_id))', t);
    execute format('create policy "members update %1$s" on public.%1$I for update to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id))', t);
    execute format('create policy "admins delete %1$s" on public.%1$I for delete to authenticated using (public.has_org_role(organization_id, array[''owner'',''admin'']::public.member_role[]))', t);
  end loop;

  -- Configuration : lecture membre, écriture owner/admin
  foreach t in array array['pipeline_stages','automation_rules'] loop
    execute format('create policy "members read %1$s" on public.%1$I for select to authenticated using (public.is_org_member(organization_id))', t);
    execute format('create policy "admins insert %1$s" on public.%1$I for insert to authenticated with check (public.has_org_role(organization_id, array[''owner'',''admin'']::public.member_role[]))', t);
    execute format('create policy "admins update %1$s" on public.%1$I for update to authenticated using (public.has_org_role(organization_id, array[''owner'',''admin'']::public.member_role[])) with check (public.has_org_role(organization_id, array[''owner'',''admin'']::public.member_role[]))', t);
    execute format('create policy "admins delete %1$s" on public.%1$I for delete to authenticated using (public.has_org_role(organization_id, array[''owner'',''admin'']::public.member_role[]))', t);
  end loop;
end $$;

-- activities : journal, non modifiable ; l'auteur est forcément l'utilisateur connecté
create policy "members read activities" on public.activities
  for select to authenticated using (public.is_org_member(organization_id));
create policy "members log own activities" on public.activities
  for insert to authenticated with check (
    public.is_org_member(organization_id) and actor_id = (select auth.uid())
  );
create policy "admins delete activities" on public.activities
  for delete to authenticated
  using (public.has_org_role(organization_id, array['owner','admin']::public.member_role[]));

-- automation_runs : lecture seule côté client (écriture par service_role côté serveur)
create policy "members read automation_runs" on public.automation_runs
  for select to authenticated using (public.is_org_member(organization_id));

-- ---------------------------------------------------------------------
-- Création d'organisation
-- ---------------------------------------------------------------------
create or replace function public.create_organization(org_name text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare new_org uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if org_name is null or char_length(trim(org_name)) = 0 or char_length(trim(org_name)) > 120 then
    raise exception 'Nom d''organisation invalide';
  end if;

  insert into public.profiles (id) values (auth.uid()) on conflict (id) do nothing;
  insert into public.organizations (name) values (trim(org_name)) returning id into new_org;
  insert into public.organization_members (organization_id, user_id, role)
    values (new_org, auth.uid(), 'owner');

  insert into public.pipeline_stages (organization_id, name, position, probability) values
    (new_org, 'Nouveau',     1,  10), (new_org, 'Contacté',    2,  20),
    (new_org, 'Démo',        3,  40), (new_org, 'Proposition', 4,  60),
    (new_org, 'Négociation', 5,  80), (new_org, 'Gagné',       6, 100),
    (new_org, 'Perdu',       7,   0);

  -- Désactivées tant que le moteur d'automatisation serveur n'existe pas
  insert into public.automation_rules (organization_id, code, name, enabled) values
    (new_org, 'NEW_CONTACT_TASK', 'Créer une tâche de premier contact', false),
    (new_org, 'STALE_DEAL_ALERT', 'Signaler une opportunité inactive',  false);

  return new_org;
end $$;

revoke all on function public.create_organization(text) from public, anon;
grant execute on function public.create_organization(text) to authenticated;
