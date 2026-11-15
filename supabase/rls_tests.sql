-- =====================================================================
-- VALTIQ — tests d'isolation multi-organisation (RLS)
-- À exécuter dans le SQL Editor Supabase APRÈS schema_v0_2.sql, sur un
-- projet de test. Tout est annulé à la fin (ROLLBACK) : rien n'est conservé.
-- Succès = message « TOUS LES TESTS RLS SONT PASSÉS ». Le premier échec
-- interrompt le script avec le nom du test.
--
-- STATUT : écrit mais NON exécuté. Si un test échoue, vérifier d'abord
-- si c'est le test ou le schéma qui est en cause.
-- =====================================================================
begin;

-- Utilisateurs fictifs (le trigger handle_new_user crée les profils)
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-00000000000a','authenticated','authenticated','alice@test.local'),
  ('00000000-0000-0000-0000-00000000000b','authenticated','authenticated','bob@test.local'),
  ('00000000-0000-0000-0000-00000000000c','authenticated','authenticated','carol@test.local'),
  ('00000000-0000-0000-0000-00000000000d','authenticated','authenticated','dave@test.local');

-- Bascule la session sur un utilisateur authentifié.
-- Toujours précédée d'un « reset role » dans le bloc appelant.
create function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', u, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u::text, true);
  set local role authenticated;
end $$;

do $$
declare
  alice constant uuid := '00000000-0000-0000-0000-00000000000a';
  bob   constant uuid := '00000000-0000-0000-0000-00000000000b';
  carol constant uuid := '00000000-0000-0000-0000-00000000000c';
  dave  constant uuid := '00000000-0000-0000-0000-00000000000d';
  org_a uuid; org_b uuid;
  comp_a uuid; comp_b uuid;
  n int; failed boolean;
begin
  -- T0 : profils créés automatiquement
  reset role;
  select count(*) into n from public.profiles where id in (alice, bob, carol, dave);
  if n <> 4 then raise exception 'T0 : profils non créés par le trigger (%)', n; end if;

  -- Mise en place : Alice crée A, Bob crée B
  reset role; perform pg_temp.as_user(alice);
  org_a := public.create_organization('Org A');
  reset role; perform pg_temp.as_user(bob);
  org_b := public.create_organization('Org B');

  -- Alice (owner de A) ajoute Carol (admin) et Dave (sales)
  reset role; perform pg_temp.as_user(alice);
  insert into public.organization_members (organization_id, user_id, role) values
    (org_a, carol, 'admin'), (org_a, dave, 'sales');
  insert into public.companies (organization_id, name) values (org_a, 'Société A') returning id into comp_a;
  reset role; perform pg_temp.as_user(bob);
  insert into public.companies (organization_id, name) values (org_b, 'Société B') returning id into comp_b;

  -- T1 : chacun ne voit que son organisation
  reset role; perform pg_temp.as_user(alice);
  select count(*) into n from public.organizations;
  if n <> 1 then raise exception 'T1a : Alice voit % organisations', n; end if;
  reset role; perform pg_temp.as_user(bob);
  select count(*) into n from public.organizations;
  if n <> 1 then raise exception 'T1b : Bob voit % organisations', n; end if;

  -- T2 : Bob ne lit pas les entreprises de A
  select count(*) into n from public.companies where id = comp_a;
  if n <> 0 then raise exception 'T2 : Bob lit une entreprise de A'; end if;

  -- T3 : Bob ne peut pas écrire dans A
  failed := false;
  begin
    insert into public.companies (organization_id, name) values (org_a, 'Intrusion');
  exception when others then failed := true; end;
  if not failed then raise exception 'T3 : Bob a inséré dans l''organisation A'; end if;

  -- T4 : référence inter-organisations refusée (FK composite)
  failed := false;
  begin
    insert into public.contacts (organization_id, company_id, first_name, last_name)
      values (org_b, comp_a, 'Jean', 'Dupont');
  exception when others then failed := true; end;
  if not failed then raise exception 'T4 : contact de B relié à une entreprise de A'; end if;

  -- T5 : un admin ne peut pas se promouvoir owner
  reset role; perform pg_temp.as_user(carol);
  failed := false;
  begin
    update public.organization_members set role = 'owner'
     where organization_id = org_a and user_id = carol;
  exception when others then failed := true; end;
  if not failed then raise exception 'T5 : Carol (admin) s''est promue owner'; end if;

  -- T6 : un admin ne peut pas rétrograder ni retirer l'owner
  update public.organization_members set role = 'sales'
   where organization_id = org_a and user_id = alice;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T6a : Carol a rétrogradé Alice'; end if;
  delete from public.organization_members where organization_id = org_a and user_id = alice;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T6b : Carol a retiré Alice'; end if;

  -- T7 : un admin ne peut pas créer un owner
  failed := false;
  begin
    insert into public.organization_members (organization_id, user_id, role)
      values (org_a, bob, 'owner');
  exception when others then failed := true; end;
  if not failed then raise exception 'T7 : Carol a créé un owner'; end if;

  -- T8 : un commercial ne touche ni aux règles, ni aux étapes, ni aux journaux d'exécution
  reset role; perform pg_temp.as_user(dave);
  update public.automation_rules set enabled = true where organization_id = org_a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T8a : Dave a modifié des règles d''automatisation'; end if;

  failed := false;
  begin
    insert into public.pipeline_stages (organization_id, name, position) values (org_a, 'X', 99);
  exception when others then failed := true; end;
  if not failed then raise exception 'T8b : Dave a créé une étape de pipeline'; end if;

  failed := false;
  begin
    insert into public.automation_runs (organization_id, event_key, status)
      values (org_a, 'faux-evenement', 'success');
  exception when others then failed := true; end;
  if not failed then raise exception 'T8c : Dave a écrit dans automation_runs'; end if;

  -- T9 : activités — auteur imposé
  failed := false;
  begin
    insert into public.activities (organization_id, type, body, actor_id)
      values (org_a, 'note', 'usurpation', alice);
  exception when others then failed := true; end;
  if not failed then raise exception 'T9 : Dave a usurpé un auteur d''activité'; end if;
  insert into public.activities (organization_id, type, body, actor_id)
    values (org_a, 'note', 'ok', dave);

  -- T10 : Dave (sales) crée des tâches mais ne supprime pas d'entreprise
  insert into public.tasks (organization_id, title, owner_id) values (org_a, 'Appeler', dave);
  delete from public.companies where id = comp_a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T10 : Dave a supprimé une entreprise'; end if;

  -- T11 : responsable hors organisation refusé
  reset role; perform pg_temp.as_user(alice);
  failed := false;
  begin
    insert into public.tasks (organization_id, title, owner_id) values (org_a, 'Piège', bob);
  exception when others then failed := true; end;
  if not failed then raise exception 'T11 : tâche attribuée à un non-membre'; end if;

  -- T12 : le dernier owner ne peut ni partir ni être rétrogradé
  failed := false;
  begin
    delete from public.organization_members where organization_id = org_a and user_id = alice;
  exception when others then failed := true; end;
  if not failed then raise exception 'T12a : le dernier owner a pu quitter l''organisation'; end if;
  failed := false;
  begin
    update public.organization_members set role = 'admin'
     where organization_id = org_a and user_id = alice;
  exception when others then failed := true; end;
  if not failed then raise exception 'T12b : le dernier owner a pu être rétrogradé'; end if;

  -- T13 : suppression de l'organisation par son owner (cascade autorisée)
  reset role; perform pg_temp.as_user(bob);
  delete from public.organizations where id = org_b;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T13 : l''owner n''a pas pu supprimer son organisation'; end if;

  -- T14 : anon n'a accès à rien
  reset role;
  set local role anon;
  failed := false;
  begin
    perform 1 from public.companies limit 1;
  exception when others then failed := true; end;
  if not failed then raise exception 'T14 : anon peut lire companies'; end if;
  reset role;

  raise notice 'TOUS LES TESTS RLS SONT PASSÉS';
end $$;

rollback;
