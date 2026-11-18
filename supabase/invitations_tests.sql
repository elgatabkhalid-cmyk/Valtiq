-- Tests des invitations — à lancer APRÈS les migrations de supabase/migrations/ (dont 20261115145329_invitations_v0_3_1.sql), sur un projet de test.
-- Tout est annulé à la fin (ROLLBACK). Succès = « TOUS LES TESTS INVITATIONS SONT PASSÉS ».
-- STATUT : écrit mais NON exécuté.
begin;

insert into auth.users (id, aud, role, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000a1','authenticated','authenticated','alice@test.local', now()),
  ('00000000-0000-0000-0000-0000000000b1','authenticated','authenticated','bob@test.local',   now()),
  ('00000000-0000-0000-0000-0000000000c1','authenticated','authenticated','carol@test.local', now()),
  ('00000000-0000-0000-0000-0000000000d1','authenticated','authenticated','dave@test.local',  null);

create function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u::text, true);
  set local role authenticated;
end $$;

do $$
declare
  alice constant uuid := '00000000-0000-0000-0000-0000000000a1';
  bob   constant uuid := '00000000-0000-0000-0000-0000000000b1';
  carol constant uuid := '00000000-0000-0000-0000-0000000000c1';
  dave  constant uuid := '00000000-0000-0000-0000-0000000000d1';
  org_a uuid; n int; failed boolean;
begin
  reset role; perform pg_temp.as_user(alice);
  org_a := public.create_organization('Org A');

  -- I1 : un owner invite (l'email est normalisé en minuscules)
  insert into public.invitations (organization_id, email, role, invited_by)
    values (org_a, '  Bob@Test.Local ', 'sales', alice);
  select count(*) into n from public.invitations where email = 'bob@test.local';
  if n <> 1 then raise exception 'I1 : invitation non enregistrée ou email non normalisé'; end if;

  -- I2 : doublon refusé
  failed := false;
  begin
    insert into public.invitations (organization_id, email, invited_by) values (org_a, 'bob@test.local', alice);
  exception when others then failed := true; end;
  if not failed then raise exception 'I2 : doublon accepté'; end if;

  -- I3 : on ne peut pas inviter en tant qu'owner
  failed := false;
  begin
    insert into public.invitations (organization_id, email, role, invited_by) values (org_a, 'x@test.local', 'owner', alice);
  exception when others then failed := true; end;
  if not failed then raise exception 'I3 : invitation avec le rôle owner acceptée'; end if;

  -- I4 : un non-membre ne voit ni ne crée d'invitation
  reset role; perform pg_temp.as_user(carol);
  select count(*) into n from public.invitations;
  if n <> 0 then raise exception 'I4a : Carol voit des invitations'; end if;
  failed := false;
  begin
    insert into public.invitations (organization_id, email, invited_by) values (org_a, 'z@test.local', carol);
  exception when others then failed := true; end;
  if not failed then raise exception 'I4b : Carol a créé une invitation dans une org qui n''est pas la sienne'; end if;

  -- I5 : Bob (invité, email confirmé) rejoint l'organisation
  reset role; perform pg_temp.as_user(bob);
  n := public.accept_invitations();
  if n <> 1 then raise exception 'I5a : Bob n''a pas rejoint (n=%)', n; end if;
  select count(*) into n from public.organization_members where user_id = bob and organization_id = org_a and role = 'sales';
  if n <> 1 then raise exception 'I5b : membership de Bob absent'; end if;
  select count(*) into n from public.invitations where email = 'bob@test.local';
  if n <> 0 then raise exception 'I5c : invitation non consommée'; end if;

  -- I6 : inviter un membre existant est refusé
  reset role; perform pg_temp.as_user(alice);
  failed := false;
  begin
    insert into public.invitations (organization_id, email, invited_by) values (org_a, 'bob@test.local', alice);
  exception when others then failed := true; end;
  if not failed then raise exception 'I6 : invitation d''un membre existant acceptée'; end if;

  -- I7 : un email NON confirmé ne rejoint rien
  insert into public.invitations (organization_id, email, invited_by) values (org_a, 'dave@test.local', alice);
  reset role; perform pg_temp.as_user(dave);
  n := public.accept_invitations();
  if n <> 0 then raise exception 'I7 : email non confirmé a rejoint l''organisation'; end if;

  -- I8 : Bob (sales) ne peut pas inviter
  reset role; perform pg_temp.as_user(bob);
  failed := false;
  begin
    insert into public.invitations (organization_id, email, invited_by) values (org_a, 'y@test.local', bob);
  exception when others then failed := true; end;
  if not failed then raise exception 'I8 : un commercial a créé une invitation'; end if;

  raise notice 'TOUS LES TESTS INVITATIONS SONT PASSÉS';
end $$;

rollback;
