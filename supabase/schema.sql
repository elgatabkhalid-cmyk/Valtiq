-- VALTIQ initial multi-tenant schema.
-- Apply in a NEW Supabase project using the SQL Editor.
create extension if not exists pgcrypto;

create type public.member_role as enum ('owner','admin','sales');
create type public.lead_status as enum ('new','contacted','qualified','customer','lost');
create type public.task_status as enum ('todo','doing','done');
create type public.task_priority as enum ('low','normal','high');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
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
  unique(organization_id,user_id)
);
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  sector text,
  website text,
  email text,
  phone text,
  address text,
  owner_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  source text,
  status public.lead_status not null default 'new',
  owner_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create table public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  position integer not null,
  probability integer not null default 0 check(probability between 0 and 100),
  unique(organization_id,position)
);
create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  company_id uuid references public.companies(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  stage_id uuid references public.pipeline_stages(id) on delete set null,
  amount numeric(12,2) not null default 0,
  owner_id uuid references public.profiles(id),
  closed_at timestamptz,
  lost_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  description text,
  due_at timestamptz,
  status public.task_status not null default 'todo',
  priority public.task_priority not null default 'normal',
  owner_id uuid references public.profiles(id),
  contact_id uuid references public.contacts(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  type text not null check(type in ('call','email','meeting','demo','note','stage_change')),
  body text not null,
  actor_id uuid references public.profiles(id),
  contact_id uuid references public.contacts(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  unique(organization_id,code)
);
create table public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  rule_id uuid references public.automation_rules(id) on delete set null,
  event_key text not null,
  status text not null check(status in ('success','failed','skipped')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(organization_id,event_key)
);

create or replace function public.is_org_member(org_id uuid)
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.organization_members m where m.organization_id=org_id and m.user_id=auth.uid()) $$;
create or replace function public.has_org_role(org_id uuid, allowed public.member_role[])
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.organization_members m where m.organization_id=org_id and m.user_id=auth.uid() and m.role=any(allowed)) $$;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.companies enable row level security;
alter table public.contacts enable row level security;
alter table public.pipeline_stages enable row level security;
alter table public.opportunities enable row level security;
alter table public.tasks enable row level security;
alter table public.activities enable row level security;
alter table public.automation_rules enable row level security;
alter table public.automation_runs enable row level security;

create policy "members can view own organizations" on public.organizations for select using (public.is_org_member(id));
create policy "members can view profiles in their organizations" on public.profiles for select using (
  id=auth.uid() or exists(select 1 from public.organization_members mine join public.organization_members theirs on mine.organization_id=theirs.organization_id where mine.user_id=auth.uid() and theirs.user_id=profiles.id)
);
create policy "members can view organization memberships" on public.organization_members for select using (public.is_org_member(organization_id));
create policy "admins manage memberships" on public.organization_members for all using (public.has_org_role(organization_id,array['owner','admin']::public.member_role[])) with check (public.has_org_role(organization_id,array['owner','admin']::public.member_role[]));

do $$ declare t text; begin
  foreach t in array array['companies','contacts','pipeline_stages','opportunities','tasks','activities','automation_rules','automation_runs'] loop
    execute format('create policy "org members read %1$s" on public.%1$I for select using (public.is_org_member(organization_id))',t);
    execute format('create policy "org members insert %1$s" on public.%1$I for insert with check (public.is_org_member(organization_id))',t);
    execute format('create policy "org members update %1$s" on public.%1$I for update using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id))',t);
    execute format('create policy "admins delete %1$s" on public.%1$I for delete using (public.has_org_role(organization_id,array[''owner'',''admin'']::public.member_role[]))',t);
  end loop;
end $$;

create or replace function public.create_organization(org_name text)
returns uuid language plpgsql security definer set search_path=public
as $$
declare new_org uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  insert into public.profiles(id) values(auth.uid()) on conflict(id) do nothing;
  insert into public.organizations(name) values(trim(org_name)) returning id into new_org;
  insert into public.organization_members(organization_id,user_id,role) values(new_org,auth.uid(),'owner');
  insert into public.pipeline_stages(organization_id,name,position,probability) values
    (new_org,'Nouveau',1,10),(new_org,'Contacté',2,20),(new_org,'Démo',3,40),
    (new_org,'Proposition',4,60),(new_org,'Négociation',5,80),(new_org,'Gagné',6,100);
  insert into public.automation_rules(organization_id,code,name,enabled) values
    (new_org,'NEW_CONTACT_TASK','Créer une tâche de premier contact',true),
    (new_org,'STALE_DEAL_ALERT','Signaler une opportunité inactive',true);
  return new_org;
end $$;
grant execute on function public.create_organization(text) to authenticated;
