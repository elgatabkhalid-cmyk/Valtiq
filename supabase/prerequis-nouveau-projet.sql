-- VALTIQ — prérequis d'un NOUVEAU projet Supabase (un par client, décision D-10).
-- À exécuter UNE fois dans le SQL Editor du nouveau projet, AVANT `supabase db push`.
-- Ce fichier n'est pas une migration : il reproduit deux réglages du projet « Valtiq » qui ne figurent dans aucune
-- migration. Sans lui, l'installation s'arrête (constaté le 24/11/2026 sur un projet vierge) :
--   - migration 20261115232142 : « schema "cron" does not exist »
--   - migration 20261118140016 : « function public.rls_auto_enable() does not exist »
-- Idempotent : peut être relancé sans risque.

-- 1. Tâches planifiées (purge RGPD des emails, relances des opportunités inactives)
create extension if not exists pg_cron;

-- 2. Protection RLS activée automatiquement sur toute nouvelle table du schéma public
--    (option « RLS automatique » cochée à la création du projet Valtiq ; copie exacte de sa fonction)
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  cmd record;
  tbl name;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        SELECT c.relname INTO tbl FROM pg_catalog.pg_class c WHERE c.oid = cmd.objid;
        EXECUTE format('alter table if exists %I.%I enable row level security', cmd.schema_name, tbl);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

do $$
begin
  if not exists (select 1 from pg_event_trigger where evtname = 'ensure_rls') then
    create event trigger ensure_rls on ddl_command_end execute function public.rls_auto_enable();
  end if;
end $$;
