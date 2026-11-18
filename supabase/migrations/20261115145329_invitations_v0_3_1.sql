create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null check (email ~ '^\S+@\S+\.\S+$'),
  role public.member_role not null default 'sales' check (role <> 'owner'),
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, email)
);
create index on public.invitations (email);

create or replace function public.invitations_before_insert()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  new.email := lower(trim(new.email));
  if exists (
    select 1 from public.organization_members m
    join auth.users u on u.id = m.user_id
    where m.organization_id = new.organization_id and lower(u.email) = new.email
  ) then
    raise exception 'Cette personne fait déjà partie de l''organisation.';
  end if;
  return new;
end $$;

create trigger invitations_normalize
  before insert on public.invitations
  for each row execute function public.invitations_before_insert();

alter table public.invitations enable row level security;
revoke all on public.invitations from anon;

create policy "owners/admins read invitations" on public.invitations
  for select to authenticated
  using (public.has_org_role(organization_id, array['owner','admin']::public.member_role[]));
create policy "owners/admins create invitations" on public.invitations
  for insert to authenticated
  with check (
    public.has_org_role(organization_id, array['owner','admin']::public.member_role[])
    and invited_by = (select auth.uid())
  );
create policy "owners/admins delete invitations" on public.invitations
  for delete to authenticated
  using (public.has_org_role(organization_id, array['owner','admin']::public.member_role[]));

create or replace function public.accept_invitations()
returns integer language plpgsql security definer set search_path = public
as $$
declare
  v_email text;
  v_count integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select lower(u.email) into v_email
  from auth.users u
  where u.id = auth.uid() and u.email_confirmed_at is not null;
  if v_email is null then return 0; end if;

  insert into public.profiles (id) values (auth.uid()) on conflict (id) do nothing;

  with taken as (
    delete from public.invitations i
    where lower(i.email) = v_email
    returning i.organization_id, i.role
  ), ins as (
    insert into public.organization_members (organization_id, user_id, role)
    select t.organization_id, auth.uid(), t.role from taken t
    on conflict (organization_id, user_id) do nothing
    returning 1
  )
  select count(*) into v_count from ins;

  return v_count;
end $$;

revoke all on function public.accept_invitations() from public, anon;
grant execute on function public.accept_invitations() to authenticated;
revoke all on function public.invitations_before_insert() from public, anon;