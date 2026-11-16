do $do$
declare v_def text;
begin
  v_def := pg_get_functiondef('public._email_router_metier(uuid,uuid,jsonb)'::regprocedure);
  v_def := replace(v_def,
    '  -- 1. Interaction sur la fiche du contact',
    '  -- 0. Garde : message trop court ou sans demande explicite -> trace seulement, vérification humaine
  if char_length(regexp_replace(coalesce(e.corps_texte, ''''), ''\s'', '''', ''g'')) < 40 then
    insert into public.activities (organization_id, type, body, contact_id)
    values (p_org, ''email'', left(''Email reçu : '' || coalesce(nullif(e.objet, ''''), ''(sans objet)'') || E''\n'' || coalesce(e.extrait, ''''), 2000), e.contact_id)
    returning id into v_act;
    update public.emails set statut_traitement = ''a_verifier'',
      points_a_verifier = array(select distinct x from unnest(array_append(points_a_verifier, ''message_trop_court'')) x)
     where id = e.id;
    update public.automation_runs set details = jsonb_build_object(''email_id'', e.id, ''activite_id'', v_act, ''garde'', ''message_trop_court'')
     where id = v_run;
    return jsonb_build_object(''route'', false, ''raison'', ''message_trop_court'', ''activite_id'', v_act);
  end if;

  -- 1. Interaction sur la fiche du contact');
  execute v_def;
end $do$;