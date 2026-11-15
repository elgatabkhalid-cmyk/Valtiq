# VALTIQ CRM — v0.3.1

Application React + TypeScript + Vite, reliée à Supabase (authentification et base de données).

## Démarrage
1. `npm install`
2. Copier `.env.example` en `.env` et renseigner `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`
   (clé « publishable » uniquement — jamais la clé secrète).
3. Dans Supabase (SQL Editor) : exécuter `supabase/schema_v0_2.sql`, puis `supabase/rls_tests.sql`.
   Pour les invitations d'équipe : exécuter ensuite `supabase/migration_v0_3_invitations.sql`
   puis `supabase/invitations_tests.sql`. Gardez « Confirm email » activé.
4. `npm run dev` puis ouvrir http://localhost:5173

## Ce qui fonctionne (v0.3)
- Inscription, connexion, déconnexion, création de l'organisation
- Prospects (entreprises + contacts), opportunités (pipeline), tâches : création et mise à jour réelles
- Isolation des données par organisation (RLS)
- Invitations d'équipe par email (sans envoi d'email : le collègue rejoint l'organisation à sa connexion)

## Pas encore disponible
- Automatisations (moteur serveur), assistant IA, envoi d'emails, retrait de membres depuis l'interface, import/export

## Notes
- Si l'inscription demande une confirmation par email : Supabase > Authentication > Providers > Email
  permet de désactiver « Confirm email » pendant les tests.
- Statut : le code n'a pas été compilé ni testé par son auteur avant livraison. Lancer `npm run build`.


## Version 0.4.0 — Automatisations et RGPD

**Base de données (déjà appliquée sur Supabase par migration)** : `supabase/migration_v0_4_automations.sql`
(si vous recréez un projet : exécuter schema_v0_2, migration_v0_3_invitations, puis migration_v0_4_automations).
- 3 automatisations : tâche de relance à la création d'un contact, journal d'activité au changement d'étape, alerte quotidienne (6h UTC) sur les opportunités sans mouvement depuis 14 jours.
- Activables/désactivables dans la page « Automatisations » (propriétaire/administrateur) ; journal des exécutions.

**RGPD** :
- Polices hébergées localement (aucune requête vers Google).
- Pages « Mentions légales » et « Politique de confidentialité » (`#/mentions-legales`, `#/confidentialite`), à compléter dans `src/legal.config.ts`.
- Case de consentement à l'inscription (date enregistrée).
- Export JSON des données de l'organisation (Paramètres) et suppression définitive d'un contact (Prospects).
- En-têtes de sécurité Netlify (`public/_headers`).

**À faire avant usage commercial** : compléter `legal.config.ts`, faire valider les textes par un juriste, signer un contrat de sous-traitance (art. 28) avec chaque client, tenir un registre des traitements. Non inclus : suppression de compte en libre-service (nécessite une Edge Function), politique de mot de passe renforcée (plan payant Supabase).
