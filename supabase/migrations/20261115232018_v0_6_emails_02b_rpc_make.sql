create or replace function public.email_ingest(p_token text default null, p_email jsonb default null)
returns jsonb language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_org uuid; v_boite public.boites_mail; v_param public.parametres_messagerie;
  v_msg_id text; v_email uuid; v_from text; v_contact uuid; v_adr_statut text; v_ident text;
  v_thread text; v_reply text; v_refs text[]; v_conv uuid; v_recu timestamptz;
  v_texte text; v_html text; v_pj jsonb; v_pj_id uuid; v_pj_out jsonb := '[]'::jsonb; v_nb int := 0;
  v_nom text; v_mime text; v_taille bigint; v_statut_pj text; v_motif text; v_chemin text;
  v_hdr jsonb; v_labels text[]; v_local text; v_dom text; v_nature text; v_analyse boolean := true;
  v_statut text := 'recu'; v_flags text[] := '{}';
begin
  v_org := public._org_depuis_jeton(p_token);

  if p_email is null or jsonb_typeof(p_email) <> 'object' then
    raise exception 'p_email doit être un objet JSON.' using errcode = '22023';
  end if;
  if octet_length(p_email::text) > 2000000 then
    raise exception 'Email trop volumineux (2 Mo maximum hors pièces jointes).' using errcode = '22023';
  end if;

  select * into v_boite from public.boites_mail
   where organization_id = v_org and adresse_normalisee = public.normaliser_email(p_email ->> 'boite_mail') and actif;
  if not found then
    raise exception 'Boîte mail « % » inconnue ou inactive pour cette entreprise.', p_email ->> 'boite_mail'
      using errcode = '42501';
  end if;

  v_msg_id := nullif(btrim(p_email ->> 'fournisseur_message_id'), '');
  if v_msg_id is null then
    raise exception 'Champ "fournisseur_message_id" obligatoire (id du message chez Gmail/Outlook).' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_boite.id::text || '|' || v_msg_id, 0));
  select id into v_email from public.emails
   where organization_id = v_org and boite_mail_id = v_boite.id and fournisseur_message_id = v_msg_id;
  if found then
    return jsonb_build_object('ok', true, 'action', 'deja_recu', 'email_id', v_email, 'analyse_ia_requise', false,
                              'contexte', public._contexte_email(v_email));
  end if;

  v_from := public.normaliser_email(p_email ->> 'expediteur_email');
  if v_from is null or v_from !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Champ "expediteur_email" invalide (%).', p_email ->> 'expediteur_email' using errcode = '22023';
  end if;
  v_recu  := coalesce(public._valtiq_ts(p_email ->> 'recu_le'), now());
  v_param := public._parametres_messagerie(v_org);

  select a.contact_id, a.statut into v_contact, v_adr_statut
    from public.contact_adresses_email a
   where a.organization_id = v_org and a.adresse_normalisee = v_from and a.statut <> 'rejetee';
  if v_contact is null then
    select c.id into v_contact from public.contacts c
     where c.organization_id = v_org and public.normaliser_email(c.email) = v_from
     order by c.created_at limit 1;
    if v_contact is not null then
      insert into public.contact_adresses_email (organization_id, contact_id, adresse_email, statut, source)
      values (v_org, v_contact, v_from, 'confirmee', 'email_entrant')
      on conflict (organization_id, adresse_normalisee) do nothing;
      v_adr_statut := 'confirmee';
    end if;
  end if;
  v_ident := case when v_contact is null then 'inconnu'
                  when v_adr_statut = 'supposee' then 'adresse_supposee' else 'connu' end;
  if v_adr_statut = 'supposee' then v_contact := null; end if;

  v_thread := nullif(btrim(p_email ->> 'fournisseur_thread_id'), '');
  v_reply  := nullif(btrim(p_email ->> 'en_reponse_a'), '');
  v_refs   := case jsonb_typeof(p_email -> 'references')
                when 'array'  then coalesce(array(select left(x, 998) from jsonb_array_elements_text(p_email -> 'references') x), '{}')
                when 'string' then coalesce(array(select left(x, 998) from regexp_split_to_table(btrim(p_email ->> 'references'), '\s+') x
                                                   where x <> ''), '{}')
                else '{}' end;
  if v_thread is not null then
    insert into public.conversations (organization_id, boite_mail_id, fournisseur_thread_id, objet, contact_id)
    values (v_org, v_boite.id, v_thread, left(p_email ->> 'objet', 500), v_contact)
    on conflict (organization_id, boite_mail_id, fournisseur_thread_id) where fournisseur_thread_id is not null
    do update set updated_at = now()
    returning id into v_conv;
  else
    if v_reply is not null or cardinality(v_refs) > 0 then
      select e.conversation_id into v_conv from public.emails e
       where e.organization_id = v_org and e.boite_mail_id = v_boite.id and e.conversation_id is not null
         and e.rfc_message_id = any (array_append(v_refs, v_reply))
       order by e.recu_le desc limit 1;
    end if;
    if v_conv is null then
      insert into public.conversations (organization_id, boite_mail_id, objet, contact_id)
      values (v_org, v_boite.id, left(p_email ->> 'objet', 500), v_contact)
      returning id into v_conv;
    end if;
  end if;

  v_texte := left(p_email ->> 'corps_texte', 200000);
  if v_texte is null and p_email ->> 'corps_html' is not null then
    v_texte := left(btrim(regexp_replace(regexp_replace(p_email ->> 'corps_html', '<(style|script)[^>]*>.*?</\1>', ' ', 'gis'),
                                         '<[^>]*>', ' ', 'g')), 200000);
  end if;
  v_html := case when v_param.stocker_html then left(p_email ->> 'corps_html', 500000) end;

  v_hdr := coalesce((select jsonb_object_agg(lower(key), value) from jsonb_each(
             case when jsonb_typeof(p_email -> 'entetes') = 'object' then p_email -> 'entetes' else '{}'::jsonb end)), '{}'::jsonb);
  v_labels := case when jsonb_typeof(p_email -> 'libelles') = 'array'
                   then array(select upper(x) from jsonb_array_elements_text(p_email -> 'libelles') x) else '{}' end;
  v_local := split_part(v_from, '@', 1);
  v_dom   := split_part(v_from, '@', 2);
  v_nature := case
    when 'SPAM' = any (v_labels) then 'spam'
    when v_from = v_boite.adresse_normalisee
      or (v_dom = split_part(v_boite.adresse_normalisee, '@', 2) and not public.est_domaine_public(v_dom)) then 'interne'
    when coalesce(lower(v_hdr ->> 'auto-submitted'), 'no') <> 'no'
      or v_local ~ '^(no-?reply|ne-?pas-?repondre|donotreply|do-not-reply|mailer-daemon|postmaster|bounces?|notifications?|alertes?)([._+-]|$)'
      then 'automatique'
    when v_hdr ? 'list-unsubscribe' or v_hdr ? 'list-id'
      or lower(coalesce(v_hdr ->> 'precedence', '')) in ('bulk', 'list', 'junk')
      or v_labels && array['CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL', 'CATEGORY_FORUMS'] then 'newsletter'
    else 'humain' end;

  if v_nature <> 'humain' and v_contact is null then
    v_analyse := false; v_statut := 'ignore';
  elsif coalesce(btrim(v_texte), '') = '' and coalesce(btrim(p_email ->> 'objet'), '') = '' then
    v_analyse := false; v_statut := 'a_verifier'; v_flags := array_append(v_flags, 'contenu_vide');
  end if;
  if lower(coalesce(p_email ->> 'a_pieces_jointes', '')) in ('true', '1')
     and jsonb_typeof(p_email -> 'pieces_jointes') is distinct from 'array' then
    v_flags := array_append(v_flags, 'pieces_jointes_non_importees');
  end if;

  insert into public.emails (
    organization_id, boite_mail_id, conversation_id, contact_id, direction,
    expediteur_email, expediteur_nom, destinataires, copie, objet, corps_texte, corps_html, extrait,
    recu_le, fournisseur_message_id, fournisseur_thread_id, rfc_message_id, en_reponse_a, references_rfc,
    statut_traitement, nature_message, points_a_verifier, supprimer_apres)
  values (
    v_org, v_boite.id, v_conv, v_contact,
    case when p_email ->> 'direction' = 'sortant' then 'sortant' else 'entrant' end,
    v_from, left(nullif(btrim(p_email ->> 'expediteur_nom'), ''), 200),
    public._valtiq_liste(p_email -> 'destinataires'), public._valtiq_liste(p_email -> 'copie'),
    left(p_email ->> 'objet', 1000), v_texte, v_html,
    left(regexp_replace(coalesce(v_texte, ''), '\s+', ' ', 'g'), 300),
    v_recu, v_msg_id, v_thread, nullif(btrim(p_email ->> 'rfc_message_id'), ''), v_reply, v_refs,
    v_statut, v_nature, v_flags, v_recu + make_interval(days => v_param.conservation_emails_jours))
  returning id into v_email;

  if jsonb_typeof(p_email -> 'pieces_jointes') = 'array' then
    for v_pj in select x from jsonb_array_elements(p_email -> 'pieces_jointes') x limit 50 loop
      continue when jsonb_typeof(v_pj) <> 'object';
      v_nom    := left(coalesce(nullif(btrim(v_pj ->> 'nom_fichier'), ''), 'fichier'), 255);
      v_mime   := left(lower(nullif(btrim(v_pj ->> 'type_mime'), '')), 150);
      v_taille := case when (v_pj ->> 'taille_octets') ~ '^\d{1,15}$' then (v_pj ->> 'taille_octets')::bigint end;
      v_pj_id  := gen_random_uuid();
      v_statut_pj := 'metadonnees'; v_motif := null; v_chemin := null;
      if v_nom ~* '\.(exe|bat|cmd|com|scr|pif|js|jse|vbs|vbe|wsf|ps1|msi|jar|hta|lnk|dll|reg|cpl)$' then
        v_statut_pj := 'rejetee'; v_motif := 'Type de fichier exécutable refusé';
      elsif v_taille is not null and v_taille > v_param.taille_max_piece_jointe_octets then
        v_statut_pj := 'rejetee'; v_motif := 'Fichier trop volumineux';
      elsif v_param.stocker_pieces_jointes then
        v_chemin := v_org || '/' || v_email || '/' || v_pj_id || '-'
                    || left(regexp_replace(v_nom, '[^A-Za-z0-9._-]', '_', 'g'), 120);
      end if;
      insert into public.pieces_jointes (id, organization_id, email_id, nom_fichier, type_mime, taille_octets,
                                         fournisseur_piece_id, storage_chemin, statut, motif_rejet)
      values (v_pj_id, v_org, v_email, v_nom, v_mime, v_taille,
              left(v_pj ->> 'fournisseur_piece_id', 1000), v_chemin, v_statut_pj, v_motif);
      v_nb := v_nb + 1;
      v_pj_out := v_pj_out || jsonb_build_object('id', v_pj_id, 'nom_fichier', v_nom, 'statut', v_statut_pj,
                    'motif_rejet', v_motif, 'a_televerser', v_chemin is not null,
                    'storage_bucket', 'pieces-jointes', 'storage_chemin', v_chemin);
    end loop;
    if v_nb > 0 then
      update public.emails set nb_pieces_jointes = v_nb where id = v_email;
    end if;
  end if;

  perform public._journaliser(v_org, 'automatisation', null, 'email_recu', 'email', v_email,
            jsonb_build_object('boite_mail_id', v_boite.id, 'identification', v_ident, 'pieces_jointes', v_nb,
                               'nature', v_nature, 'analyse_ia', v_analyse));
  insert into public.automation_runs (organization_id, rule_id, event_key, status, details)
  values (v_org, null, 'email:' || v_email || ':reception', 'success',
          jsonb_build_object('source', 'email_ingest', 'email_id', v_email));
  update public.boites_mail set derniere_synchro_le = now() where id = v_boite.id;

  return jsonb_build_object(
    'ok', true, 'action', 'cree', 'email_id', v_email, 'conversation_id', v_conv,
    'contact_id', v_contact, 'identification', v_ident, 'nature_message', v_nature,
    'analyse_ia_requise', v_analyse, 'statut_traitement', v_statut,
    'pieces_jointes', v_pj_out,
    'texte_pour_ia', regexp_replace(left(coalesce(v_texte, ''), 6000), '<\s*/?\s*email[^>]*>', '[balise retirée]', 'gi'),
    'objet_pour_ia', regexp_replace(left(coalesce(p_email ->> 'objet', ''), 300), '<\s*/?\s*email[^>]*>', '[balise retirée]', 'gi'),
    'expediteur_pour_ia', regexp_replace(coalesce(left(btrim(p_email ->> 'expediteur_nom'), 120) || ' ', '') || '<' || v_from || '>',
                                         '<\s*/?\s*email[^>]*>', '', 'gi'),
    'contexte', public._contexte_email(v_email),
    'contexte_ia', public._contexte_email(v_email)::text);
end $$;

create or replace function public.email_contexte(p_token text default null, p_email_id uuid default null)
returns jsonb language plpgsql security definer
set search_path = public, extensions
as $$
declare v_org uuid;
begin
  v_org := public._org_depuis_jeton(p_token);
  if not exists (select 1 from public.emails where id = p_email_id and organization_id = v_org) then
    raise exception 'Email introuvable pour cette entreprise.' using errcode = '42501';
  end if;
  return public._contexte_email(p_email_id);
end $$;

create or replace function public.email_appliquer_classification(p_token text default null, p_email_id uuid default null, p_resultat jsonb default null)
returns jsonb language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_org uuid; e public.emails; c public.contacts; v_param public.parametres_messagerie;
  v_conf numeric; v_niveau text; v_cat uuid; v_cat_av uuid; v_type uuid; v_action text;
  v_flags text[] := '{}'; v_dec_contact text; v_decision text; v_statut text;
  v_ident jsonb; v_prenom text; v_nom text; v_societe text; v_fonction text; v_tel text;
  v_manq text[]; v_suppose uuid; v_contact uuid; v_cat_avant uuid; v_nouveau boolean := false;
  v_r jsonb; v_brut jsonb; v_txt text; v_nature text; v_non_humain boolean := false;
begin
  v_org := public._org_depuis_jeton(p_token);

  v_brut := p_resultat;
  if jsonb_typeof(p_resultat) = 'string' then
    v_txt := substring(p_resultat #>> '{}' from '\{.*\}');
    begin v_brut := v_txt::jsonb; exception when others then v_brut := null; end;
    if v_brut is null then v_brut := jsonb_build_object('reponse_brute', left(p_resultat #>> '{}', 5000)); end if;
  end if;
  if v_brut is null or jsonb_typeof(v_brut) <> 'object' then
    v_brut := jsonb_build_object('reponse_brute', left(coalesce(p_resultat::text, ''), 5000));
  end if;
  if v_brut ? 'reponse_brute' and cardinality(array(select jsonb_object_keys(v_brut))) = 1 then
    v_flags := array_append(v_flags, 'reponse_ia_illisible');
  end if;
  v_r := jsonb_strip_nulls(jsonb_build_object(
    'categorie_contact', nullif(coalesce(v_brut ->> 'categorie_contact', v_brut ->> 'contact_category'), 'null'),
    'type_message',      nullif(coalesce(v_brut ->> 'type_message', v_brut ->> 'message_type'), 'null'),
    'confiance',         coalesce(v_brut -> 'confiance', v_brut -> 'confidence_score'),
    'identite', case when jsonb_typeof(v_brut -> 'identite') = 'object' then v_brut -> 'identite'
                     else jsonb_build_object('prenom', v_brut ->> 'first_name', 'nom', v_brut ->> 'last_name',
                            'entreprise', v_brut ->> 'company_name', 'fonction', v_brut ->> 'position',
                            'telephone', v_brut ->> 'phone') end,
    'contact_suppose_id', nullif(coalesce(v_brut ->> 'contact_suppose_id', v_brut ->> 'suspected_existing_contact_id'), 'null'),
    'resume',            coalesce(v_brut ->> 'resume', v_brut ->> 'message_summary'),
    'justification',     coalesce(v_brut ->> 'justification', v_brut ->> 'classification_reason'),
    'informations_manquantes', coalesce(v_brut -> 'informations_manquantes', v_brut -> 'missing_information'),
    'action_recommandee', nullif(coalesce(v_brut ->> 'action_recommandee', v_brut ->> 'recommended_action'), 'null'),
    'nature',            lower(coalesce(v_brut ->> 'message_nature', v_brut ->> 'nature_message')),
    'modele',            coalesce(v_brut ->> 'modele', v_brut ->> 'model'),
    'version_prompt',    coalesce(v_brut ->> 'version_prompt', v_brut ->> 'prompt_version')));

  select * into e from public.emails where id = p_email_id and organization_id = v_org for update;
  if not found then
    raise exception 'Email introuvable pour cette entreprise.' using errcode = '42501';
  end if;
  v_param := public._parametres_messagerie(v_org);

  perform set_config('valtiq.source', 'ia', true);
  perform set_config('valtiq.skip_log', 'on', true);

  begin v_conf := (v_r ->> 'confiance')::numeric; exception when others then v_conf := null; end;
  if v_conf > 1 and v_conf <= 100 then v_conf := v_conf / 100; end if;
  if v_conf is null or v_conf < 0 or v_conf > 1 then
    v_conf := 0; v_flags := array_append(v_flags, 'reponse_ia_non_conforme');
  end if;
  v_conf := round(v_conf, 3);
  v_niveau := case when v_conf >= v_param.seuil_confiance_eleve then 'eleve'
                   when v_conf >= v_param.seuil_confiance_moyen then 'moyen' else 'faible' end;

  v_cat_av := public._categorie_par_code(v_org, 'a_verifier');
  v_cat    := public._categorie_par_code(v_org, v_r ->> 'categorie_contact');
  if v_cat is null then
    v_cat := v_cat_av; v_flags := array_append(v_flags, 'categorie_inconnue');
  end if;
  if v_cat = v_cat_av and v_niveau = 'eleve' then v_niveau := 'moyen'; end if;

  v_type := public._type_par_code(v_org, v_r ->> 'type_message');
  if v_type is null then
    v_type := public._type_par_code(v_org, 'autre'); v_flags := array_append(v_flags, 'type_message_inconnu');
  end if;

  v_action := v_r ->> 'action_recommandee';
  if v_action is null or v_action not in ('repondre','envoyer_devis','planifier_rdv','transmettre_comptabilite',
       'transmettre_rh','transmettre_direction','traiter_reclamation','verifier_identite','archiver','aucune') then
    if v_action is not null then v_flags := array_append(v_flags, 'action_ia_refusee'); end if;
    v_action := 'verification_manuelle';
  end if;

  if v_flags && array['reponse_ia_illisible','reponse_ia_non_conforme','categorie_inconnue','type_message_inconnu','action_ia_refusee'] then
    v_niveau := 'faible';
  end if;

  v_manq := coalesce(array(
    select left(x, 60) from jsonb_array_elements_text(
      case when jsonb_typeof(v_r -> 'informations_manquantes') = 'array'
           then v_r -> 'informations_manquantes' else '[]'::jsonb end) x where x <> '' limit 20), '{}');

  v_ident    := coalesce(v_r -> 'identite', '{}'::jsonb);
  v_prenom   := left(nullif(nullif(btrim(v_ident ->> 'prenom'), ''), 'null'), 80);
  v_nom      := left(nullif(nullif(btrim(v_ident ->> 'nom'), ''), 'null'), 80);
  v_societe  := left(nullif(nullif(btrim(v_ident ->> 'entreprise'), ''), 'null'), 120);
  v_fonction := left(nullif(nullif(btrim(v_ident ->> 'fonction'), ''), 'null'), 120);
  v_tel      := nullif(btrim(v_ident ->> 'telephone'), '');
  if v_tel !~ '^[0-9 +().-]{6,40}$' then v_tel := null; end if;
  v_ident := jsonb_strip_nulls(jsonb_build_object('prenom', v_prenom, 'nom', v_nom, 'entreprise', v_societe,
                                                  'fonction', v_fonction, 'telephone', v_tel));

  v_nature := case when v_r ->> 'nature' in ('humain','automatique','newsletter','spam') then v_r ->> 'nature' end;
  v_non_humain := v_nature in ('automatique','newsletter','spam');

  v_contact := e.contact_id;
  if v_non_humain then
    v_dec_contact := 'inchangee';
  elsif v_contact is not null then
    select * into c from public.contacts where id = v_contact;
    v_cat_avant := c.categorie_id;
    if c.categorie_id is null then
      update public.contacts set
        categorie_id = case when v_niveau = 'faible' then v_cat_av else v_cat end,
        categorie_source = 'ia', categorie_confiance = v_conf
      where id = c.id;
      v_dec_contact := case v_niveau when 'eleve' then 'appliquee' when 'moyen' then 'provisoire' else 'a_verifier' end;
      if v_niveau = 'moyen' then v_flags := array_append(v_flags, 'categorie_contact_provisoire'); end if;
    elsif c.categorie_id <> v_cat and v_cat <> v_cat_av then
      v_dec_contact := 'suggestion_conflit'; v_flags := array_append(v_flags, 'categorie_contact_divergente');
    else
      v_dec_contact := 'inchangee';
    end if;
    if v_niveau = 'eleve' then
      update public.contacts set
        fonction   = coalesce(fonction, v_fonction),
        phone      = coalesce(phone, v_tel),
        company_id = coalesce(company_id, case when v_societe is not null
                                                then public._mk_company(v_org, v_societe) end)
      where id = c.id;
    end if;
    if cardinality(v_manq) > 0 then
      update public.contacts set informations_manquantes = v_manq where id = c.id;
    end if;
    if c.statut_identite <> 'confirmee' then v_flags := array_append(v_flags, 'identite_a_confirmer'); end if;
  else
    begin v_suppose := nullif(v_r ->> 'contact_suppose_id', '')::uuid; exception when others then v_suppose := null; end;
    if v_suppose is not null and not exists (select 1 from public.contacts where id = v_suppose and organization_id = v_org) then
      v_suppose := null; v_flags := array_append(v_flags, 'contact_suppose_invalide');
    end if;

    if v_suppose is not null and v_niveau <> 'faible' then
      insert into public.contact_adresses_email (organization_id, contact_id, adresse_email, statut, source)
      values (v_org, v_suppose, e.expediteur_normalise, 'supposee', 'ia')
      on conflict (organization_id, adresse_normalisee) do nothing;
      v_contact := v_suppose; v_dec_contact := 'a_verifier';
      v_flags := array_append(v_flags, 'nouvelle_adresse_a_confirmer');
      select categorie_id into v_cat_avant from public.contacts where id = v_suppose;
    elsif v_niveau in ('eleve','moyen') then
      if v_cat = public._categorie_par_code(v_org, 'client') and v_niveau = 'eleve' then
        v_niveau := 'moyen'; v_flags := array_append(v_flags, 'client_inconnu_a_confirmer');
      end if;
      insert into public.contacts (organization_id, company_id, first_name, last_name, email, phone, source,
                                   categorie_id, categorie_source, categorie_confiance, fonction,
                                   statut_identite, informations_manquantes)
      values (v_org,
              case when v_societe is not null then public._mk_company(v_org, v_societe) end,
              coalesce(v_prenom, split_part(e.expediteur_normalise, '@', 1)), coalesce(v_nom, '—'),
              e.expediteur_normalise, v_tel, 'email', v_cat, 'ia', v_conf, v_fonction,
              case when v_niveau = 'eleve' then 'probable' else 'incertaine' end, v_manq)
      returning id into v_contact;
      v_nouveau := true;
      v_dec_contact := case when v_niveau = 'eleve' then 'appliquee' else 'provisoire' end;
      if v_niveau = 'moyen' then v_flags := array_append(v_flags, 'nouveau_contact_a_confirmer'); end if;
    else
      v_dec_contact := 'a_verifier'; v_flags := array_append(v_flags, 'expediteur_non_identifie');
    end if;
  end if;

  if v_niveau = 'faible' and not v_non_humain then v_flags := array_append(v_flags, 'confiance_faible'); end if;
  v_statut := case when v_non_humain then 'ignore'
                   when v_niveau = 'eleve' and cardinality(v_flags) = 0 then 'classe' else 'a_verifier' end;
  v_decision := case
    when v_non_humain then 'inchangee'
    when 'categorie_contact_divergente' = any (v_flags) then 'suggestion_conflit'
    when v_statut = 'classe' then 'appliquee'
    when v_niveau = 'moyen' then 'provisoire'
    else 'a_verifier' end;

  update public.emails set
    contact_id         = v_contact,
    type_message_id    = case when v_niveau = 'faible' then type_message_id else v_type end,
    confiance          = v_conf,
    niveau_confiance   = v_niveau,
    resume             = left(v_r ->> 'resume', 2000),
    nature_message     = coalesce(v_nature, case when nature_message = 'inconnu' then 'humain' else nature_message end),
    action_recommandee = v_action,
    points_a_verifier  = array(select distinct x from unnest(
                           array_cat(array(select y from unnest(points_a_verifier) y
                                            where y in ('pieces_jointes_non_importees','contenu_vide')), v_flags)) x),
    statut_traitement  = v_statut,
    analyse_le         = now(),
    derniere_erreur    = null
  where id = e.id;

  insert into public.historique_classification (
    organization_id, email_id, contact_id, cible, source, modele_ia, version_prompt,
    categorie_precedente_id, categorie_proposee_id, type_precedent_id, type_propose_id,
    confiance, niveau_confiance, decision, justification, resume, identite_supposee,
    informations_manquantes, action_recommandee, resultat_brut)
  values (
    v_org, e.id, v_contact, 'les_deux', 'ia', left(v_r ->> 'modele', 80), left(v_r ->> 'version_prompt', 40),
    v_cat_avant, v_cat, e.type_message_id, v_type,
    v_conf, v_niveau, v_decision, left(v_r ->> 'justification', 2000), left(v_r ->> 'resume', 2000),
    v_ident, v_manq, v_action,
    case when octet_length(v_brut::text) <= 50000 then v_brut end);

  perform public._journaliser(v_org, 'ia', null, 'email_classe', 'email', e.id,
            jsonb_build_object('decision', v_decision, 'niveau', v_niveau, 'nouveau_contact', v_nouveau));

  perform set_config('valtiq.source', '', true);
  perform set_config('valtiq.skip_log', '', true);

  return jsonb_build_object('ok', true, 'email_id', e.id, 'contact_id', v_contact, 'nouveau_contact', v_nouveau,
    'niveau_confiance', v_niveau, 'decision', v_decision, 'decision_contact', v_dec_contact,
    'statut_traitement', v_statut, 'points_a_verifier', to_jsonb(v_flags), 'action_recommandee', v_action,
    'nature_message', v_nature);
end $$;

create or replace function public.email_signaler_erreur(p_token text default null, p_email_id uuid default null, p_etape text default null, p_message text default null)
returns jsonb language plpgsql security definer
set search_path = public, extensions
as $$
declare v_org uuid; v_tentatives int;
begin
  v_org := public._org_depuis_jeton(p_token);
  if p_email_id is not null then
    update public.emails set
      statut_traitement = 'erreur', tentatives = tentatives + 1,
      derniere_erreur = left(coalesce(p_etape, 'inconnue') || ' : ' || coalesce(p_message, ''), 1000)
    where id = p_email_id and organization_id = v_org
    returning tentatives into v_tentatives;
    if not found then
      raise exception 'Email introuvable pour cette entreprise.' using errcode = '42501';
    end if;
  end if;
  insert into public.automation_runs (organization_id, rule_id, event_key, status, details)
  values (v_org, null, 'email:' || coalesce(p_email_id::text, 'sans_id') || ':erreur:' || gen_random_uuid(), 'failed',
          jsonb_build_object('email_id', p_email_id, 'etape', left(p_etape, 100), 'erreur', left(p_message, 1000)));
  return jsonb_build_object('ok', true, 'tentatives', v_tentatives);
end $$;

create or replace function public.piece_jointe_confirmer_stockage(p_token text default null, p_piece_id uuid default null, p_sha256 text default null)
returns jsonb language plpgsql security definer
set search_path = public, extensions
as $$
declare v_org uuid; pj public.pieces_jointes;
begin
  v_org := public._org_depuis_jeton(p_token);
  select * into pj from public.pieces_jointes where id = p_piece_id and organization_id = v_org for update;
  if not found then raise exception 'Pièce jointe introuvable pour cette entreprise.' using errcode = '42501'; end if;
  if pj.statut <> 'metadonnees' or pj.storage_chemin is null then
    raise exception 'Cette pièce jointe n''attend pas de fichier (statut %).', pj.statut;
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = pj.storage_bucket and o.name = pj.storage_chemin) then
    raise exception 'Fichier absent du stockage : %', pj.storage_chemin;
  end if;
  update public.pieces_jointes set statut = 'stockee', stockee_le = now(),
         empreinte_sha256 = case when lower(p_sha256) ~ '^[a-f0-9]{64}$' then lower(p_sha256) else empreinte_sha256 end
   where id = pj.id;
  return jsonb_build_object('ok', true, 'id', pj.id, 'statut', 'stockee');
end $$;

create or replace function public.email_recevoir_gmail(
  p_boite_mail text default null, p_message_id text default null, p_thread_id text default null,
  p_rfc_message_id text default null, p_en_reponse_a text default null, p_references text default null,
  p_expediteur_email text default null, p_expediteur_nom text default null,
  p_destinataires text default null, p_copie text default null,
  p_objet text default null, p_corps_texte text default null, p_corps_html text default null, p_recu_le text default null,
  p_libelles text default null, p_list_unsubscribe text default null, p_list_id text default null,
  p_precedence text default null, p_auto_submitted text default null, p_a_pieces_jointes text default null,
  p_token text default null)
returns jsonb language plpgsql security definer
set search_path = public, extensions
as $$
begin
  return public.email_ingest(p_token, jsonb_strip_nulls(jsonb_build_object(
    'boite_mail', p_boite_mail, 'fournisseur_message_id', p_message_id, 'fournisseur_thread_id', nullif(p_thread_id, ''),
    'rfc_message_id', nullif(p_rfc_message_id, ''), 'en_reponse_a', nullif(p_en_reponse_a, ''), 'references', nullif(p_references, ''),
    'expediteur_email', p_expediteur_email, 'expediteur_nom', nullif(btrim(p_expediteur_nom), ''),
    'destinataires', nullif(p_destinataires, ''), 'copie', nullif(p_copie, ''),
    'objet', p_objet, 'corps_texte', nullif(p_corps_texte, ''), 'corps_html', nullif(p_corps_html, ''),
    'recu_le', nullif(p_recu_le, ''),
    'libelles', case when coalesce(p_libelles, '') = '' then null
                     else to_jsonb(string_to_array(replace(p_libelles, ' ', ''), ',')) end,
    'entetes', jsonb_strip_nulls(jsonb_build_object(
                 'list-unsubscribe', nullif(p_list_unsubscribe, ''), 'list-id', nullif(p_list_id, ''),
                 'precedence', nullif(p_precedence, ''), 'auto-submitted', nullif(p_auto_submitted, ''))),
    'a_pieces_jointes', nullif(p_a_pieces_jointes, ''))));
end $$;

create or replace function public.email_classer(p_email_id uuid default null, p_reponse_ia text default null, p_token text default null)
returns jsonb language plpgsql security definer
set search_path = public, extensions
as $$
begin
  return public.email_appliquer_classification(p_token, p_email_id, to_jsonb(coalesce(p_reponse_ia, '')));
end $$;

revoke execute on function
  public.email_ingest(text, jsonb), public.email_contexte(text, uuid),
  public.email_appliquer_classification(text, uuid, jsonb), public.email_signaler_erreur(text, uuid, text, text),
  public.piece_jointe_confirmer_stockage(text, uuid, text),
  public.email_recevoir_gmail(text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text),
  public.email_classer(uuid, text, text)
from public, anon, authenticated;