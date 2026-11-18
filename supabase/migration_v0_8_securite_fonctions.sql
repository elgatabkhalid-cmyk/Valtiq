-- =====================================================================
-- VALTIQ — migration v0.8 : sécurité des fonctions (L3-01, L3-02)
-- À exécuter UNE SEULE FOIS, après migration_v0_7_1_routage_garde_message_court.sql.
--
-- 1. search_path de chaque fonction SECURITY DEFINER du schéma public : pg_temp ajouté en
--    dernière position, pour qu'aucun objet temporaire ne puisse masquer une table ou une fonction.
-- 2. Les 8 fonctions appelées par Make restent exécutables par anon (Make utilise la clé publique)
--    mais plus par authenticated : le CRM ne les appelle pas.
-- 3. Fonctions d'administration et de déclencheur : plus exécutables par anon ni authenticated.
-- Aucune modification du code des fonctions ni des données.
-- =====================================================================

-- 1. search_path : on garde la liste existante et on ajoute pg_temp à la fin
do $$
declare
  f record;
  v_path text;
begin
  for f in
    select p.oid, p.oid::regprocedure as sig,
           coalesce((select substr(c, 13) from unnest(p.proconfig) c where c like 'search_path=%'), 'public') as path
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
  loop
    if f.path !~ '(^|,\s*)pg_temp\s*$' then
      v_path := f.path || ', pg_temp';
      execute format('alter function %s set search_path = %s', f.sig, v_path);
    end if;
  end loop;
end $$;

-- 2. Fonctions appelées par Make : anon uniquement
revoke execute on function
  public.make_ingest(text, text, jsonb),
  public.email_ingest(text, jsonb),
  public.email_contexte(text, uuid),
  public.email_appliquer_classification(text, uuid, jsonb),
  public.email_signaler_erreur(text, uuid, text, text),
  public.piece_jointe_confirmer_stockage(text, uuid, text),
  public.email_recevoir_gmail(text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text),
  public.email_classer(uuid, text, text)
from public, authenticated;

grant execute on function
  public.make_ingest(text, text, jsonb),
  public.email_ingest(text, jsonb),
  public.email_contexte(text, uuid),
  public.email_appliquer_classification(text, uuid, jsonb),
  public.email_signaler_erreur(text, uuid, text, text),
  public.piece_jointe_confirmer_stockage(text, uuid, text),
  public.email_recevoir_gmail(text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text),
  public.email_classer(uuid, text, text)
to anon;

-- 3. Administration et déclencheurs : personne côté API
revoke execute on function public.rls_auto_enable()    from public, anon, authenticated;
revoke execute on function public.invoices_sync_paid() from public, anon, authenticated;
