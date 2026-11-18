create or replace function public.corriger_classification(
  p_email_id uuid, p_type_code text default null, p_categorie_code text default null,
  p_contact_id uuid default null, p_confirmer_identite boolean default false, p_commentaire text default null)
returns jsonb language plpgsql security definer
set search_path = public
as $$
declare e public.emails; v_uid uuid := auth.uid(); v_type uuid; v_cat uuid; v_cat_avant uuid; v_contact uuid;
begin
  if v_uid is null then raise exception 'Authentification requise.' using errcode = '42501'; end if;
  select * into e from public.emails where id = p_email_id for update;
  if not found or not public.is_org_member(e.organization_id) or not public.peut_acceder_boite(e.boite_mail_id) then
    raise exception 'Email introuvable ou accès refusé.' using errcode = '42501';
  end if;
  perform set_config('valtiq.skip_log', 'on', true);

  v_contact := coalesce(p_contact_id, e.contact_id);
  if p_contact_id is not null then
    if not exists (select 1 from public.contacts where id = p_contact_id and organization_id = e.organization_id) then
      raise exception 'Contact introuvable dans cette entreprise.' using errcode = '42501';
    end if;
    insert into public.contact_adresses_email (organization_id, contact_id, adresse_email, statut, source)
    values (e.organization_id, p_contact_id, e.expediteur_normalise, 'confirmee', 'manuel')
    on conflict (organization_id, adresse_normalisee)
    do update set contact_id = excluded.contact_id, statut = 'confirmee';
    update public.emails set contact_id = p_contact_id where id = e.id;
  end if;

  if p_type_code is not null then
    v_type := public._type_par_code(e.organization_id, p_type_code);
    if v_type is null then raise exception 'Type de message inconnu : %', p_type_code; end if;
    update public.emails set type_message_id = v_type where id = e.id;
  end if;

  if p_categorie_code is not null then
    if v_contact is null then raise exception 'Aucun contact associé à cet email.'; end if;
    v_cat := public._categorie_par_code(e.organization_id, p_categorie_code);
    if v_cat is null then raise exception 'Catégorie inconnue : %', p_categorie_code; end if;
    select categorie_id into v_cat_avant from public.contacts where id = v_contact;
    update public.contacts set categorie_id = v_cat where id = v_contact;
  end if;

  if p_confirmer_identite and v_contact is not null then
    update public.contacts set statut_identite = 'confirmee' where id = v_contact;
    update public.contact_adresses_email set statut = 'confirmee'
     where organization_id = e.organization_id and adresse_normalisee = e.expediteur_normalise;
  end if;

  update public.emails set
    statut_traitement = case when statut_traitement in ('a_verifier','erreur','recu') then 'classe' else statut_traitement end,
    points_a_verifier = '{}'
  where id = e.id;

  insert into public.historique_classification (organization_id, email_id, contact_id, cible, source, auteur_id,
    categorie_precedente_id, categorie_proposee_id, type_precedent_id, type_propose_id, decision, justification)
  values (e.organization_id, e.id, v_contact,
          case when p_categorie_code is not null and p_type_code is not null then 'les_deux'
               when p_categorie_code is not null then 'contact' else 'message' end,
          'humain', v_uid, v_cat_avant, v_cat, e.type_message_id, coalesce(v_type, e.type_message_id),
          'correction', left(p_commentaire, 2000));

  perform public._journaliser(e.organization_id, 'utilisateur', v_uid, 'classification_corrigee', 'email', e.id,
            jsonb_build_object('type', p_type_code, 'categorie', p_categorie_code, 'contact_id', p_contact_id));
  perform set_config('valtiq.skip_log', '', true);
  return jsonb_build_object('ok', true, 'email_id', e.id, 'contact_id', v_contact);
end $$;

create or replace function public.journaliser_acces(p_entite_type text, p_entite_id uuid, p_action text default 'consultation')
returns void language plpgsql security definer
set search_path = public
as $$
declare v_org uuid;
begin
  if auth.uid() is null then raise exception 'Authentification requise.' using errcode = '42501'; end if;
  if p_action not in ('consultation','telechargement','export','impression') then
    raise exception 'Action inconnue : %', p_action;
  end if;
  if p_entite_type = 'email' then
    select organization_id into v_org from public.emails e where e.id = p_entite_id and public.peut_acceder_boite(e.boite_mail_id);
  elsif p_entite_type = 'piece_jointe' then
    select pj.organization_id into v_org from public.pieces_jointes pj join public.emails e on e.id = pj.email_id
     where pj.id = p_entite_id and public.peut_acceder_boite(e.boite_mail_id);
  elsif p_entite_type = 'contact' then
    select organization_id into v_org from public.contacts where id = p_entite_id and public.is_org_member(organization_id);
  end if;
  if v_org is null then raise exception 'Élément introuvable ou accès refusé.' using errcode = '42501'; end if;
  perform public._journaliser(v_org, 'utilisateur', auth.uid(), p_action, p_entite_type, p_entite_id, '{}'::jsonb, true);
end $$;

create or replace function public.exporter_donnees_contact(p_contact_id uuid)
returns jsonb language plpgsql security definer
set search_path = public
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
    'emails', coalesce((select jsonb_agg(jsonb_build_object('recu_le', e.recu_le, 'objet', e.objet, 'expediteur', e.expediteur_normalise,
                                 'destinataires', e.destinataires, 'corps_texte', e.corps_texte, 'resume', e.resume,
                                 'pieces_jointes', (select coalesce(jsonb_agg(pj.nom_fichier), '[]'::jsonb)
                                                      from public.pieces_jointes pj where pj.email_id = e.id))
                                 order by e.recu_le)
                          from public.emails e where e.contact_id = c.id), '[]'::jsonb),
    'classifications', coalesce((select jsonb_agg(jsonb_build_object('le', h.created_at, 'source', h.source, 'decision', h.decision,
                                   'justification', h.justification) order by h.created_at)
                                 from public.historique_classification h where h.contact_id = c.id), '[]'::jsonb))
  into v from public.contacts c where c.id = p_contact_id;
  perform public._journaliser(v_org, 'utilisateur', auth.uid(), 'export', 'contact', p_contact_id, '{}'::jsonb, true);
  return v;
end $$;

create or replace function public.effacer_donnees_contact(p_contact_id uuid, p_supprimer_fiche boolean default false)
returns jsonb language plpgsql security definer
set search_path = public
as $$
declare v_org uuid; v_emails int; v_fiche text;
begin
  select organization_id into v_org from public.contacts where id = p_contact_id;
  if v_org is null or not public.has_org_role(v_org, array['owner']::public.member_role[]) then
    raise exception 'Action réservée aux propriétaires de l''entreprise.' using errcode = '42501';
  end if;
  perform set_config('valtiq.skip_log', 'on', true);

  with cible as (
    select e.id from public.emails e
     where e.organization_id = v_org
       and (e.contact_id = p_contact_id
            or e.expediteur_normalise in (select adresse_normalisee from public.contact_adresses_email
                                           where contact_id = p_contact_id))
  ), del as (delete from public.emails e using cible where e.id = cible.id returning 1)
  select count(*) into v_emails from del;

  delete from public.conversations cv
   where cv.contact_id = p_contact_id and not exists (select 1 from public.emails e where e.conversation_id = cv.id);
  delete from public.historique_classification where contact_id = p_contact_id;
  delete from public.contact_adresses_email where contact_id = p_contact_id;

  if p_supprimer_fiche then
    delete from public.contacts where id = p_contact_id;
    v_fiche := 'supprimee';
  else
    update public.contacts set first_name = 'Contact', last_name = 'anonymisé', email = null, phone = null,
           fonction = null, external_id = null, informations_complementaires = '{}'::jsonb,
           informations_manquantes = '{}', statut_identite = 'incertaine'
     where id = p_contact_id;
    v_fiche := 'anonymisee';
  end if;

  perform public._journaliser(v_org, 'utilisateur', auth.uid(), 'effacement_rgpd', 'contact', p_contact_id,
            jsonb_build_object('emails_supprimes', v_emails, 'fiche', v_fiche), true);
  perform set_config('valtiq.skip_log', '', true);
  return jsonb_build_object('ok', true, 'emails_supprimes', v_emails, 'fiche', v_fiche);
end $$;

create or replace function public.purger_donnees_expirees()
returns jsonb language plpgsql security definer
set search_path = public
as $$
declare v_emails int; v_pj int;
begin
  with del as (delete from public.emails where supprimer_apres < now() returning 1)
  select count(*) into v_emails from del;

  with maj as (
    update public.pieces_jointes pj set statut = 'a_supprimer'
      from public.organizations o
      left join public.parametres_messagerie p on p.organization_id = o.id
     where pj.organization_id = o.id and pj.statut = 'stockee'
       and pj.created_at < now() - make_interval(days => coalesce(p.conservation_pieces_jointes_jours, 365))
    returning 1)
  select count(*) into v_pj from maj;

  return jsonb_build_object('emails_supprimes', v_emails, 'pieces_jointes_a_supprimer', v_pj, 'le', now());
end $$;

create or replace function public.fichiers_a_effacer()
returns table (bucket text, chemin text)
language sql stable security definer
set search_path = public
as $$
  select o.bucket_id, o.name
    from storage.objects o
   where o.bucket_id = 'pieces-jointes'
     and not exists (select 1 from public.pieces_jointes pj
                      where pj.storage_bucket = o.bucket_id and pj.storage_chemin = o.name
                        and pj.statut in ('metadonnees','stockee'))
$$;

revoke execute on function
  public.corriger_classification(uuid, text, text, uuid, boolean, text),
  public.journaliser_acces(text, uuid, text),
  public.exporter_donnees_contact(uuid), public.effacer_donnees_contact(uuid, boolean),
  public.purger_donnees_expirees(), public.fichiers_a_effacer()
from public, anon, authenticated;