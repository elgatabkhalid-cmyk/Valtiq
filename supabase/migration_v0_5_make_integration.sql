-- =====================================================================
-- VALTIQ — migration v0.5 : rendez-vous, factures, intégration Make, temps réel
-- À exécuter UNE SEULE FOIS (après migration_v0_4_automations.sql).
--
--  1. Table appointments  (rendez-vous, avec drapeau « urgent »)
--  2. Table invoices      (factures payées / à payer)
--  3. external_id sur contacts et opportunities (dédoublonnage des imports)
--  4. integration_tokens  : une clé d'intégration par organisation (stockée hachée)
--  5. make_ingest()       : point d'entrée appelé par Make (HTTP POST /rest/v1/rpc/make_ingest)
--     → chaque appel est authentifié par la clé de l'organisation, jamais par la clé secrète Supabase
--  6. Publication temps réel (supabase_realtime) pour l'affichage en direct
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Rendez-vous
-- ---------------------------------------------------------------------
create type public.appointment_status as enum ('scheduled','done','cancelled');

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  notes text,
  urgent boolean not null default false,
  status public.appointment_status not null default 'scheduled',
  contact_id uuid,
  owner_id uuid,
  source text,
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at),
  unique (organization_id, external_id),
  foreign key (contact_id, organization_id)
    references public.contacts (id, organization_id) on delete set null (contact_id),
  foreign key (organization_id, owner_id)
    references public.organization_members (organization_id, user_id) on delete set null (owner_id)
);
create index on public.appointments (organization_id, starts_at);
create index on public.appointments (contact_id);

create trigger appointments_set_updated_at
  before update on public.appointments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 2. Factures
-- ---------------------------------------------------------------------
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  number text,
  client_name text,
  company_id uuid,
  contact_id uuid,
  amount numeric(12,2) not null default 0 check (amount >= 0),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  issued_at date,
  due_at date,
  paid_at date,
  status text not null default 'unpaid' check (status in ('unpaid','paid')),
  notes text,
  source text,
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, external_id),
  foreign key (company_id, organization_id)
    references public.companies (id, organization_id) on delete set null (company_id),
  foreign key (contact_id, organization_id)
    references public.contacts (id, organization_id) on delete set null (contact_id)
);
create index on public.invoices (organization_id, status, due_at);
create index on public.invoices (organization_id, number);
create index on public.invoices (company_id);
create index on public.invoices (contact_id);

-- paid_at toujours cohérent avec le statut
create or replace function public.invoices_sync_paid()
returns trigger language plpgsql set search_path = public
as $$
begin
  if new.status = 'paid' and new.paid_at is null then new.paid_at := current_date; end if;
  if new.status = 'unpaid' then new.paid_at := null; end if;
  new.updated_at := now();
  return new;
end $$;

create trigger invoices_sync_paid
  before insert or update on public.invoices
  for each row execute function public.invoices_sync_paid();

-- ---------------------------------------------------------------------
-- 3. Identifiants externes (dédoublonnage des imports)
-- ---------------------------------------------------------------------
alter table public.contacts      add column if not exists external_id text;
alter table public.opportunities add column if not exists external_id text;
create unique index if not exists contacts_org_external_id      on public.contacts (organization_id, external_id);
create unique index if not exists opportunities_org_external_id on public.opportunities (organization_id, external_id);
create index if not exists contacts_org_email on public.contacts (organization_id, lower(email));
create index if not exists companies_org_name on public.companies (organization_id, lower(name));

-- ---------------------------------------------------------------------
-- RLS des nouvelles tables : tout membre lit/écrit, owner/admin suppriment
-- ---------------------------------------------------------------------
alter table public.appointments enable row level security;
alter table public.invoices     enable row level security;

do $$
declare t text;
begin
  foreach t in array array['appointments','invoices'] loop
    execute format('create policy "members read %1$s" on public.%1$I for select to authenticated using (public.is_org_member(organization_id))', t);
    execute format('create policy "members insert %1$s" on public.%1$I for insert to authenticated with check (public.is_org_member(organization_id))', t);
    execute format('create policy "members update %1$s" on public.%1$I for update to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id))', t);
    execute format('create policy "admins delete %1$s" on public.%1$I for delete to authenticated using (public.has_org_role(organization_id, array[''owner'',''admin'']::public.member_role[]))', t);
  end loop;
end $$;

revoke all on public.appointments, public.invoices from anon;
grant select, insert, update, delete on public.appointments, public.invoices to authenticated;

-- ---------------------------------------------------------------------
-- 4. Clés d'intégration (une par organisation, stockée sous forme de hash SHA-256)
-- ---------------------------------------------------------------------
create table public.integration_tokens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  token_hash text not null unique,
  token_hint text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.integration_tokens enable row level security;
-- aucune policy : la table n'est accessible qu'au travers des fonctions ci-dessous
revoke all on public.integration_tokens from anon, authenticated;

create or replace function public._hash_token(p_token text)
returns text language sql immutable set search_path = public
as $$ select encode(extensions.digest(p_token, 'sha256'), 'hex') $$;
revoke all on function public._hash_token(text) from public, anon, authenticated;

-- Crée (ou remplace) la clé de l'organisation. La clé en clair n'est renvoyée qu'une seule fois.
create or replace function public.create_integration_token(p_org uuid)
returns text language plpgsql security definer set search_path = public
as $$
declare v_token text;
begin
  if not public.has_org_role(p_org, array['owner','admin']::public.member_role[]) then
    raise exception 'Action réservée aux propriétaires et administrateurs.' using errcode = '42501';
  end if;
  v_token := 'vq_' || encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.integration_tokens (organization_id, token_hash, token_hint, created_by)
  values (p_org, public._hash_token(v_token), right(v_token, 4), auth.uid())
  on conflict (organization_id) do update
    set token_hash = excluded.token_hash, token_hint = excluded.token_hint,
        created_by = excluded.created_by, created_at = now(), last_used_at = null;
  return v_token;
end $$;

create or replace function public.integration_token_info(p_org uuid)
returns table (token_hint text, created_at timestamptz, last_used_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select t.token_hint, t.created_at, t.last_used_at
  from public.integration_tokens t
  where t.organization_id = p_org
    and public.has_org_role(p_org, array['owner','admin']::public.member_role[])
$$;

create or replace function public.revoke_integration_token(p_org uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.has_org_role(p_org, array['owner','admin']::public.member_role[]) then
    raise exception 'Action réservée aux propriétaires et administrateurs.' using errcode = '42501';
  end if;
  delete from public.integration_tokens where organization_id = p_org;
end $$;

revoke all on function public.create_integration_token(uuid) from public, anon;
revoke all on function public.integration_token_info(uuid)   from public, anon;
revoke all on function public.revoke_integration_token(uuid) from public, anon;
grant execute on function public.create_integration_token(uuid) to authenticated;
grant execute on function public.integration_token_info(uuid)   to authenticated;
grant execute on function public.revoke_integration_token(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Point d'entrée Make
-- ---------------------------------------------------------------------
-- Lecture tolérante des champs envoyés par Make
create or replace function public._mk_text(p jsonb, k text)
returns text language sql immutable set search_path = public
as $$ select nullif(trim(p ->> k), '') $$;

create or replace function public._mk_ts(p jsonb, k text)
returns timestamptz language plpgsql stable set search_path = public
as $$
declare v text := nullif(trim(p ->> k), '');
begin
  if v is null then return null; end if;
  return v::timestamptz;
exception when others then
  raise exception 'Champ "%" : date/heure invalide (%). Format attendu : 2026-11-20T14:30:00+01:00', k, v;
end $$;

create or replace function public._mk_date(p jsonb, k text)
returns date language plpgsql stable set search_path = public
as $$
declare v text := nullif(trim(p ->> k), '');
begin
  if v is null then return null; end if;
  return left(v, 10)::date;
exception when others then
  raise exception 'Champ "%" : date invalide (%). Format attendu : 2026-11-20', k, v;
end $$;

-- Accepte 1500.5 / 1500,5 / 1.500,50 / 1,500.50 / "1 500 €"
create or replace function public._mk_num(p jsonb, k text)
returns numeric language plpgsql immutable set search_path = public
as $$
declare
  raw text := p ->> k;
  v text := nullif(regexp_replace(coalesce(p ->> k, ''), '[^0-9,.\-]', '', 'g'), '');
begin
  if v is null then return null; end if;
  if position(',' in v) > 0 and position('.' in v) > 0 then
    if strpos(reverse(v), ',') < strpos(reverse(v), '.') then
      v := replace(replace(v, '.', ''), ',', '.');   -- 1.500,50
    else
      v := replace(v, ',', '');                      -- 1,500.50
    end if;
  elsif position(',' in v) > 0 then
    v := replace(v, ',', '.');                       -- 1500,50
  end if;
  return v::numeric;
exception when others then
  raise exception 'Champ "%" : nombre invalide (%)', k, raw;
end $$;

create or replace function public._mk_bool(p jsonb, k text)
returns boolean language sql immutable set search_path = public
as $$ select case
  when p ->> k is null then null
  else lower(trim(p ->> k)) in ('true','1','yes','oui','si','sí','y','urgent','urgente')
end $$;

revoke all on function public._mk_text(jsonb, text) from public, anon, authenticated;
revoke all on function public._mk_ts(jsonb, text)   from public, anon, authenticated;
revoke all on function public._mk_date(jsonb, text) from public, anon, authenticated;
revoke all on function public._mk_num(jsonb, text)  from public, anon, authenticated;
revoke all on function public._mk_bool(jsonb, text) from public, anon, authenticated;

-- Retrouve ou crée une entreprise par son nom
create or replace function public._mk_company(p_org uuid, p_name text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if p_name is null then return null; end if;
  select id into v_id from public.companies
   where organization_id = p_org and lower(trim(name)) = lower(trim(p_name)) limit 1;
  if v_id is null then
    insert into public.companies (organization_id, name) values (p_org, trim(p_name)) returning id into v_id;
  end if;
  return v_id;
end $$;
revoke all on function public._mk_company(uuid, text) from public, anon, authenticated;

-- Retrouve un contact par email
create or replace function public._mk_contact_by_email(p_org uuid, p_email text)
returns uuid language sql stable security definer set search_path = public
as $$
  select id from public.contacts
   where organization_id = p_org and p_email is not null and lower(email) = lower(trim(p_email))
   order by created_at limit 1
$$;
revoke all on function public._mk_contact_by_email(uuid, text) from public, anon, authenticated;

create or replace function public.make_ingest(p_token text, p_type text, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_org uuid;
  v_type text := lower(trim(coalesce(p_type, '')));
  v_id uuid;
  v_action text := 'created';
  v_first text; v_last text; v_name text; v_email text;
  v_company uuid; v_contact uuid; v_stage uuid;
  v_ext text; v_status text; v_number text;
begin
  -- Authentification par la clé de l'organisation
  if p_token is null or char_length(p_token) < 20 then
    raise exception 'Clé d''intégration manquante ou invalide.' using errcode = '42501';
  end if;
  update public.integration_tokens set last_used_at = now()
   where token_hash = public._hash_token(trim(p_token))
   returning organization_id into v_org;
  if v_org is null then
    raise exception 'Clé d''intégration invalide.' using errcode = '42501';
  end if;

  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'p_data doit être un objet JSON.';
  end if;
  if octet_length(p_data::text) > 50000 then
    raise exception 'p_data est trop volumineux (50 Ko maximum).';
  end if;

  v_ext := public._mk_text(p_data, 'external_id');

  -- ---------------------------------------------------------------- contact / lead
  if v_type in ('contact', 'lead', 'prospect') then
    v_email := lower(public._mk_text(p_data, 'email'));
    if v_email is not null and v_email !~ '^\S+@\S+\.\S+$' then
      raise exception 'Champ "email" invalide (%).', v_email;
    end if;
    v_first := public._mk_text(p_data, 'first_name');
    v_last  := public._mk_text(p_data, 'last_name');
    v_name  := public._mk_text(p_data, 'name');
    if v_first is null and v_name is not null then
      v_first := split_part(v_name, ' ', 1);
      v_last  := coalesce(v_last, nullif(trim(substr(v_name, char_length(split_part(v_name, ' ', 1)) + 1)), ''));
    end if;
    if v_first is null and v_email is not null then v_first := split_part(v_email, '@', 1); end if;
    if v_first is null then
      raise exception 'Un prospect doit avoir au moins "first_name", "name" ou "email".';
    end if;
    v_company := public._mk_company(v_org, public._mk_text(p_data, 'company'));

    if v_ext is not null then
      select id into v_id from public.contacts where organization_id = v_org and external_id = v_ext;
    end if;
    if v_id is null then v_id := public._mk_contact_by_email(v_org, v_email); end if;

    if v_id is null then
      insert into public.contacts (organization_id, company_id, first_name, last_name, email, phone, source, external_id)
      values (v_org, v_company, v_first, coalesce(v_last, '—'), v_email,
              public._mk_text(p_data, 'phone'), coalesce(public._mk_text(p_data, 'source'), 'Make'), v_ext)
      returning id into v_id;
    else
      v_action := 'updated';
      update public.contacts set
        company_id  = coalesce(v_company, company_id),
        first_name  = coalesce(public._mk_text(p_data, 'first_name'), first_name),
        last_name   = coalesce(public._mk_text(p_data, 'last_name'), last_name),
        email       = coalesce(v_email, email),
        phone       = coalesce(public._mk_text(p_data, 'phone'), phone),
        source      = coalesce(public._mk_text(p_data, 'source'), source),
        external_id = coalesce(external_id, v_ext)
      where id = v_id;
    end if;

  -- ---------------------------------------------------------------- company
  elsif v_type in ('company', 'empresa', 'entreprise') then
    v_name := public._mk_text(p_data, 'name');
    if v_name is null then raise exception 'Une entreprise doit avoir un "name".'; end if;
    select id into v_id from public.companies
     where organization_id = v_org and lower(trim(name)) = lower(v_name) limit 1;
    if v_id is null then
      insert into public.companies (organization_id, name, sector, website, email, phone, address)
      values (v_org, v_name, public._mk_text(p_data, 'sector'), public._mk_text(p_data, 'website'),
              lower(public._mk_text(p_data, 'email')), public._mk_text(p_data, 'phone'), public._mk_text(p_data, 'address'))
      returning id into v_id;
    else
      v_action := 'updated';
      update public.companies set
        sector  = coalesce(public._mk_text(p_data, 'sector'), sector),
        website = coalesce(public._mk_text(p_data, 'website'), website),
        email   = coalesce(lower(public._mk_text(p_data, 'email')), email),
        phone   = coalesce(public._mk_text(p_data, 'phone'), phone),
        address = coalesce(public._mk_text(p_data, 'address'), address)
      where id = v_id;
    end if;

  -- ---------------------------------------------------------------- opportunity
  elsif v_type in ('opportunity', 'deal', 'oportunidad', 'opportunite') then
    v_name := public._mk_text(p_data, 'title');
    if v_name is null then raise exception 'Une opportunité doit avoir un "title".'; end if;
    v_company := public._mk_company(v_org, public._mk_text(p_data, 'company'));
    v_contact := public._mk_contact_by_email(v_org, public._mk_text(p_data, 'contact_email'));
    if public._mk_text(p_data, 'stage') is not null then
      select id into v_stage from public.pipeline_stages
       where organization_id = v_org and lower(name) = lower(public._mk_text(p_data, 'stage')) limit 1;
    end if;
    if v_ext is not null then
      select id into v_id from public.opportunities where organization_id = v_org and external_id = v_ext;
    end if;
    if v_id is null then
      if v_stage is null then
        select id into v_stage from public.pipeline_stages where organization_id = v_org order by position limit 1;
      end if;
      insert into public.opportunities (organization_id, title, amount, company_id, contact_id, stage_id, external_id)
      values (v_org, v_name, coalesce(public._mk_num(p_data, 'amount'), 0), v_company, v_contact, v_stage, v_ext)
      returning id into v_id;
    else
      v_action := 'updated';
      update public.opportunities set
        title      = v_name,
        amount     = coalesce(public._mk_num(p_data, 'amount'), amount),
        company_id = coalesce(v_company, company_id),
        contact_id = coalesce(v_contact, contact_id),
        stage_id   = coalesce(v_stage, stage_id)
      where id = v_id;
    end if;

  -- ---------------------------------------------------------------- appointment
  elsif v_type in ('appointment', 'cita', 'rdv', 'rendez-vous', 'meeting') then
    v_name := public._mk_text(p_data, 'title');
    if v_name is null then raise exception 'Un rendez-vous doit avoir un "title".'; end if;
    if public._mk_ts(p_data, 'starts_at') is null and v_ext is null then
      raise exception 'Un rendez-vous doit avoir un "starts_at" (ex. 2026-11-20T14:30:00+01:00).';
    end if;
    v_contact := public._mk_contact_by_email(v_org, public._mk_text(p_data, 'contact_email'));
    v_status := lower(public._mk_text(p_data, 'status'));
    if v_status is not null and v_status not in ('scheduled','done','cancelled') then
      raise exception 'Champ "status" : valeurs possibles scheduled, done, cancelled.';
    end if;
    if v_ext is not null then
      select id into v_id from public.appointments where organization_id = v_org and external_id = v_ext;
    end if;
    if v_id is null then
      if public._mk_ts(p_data, 'starts_at') is null then
        raise exception 'Un rendez-vous doit avoir un "starts_at" (ex. 2026-11-20T14:30:00+01:00).';
      end if;
      insert into public.appointments (organization_id, title, starts_at, ends_at, location, notes, urgent,
                                       status, contact_id, source, external_id)
      values (v_org, v_name, public._mk_ts(p_data, 'starts_at'), public._mk_ts(p_data, 'ends_at'),
              public._mk_text(p_data, 'location'), public._mk_text(p_data, 'notes'),
              coalesce(public._mk_bool(p_data, 'urgent'), false),
              coalesce(v_status, 'scheduled')::public.appointment_status,
              v_contact, coalesce(public._mk_text(p_data, 'source'), 'Make'), v_ext)
      returning id into v_id;
    else
      v_action := 'updated';
      update public.appointments set
        title      = v_name,
        starts_at  = coalesce(public._mk_ts(p_data, 'starts_at'), starts_at),
        ends_at    = coalesce(public._mk_ts(p_data, 'ends_at'), ends_at),
        location   = coalesce(public._mk_text(p_data, 'location'), location),
        notes      = coalesce(public._mk_text(p_data, 'notes'), notes),
        urgent     = coalesce(public._mk_bool(p_data, 'urgent'), urgent),
        status     = coalesce(v_status::public.appointment_status, status),
        contact_id = coalesce(v_contact, contact_id)
      where id = v_id;
    end if;

  -- ---------------------------------------------------------------- invoice
  elsif v_type in ('invoice', 'factura', 'facture') then
    v_number := public._mk_text(p_data, 'number');
    if public._mk_num(p_data, 'amount') is null and v_ext is null and v_number is null then
      raise exception 'Une facture doit avoir au moins "amount" et "number" (ou "external_id").';
    end if;
    v_status := lower(public._mk_text(p_data, 'status'));
    v_status := case
      when v_status in ('paid','payée','payee','pagada','pagado','true','1') then 'paid'
      when v_status in ('unpaid','à payer','a payer','impayée','impayee','pendiente','por pagar','false','0') then 'unpaid'
      when v_status is null then null
      else 'invalid' end;
    if v_status = 'invalid' then
      raise exception 'Champ "status" : valeurs possibles paid, unpaid.';
    end if;
    if v_status is null and public._mk_date(p_data, 'paid_at') is not null then v_status := 'paid'; end if;
    v_company := public._mk_company(v_org, public._mk_text(p_data, 'company'));
    v_contact := public._mk_contact_by_email(v_org, public._mk_text(p_data, 'contact_email'));

    if v_ext is not null then
      select id into v_id from public.invoices where organization_id = v_org and external_id = v_ext;
    end if;
    if v_id is null and v_number is not null then
      select id into v_id from public.invoices where organization_id = v_org and number = v_number limit 1;
    end if;

    if v_id is null then
      insert into public.invoices (organization_id, number, client_name, company_id, contact_id, amount, currency,
                                   issued_at, due_at, paid_at, status, notes, source, external_id)
      values (v_org, v_number,
              coalesce(public._mk_text(p_data, 'client_name'), public._mk_text(p_data, 'company')),
              v_company, v_contact, coalesce(public._mk_num(p_data, 'amount'), 0),
              upper(coalesce(public._mk_text(p_data, 'currency'), 'EUR')),
              public._mk_date(p_data, 'issued_at'), public._mk_date(p_data, 'due_at'),
              public._mk_date(p_data, 'paid_at'), coalesce(v_status, 'unpaid'),
              public._mk_text(p_data, 'notes'), coalesce(public._mk_text(p_data, 'source'), 'Make'), v_ext)
      returning id into v_id;
    else
      v_action := 'updated';
      update public.invoices set
        number      = coalesce(v_number, number),
        client_name = coalesce(public._mk_text(p_data, 'client_name'), public._mk_text(p_data, 'company'), client_name),
        company_id  = coalesce(v_company, company_id),
        contact_id  = coalesce(v_contact, contact_id),
        amount      = coalesce(public._mk_num(p_data, 'amount'), amount),
        currency    = coalesce(upper(public._mk_text(p_data, 'currency')), currency),
        issued_at   = coalesce(public._mk_date(p_data, 'issued_at'), issued_at),
        due_at      = coalesce(public._mk_date(p_data, 'due_at'), due_at),
        paid_at     = coalesce(public._mk_date(p_data, 'paid_at'), paid_at),
        status      = coalesce(v_status, status),
        notes       = coalesce(public._mk_text(p_data, 'notes'), notes),
        external_id = coalesce(external_id, v_ext)
      where id = v_id;
    end if;

  else
    raise exception 'p_type inconnu : "%". Valeurs possibles : contact, company, opportunity, appointment, invoice.', p_type;
  end if;

  -- Journal (visible dans la page Automatisations)
  insert into public.automation_runs (organization_id, rule_id, event_key, status, details)
  values (v_org, null, 'make:' || gen_random_uuid(), 'success',
          jsonb_build_object('source', 'make', 'type', v_type, 'action', v_action, 'id', v_id));

  return jsonb_build_object('ok', true, 'type', v_type, 'action', v_action, 'id', v_id);
end $$;

revoke all on function public.make_ingest(text, text, jsonb) from public;
grant execute on function public.make_ingest(text, text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. Temps réel
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['contacts','companies','opportunities','tasks','appointments','invoices','activities','automation_runs'] loop
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
