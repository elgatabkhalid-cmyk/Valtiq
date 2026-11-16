create or replace function public._email_router_metier(p_org uuid, p_email uuid, p_brut jsonb)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare
  e public.emails; v_type text; v_cat text; v_nom text; v_company uuid;
  v_run uuid; v_act uuid; v_appt uuid; v_opp uuid; v_task uuid; v_stage uuid;
  v_start timestamptz; v_end timestamptz; v_montant numeric; v_urgent boolean;
  v_titre text; v_prio public.task_priority := 'normal'; v_due timestamptz;
  v_prefixe text := ''; v_desc text; v_lieu text;
begin
  if p_brut is null or jsonb_typeof(p_brut) <> 'object' then p_brut := '{}'::jsonb; end if;
  select * into e from public.emails where id = p_email and organization_id = p_org;
  if not found then return jsonb_build_object('route', false, 'raison', 'email_introuvable'); end if;
  if e.contact_id is null or e.nature_message <> 'humain' or coalesce(e.niveau_confiance, 'faible') not in ('eleve', 'moyen') then
    return jsonb_build_object('route', false, 'raison', 'non_eligible',
      'detail', 'contact absent, message non humain ou confiance faible : reste dans la file À vérifier');
  end if;

  insert into public.automation_runs (organization_id, rule_id, event_key, status, details)
  values (p_org, null, 'email:' || e.id || ':routage', 'success', jsonb_build_object('email_id', e.id))
  on conflict (organization_id, event_key) do nothing
  returning id into v_run;
  if v_run is null then return jsonb_build_object('route', false, 'raison', 'deja_route'); end if;

  select tm.code into v_type from public.types_messages tm where tm.id = e.type_message_id;
  select cc.code, btrim(c.first_name || ' ' || case when c.last_name = '—' then '' else c.last_name end), c.company_id
    into v_cat, v_nom, v_company
    from public.contacts c left join public.categories_contacts cc on cc.id = c.categorie_id
   where c.id = e.contact_id;
  if e.niveau_confiance = 'moyen' then v_prefixe := '[À vérifier] '; end if;
  v_desc := left(coalesce('Objet : ' || e.objet || E'\n', '') || coalesce(e.resume, e.extrait, '')
            || E'\nEmail reçu le ' || to_char(e.recu_le at time zone 'Europe/Paris', 'DD/MM/YYYY HH24:MI')
            || ' de ' || e.expediteur_normalise, 2000);

  -- 1. Interaction sur la fiche du contact
  insert into public.activities (organization_id, type, body, contact_id)
  values (p_org, 'email', left('Email reçu : ' || coalesce(nullif(e.objet, ''), '(sans objet)') || E'\n' || coalesce(e.resume, e.extrait, ''), 2000), e.contact_id)
  returning id into v_act;

  v_montant := public._mk_num(p_brut, 'montant');
  if v_montant is not null and v_montant < 0 then v_montant := null; end if;
  v_urgent := lower(coalesce(p_brut ->> 'urgent', '')) = 'true';
  v_lieu := left(nullif(nullif(btrim(p_brut ->> 'rdv_lieu'), ''), 'null'), 300);

  -- 2. Opportunité pour une demande de devis d'un prospect ou client
  if v_type = 'demande_devis' and v_cat in ('prospect', 'client') then
    select id into v_stage from public.pipeline_stages where organization_id = p_org order by position limit 1;
    insert into public.opportunities (organization_id, title, company_id, contact_id, stage_id, amount, external_id)
    values (p_org, left(v_prefixe || 'Devis — ' || v_nom || coalesce(' · ' || nullif(e.objet, ''), ''), 200),
            v_company, e.contact_id, v_stage, coalesce(v_montant, 0), 'email:' || e.id)
    on conflict (organization_id, external_id) do nothing
    returning id into v_opp;
  end if;

  -- 3. Rendez-vous : créé seulement si un créneau explicite figure dans l'email
  if v_type = 'rendez_vous' or e.action_recommandee = 'planifier_rdv' then
    v_start := public._valtiq_ts(nullif(p_brut ->> 'rdv_debut', 'null'));
    if v_start is not null and v_start > e.recu_le - interval '1 day' and v_start < e.recu_le + interval '400 days' then
      v_end := public._valtiq_ts(nullif(p_brut ->> 'rdv_fin', 'null'));
      if v_end is null or v_end <= v_start then v_end := v_start + interval '1 hour'; end if;
      insert into public.appointments (organization_id, title, starts_at, ends_at, location, notes, urgent, status,
                                       contact_id, source, external_id)
      values (p_org, left(v_prefixe || 'RDV — ' || v_nom || coalesce(' · ' || nullif(e.objet, ''), ''), 200),
              v_start, v_end, v_lieu, left('Créneau proposé par email, à confirmer avec le contact. ' || v_desc, 2000),
              v_urgent, 'scheduled', e.contact_id, 'email', 'email:' || e.id)
      on conflict (organization_id, external_id) do nothing
      returning id into v_appt;
    end if;
  end if;

  -- 4. Tâche de suivi selon l'intention
  v_due := now() + interval '2 days';
  if v_type = 'reclamation' then
    v_titre := 'Traiter la réclamation'; v_prio := 'high'; v_due := now() + interval '1 day';
  elsif v_type in ('rendez_vous') or e.action_recommandee = 'planifier_rdv' then
    if v_appt is not null then v_titre := 'Confirmer le rendez-vous';
    else v_titre := 'Planifier le rendez-vous'; end if;
    v_prio := 'high'; v_due := now() + interval '1 day';
  elsif v_type = 'demande_devis' or e.action_recommandee = 'envoyer_devis' then
    v_titre := 'Envoyer le devis'; v_prio := 'high';
  elsif v_type = 'facturation' then
    v_titre := case when v_cat = 'fournisseur' then 'Facture fournisseur à traiter' else 'Demande de facturation à traiter' end;
  elsif v_type = 'paiement' then
    v_titre := 'Vérifier le paiement annoncé';
  elsif v_type = 'commande' then
    v_titre := 'Traiter la commande'; v_prio := 'high';
  elsif v_type = 'support' then
    v_titre := 'Demande de support à traiter'; v_due := now() + interval '1 day';
  elsif v_type = 'livraison' then
    v_titre := 'Suivi de livraison';
  elsif v_type = 'candidature' then
    v_titre := 'Candidature à examiner';
  elsif v_type = 'relance' then
    v_titre := 'Relance reçue : répondre'; v_prio := 'high';
  elsif e.action_recommandee in ('repondre', 'transmettre_comptabilite', 'transmettre_direction', 'transmettre_rh', 'traiter_reclamation') then
    v_titre := 'Répondre';
  end if;
  if v_urgent then v_prio := 'high'; end if;

  if v_titre is not null then
    insert into public.tasks (organization_id, title, description, due_at, priority, contact_id, opportunity_id)
    values (p_org, left(v_prefixe || v_titre || ' — ' || v_nom, 200),
            v_desc || coalesce(E'\nMontant mentionné : ' || v_montant || ' €', '')
                   || coalesce(E'\nN° de facture mentionné : ' || nullif(nullif(btrim(p_brut ->> 'numero_facture'), ''), 'null'), ''),
            v_due, v_prio, e.contact_id, v_opp)
    returning id into v_task;
  end if;

  update public.automation_runs set details = jsonb_strip_nulls(jsonb_build_object(
    'email_id', e.id, 'activite_id', v_act, 'rdv_id', v_appt, 'opportunite_id', v_opp, 'tache_id', v_task))
  where id = v_run;
  perform public._journaliser(p_org, 'automatisation', null, 'email_route', 'email', e.id,
            jsonb_strip_nulls(jsonb_build_object('rdv', v_appt is not null, 'opportunite', v_opp is not null, 'tache', v_task is not null)), false);

  return jsonb_strip_nulls(jsonb_build_object('route', true, 'activite_id', v_act, 'rdv_id', v_appt,
    'opportunite_id', v_opp, 'tache_id', v_task, 'type', v_type, 'categorie', v_cat));
end $$;

revoke all on function public._email_router_metier(uuid, uuid, jsonb) from public, anon, authenticated;

create or replace function public.email_classer(p_email_id uuid default null, p_reponse_ia text default null, p_token text default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare r jsonb; v_org uuid; v_txt text; v_brut jsonb; v_route jsonb;
begin
  r := public.email_appliquer_classification(p_token, p_email_id, to_jsonb(coalesce(p_reponse_ia, '')));
  v_org := public._org_depuis_jeton(p_token);
  v_txt := substring(coalesce(p_reponse_ia, '') from '\{.*\}');
  begin v_brut := v_txt::jsonb; exception when others then v_brut := '{}'::jsonb; end;
  if v_brut is null or jsonb_typeof(v_brut) <> 'object' then v_brut := '{}'::jsonb; end if;
  begin
    v_route := public._email_router_metier(v_org, p_email_id, v_brut);
  exception when others then
    v_route := jsonb_build_object('route', false, 'erreur', sqlerrm);
    insert into public.automation_runs (organization_id, rule_id, event_key, status, details)
    values (v_org, null, 'email:' || p_email_id || ':routage:erreur:' || gen_random_uuid(), 'failed',
            jsonb_build_object('email_id', p_email_id, 'etape', 'routage', 'erreur', left(sqlerrm, 1000)));
    update public.emails set points_a_verifier = array_append(points_a_verifier, 'routage_en_erreur')
     where id = p_email_id and organization_id = v_org and not ('routage_en_erreur' = any (points_a_verifier));
  end;
  return r || jsonb_build_object('routage', v_route);
end $$;