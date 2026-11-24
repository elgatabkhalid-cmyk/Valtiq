-- VALTIQ v0.10 : confidentialité des boîtes mail privées (audit du 18/11/2026, validé par l'équipe Automatisation).
-- Aucun nom ni paramètre de fonction appelée par Make n'est modifié.
--  1. Routage : un email d'une boîte privée ne recopie plus son contenu (objet, résumé, extrait, expéditeur)
--     dans les fiches partagées (activités, tâches, rendez-vous, opportunités) ; seule une tâche neutre est créée
--     pour le propriétaire de la boîte.
--  2. Export RGPD d'un contact : seuls les emails des boîtes que l'utilisateur a le droit de voir sont exportés.
--  3. Boîtes mail : seul le propriétaire (owner) de l'organisation peut changer la visibilité ou le propriétaire.
--  4. Temps réel : la table emails rejoint la publication supabase_realtime (la lecture reste filtrée par RLS).

-- 1. Routage métier --------------------------------------------------------------------------------------------
do $do$
declare
  v_def text;
  m_decl constant text := 'v_prefixe text := ''''; v_desc text; v_lieu text;';
  m_run  constant text := '  if v_run is null then return jsonb_build_object(''route'', false, ''raison'', ''deja_route''); end if;';
begin
  v_def := pg_get_functiondef('public._email_router_metier(uuid,uuid,jsonb)'::regprocedure);
  if position(m_decl in v_def) = 0 or position(m_run in v_def) = 0 then
    raise exception 'v0.10 : _email_router_metier ne correspond pas à la version attendue (v0.7.1) ; migration arrêtée.';
  end if;
  if position('v_prive' in v_def) > 0 then
    raise exception 'v0.10 : _email_router_metier contient déjà la garde boîte privée.';
  end if;

  v_def := replace(v_def, m_decl, m_decl || '
  v_prive boolean := false; v_proprio uuid;');

  v_def := replace(v_def, m_run, m_run || '

  -- Boîte privée : aucun contenu de l''email dans les fiches partagées, seulement une tâche neutre
  select b.visibilite <> ''equipe'', b.proprietaire_id into v_prive, v_proprio
    from public.boites_mail b where b.id = e.boite_mail_id and b.organization_id = p_org;
  if coalesce(v_prive, false) then
    insert into public.tasks (organization_id, title, due_at, priority, owner_id)
    values (p_org, ''Email reçu dans une boîte privée : à traiter dans la Boîte de réception'',
            now() + interval ''1 day'', ''normal'', v_proprio)
    returning id into v_task;
    update public.automation_runs set details = jsonb_build_object(''email_id'', e.id, ''tache_id'', v_task, ''boite_privee'', true)
     where id = v_run;
    perform public._journaliser(p_org, ''automatisation'', null, ''email_route'', ''email'', e.id,
              jsonb_build_object(''boite_privee'', true, ''tache'', true), false);
    return jsonb_build_object(''route'', true, ''boite_privee'', true, ''tache_id'', v_task);
  end if;');

  execute v_def;
end $do$;

-- 2. Export RGPD ----------------------------------------------------------------------------------------------
create or replace function public.exporter_donnees_contact(p_contact_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare v_org uuid; v jsonb;
begin
  select organization_id into v_org from public.contacts where id = p_contact_id;
  if v_org is null or not public.has_org_role(v_org, array['owner','admin']::public.member_role[]) then
    raise exception 'Action réservée aux propriétaires et administrateurs.' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'genere_le', now(),
    'contact', to_jsonb(c) - 'owner_id',
    'adresses', coalesce((select jsonb_agg(jsonb_build_object('adresse', a.adresse_normalisee, 'statut', a.statut, 'depuis', a.created_at))
                            from public.contact_adresses_email a where a.contact_id = c.id), '[]'::jsonb),
    -- Seuls les emails des boîtes visibles par l'utilisateur (une boîte privée : son propriétaire et l'owner)
    'emails', coalesce((select jsonb_agg(jsonb_build_object('recu_le', e.recu_le, 'objet', e.objet, 'expediteur', e.expediteur_normalise,
                                 'destinataires', e.destinataires, 'corps_texte', e.corps_texte, 'resume', e.resume,
                                 'pieces_jointes', (select coalesce(jsonb_agg(pj.nom_fichier), '[]'::jsonb)
                                                      from public.pieces_jointes pj where pj.email_id = e.id))
                                 order by e.recu_le)
                          from public.emails e
                         where e.contact_id = c.id and public.peut_acceder_boite(e.boite_mail_id)), '[]'::jsonb),
    'classifications', coalesce((select jsonb_agg(jsonb_build_object('le', h.created_at, 'source', h.source, 'decision', h.decision,
                                   'justification', h.justification) order by h.created_at)
                                 from public.historique_classification h
                                where h.contact_id = c.id
                                  and (h.email_id is null or exists (select 1 from public.emails e2
                                                                      where e2.id = h.email_id
                                                                        and public.peut_acceder_boite(e2.boite_mail_id)))), '[]'::jsonb),
    'emails_non_exportes', (select count(*) from public.emails e3
                             where e3.contact_id = c.id and not public.peut_acceder_boite(e3.boite_mail_id)))
  into v from public.contacts c where c.id = p_contact_id;
  perform public._journaliser(v_org, 'utilisateur', auth.uid(), 'export', 'contact', p_contact_id, '{}'::jsonb, true);
  return v;
end $$;
revoke all on function public.exporter_donnees_contact(uuid) from public, anon;
grant execute on function public.exporter_donnees_contact(uuid) to authenticated;

-- 3. Réglages des boîtes mail ---------------------------------------------------------------------------------
create or replace function public.trg_boites_mail_confidentialite()
returns trigger language plpgsql set search_path to 'public', 'pg_temp'
as $$
begin
  -- Appels serveur (sans utilisateur connecté : Make, tâches planifiées) : inchangés
  if (select auth.uid()) is null then return new; end if;
  if (new.visibilite is distinct from old.visibilite or new.proprietaire_id is distinct from old.proprietaire_id)
     and not public.has_org_role(old.organization_id, array['owner']::public.member_role[]) then
    raise exception 'Seul le propriétaire de l''organisation peut changer la visibilité ou le propriétaire d''une boîte mail.'
      using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.trg_boites_mail_confidentialite() from public, anon, authenticated;

drop trigger if exists boites_mail_confidentialite on public.boites_mail;
create trigger boites_mail_confidentialite
  before update of visibilite, proprietaire_id on public.boites_mail
  for each row execute function public.trg_boites_mail_confidentialite();

-- 4. Temps réel -----------------------------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'emails') then
    alter publication supabase_realtime add table public.emails;
  end if;
end $$;