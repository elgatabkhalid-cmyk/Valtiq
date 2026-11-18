-- VALTIQ v0.8.1 : planification des relances d'opportunités inactives (règle STALE_DEAL_ALERT).
-- Le job existait déjà sur la base (créé hors migration) ; cette migration le versionne.
-- Idempotent : cron.schedule met à jour un job existant portant le même nom.
create extension if not exists pg_cron;
select cron.schedule('valtiq-stale-deal-alerts', '0 6 * * *', 'select public.run_stale_deal_alerts()');