# VALTIQ CRM — v0.3.1

Application React + TypeScript + Vite, reliée à Supabase (authentification et base de données).

## Démarrage
1. `npm install`
2. Copier `.env.example` en `.env` et renseigner `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`
   (clé « publishable » uniquement — jamais la clé secrète).
3. Base de données : exécuter, dans l'ordre, les fichiers de `supabase/migrations/` (voir `supabase/MIGRATIONS.md`),
   par exemple avec la CLI : `supabase link --project-ref <ref>` puis `supabase db push`.
   Tests : `supabase/rls_tests.sql` et `supabase/invitations_tests.sql`. Gardez « Confirm email » activé.
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

**Base de données (déjà appliquée sur Supabase par migration)** : `supabase/migrations/20261115152556_automations_v0_4.sql`.
- 3 automatisations : tâche de relance à la création d'un contact, journal d'activité au changement d'étape, alerte quotidienne (6h UTC) sur les opportunités sans mouvement depuis 14 jours.
- Activables/désactivables dans la page « Automatisations » (propriétaire/administrateur) ; journal des exécutions.

**RGPD** :
- Polices hébergées localement (aucune requête vers Google).
- Pages « Mentions légales » et « Politique de confidentialité » (`#/mentions-legales`, `#/confidentialite`), à compléter dans `src/legal.config.ts`.
- Case de consentement à l'inscription (date enregistrée).
- Export JSON des données de l'organisation (Paramètres) et suppression définitive d'un contact (Prospects).
- En-têtes de sécurité Netlify (`public/_headers`).

**À faire avant usage commercial** : compléter `legal.config.ts`, faire valider les textes par un juriste, signer un contrat de sous-traitance (art. 28) avec chaque client, tenir un registre des traitements. Non inclus : suppression de compte en libre-service (nécessite une Edge Function), politique de mot de passe renforcée (plan payant Supabase).


## Version 0.5.0 — Agenda, factures et intégration Make

**Base de données (déjà appliquée sur Supabase)** : `supabase/migrations/20261115210144_v0_5_make_integration.sql`
et `20261115210222_v0_5_1_mk_num_european_format.sql`.
- **Agenda** : rendez-vous par semaine, rendez-vous urgents mis en avant (badge dans le menu + alerte sur la vue d'ensemble).
- **Factures** : à payer / en retard / payées, total à encaisser, encaissé du mois.
- **Temps réel** : les données ajoutées par Make ou par un collègue apparaissent sans recharger la page.
- **Intégration Make** (Paramètres, propriétaire/administrateur) : une clé par organisation (stockée hachée, affichée une seule fois).
  Make appelle `POST {VITE_SUPABASE_URL}/rest/v1/rpc/make_ingest` avec l'en-tête `apikey` (clé publishable) et le corps
  `{"p_token": "...", "p_type": "contact|company|opportunity|appointment|invoice", "p_data": {...}}`.
  Dédoublonnage : `external_id`, puis email (contacts), nom (entreprises) ou numéro (factures).
  Chaque appel est journalisé dans la page Automatisations.


## Version 0.6.0 — Application en trois langues (ES / FR / EN)

- Sélecteur de langue **ES · FR · EN** : écran de connexion, menu latéral, Paramètres et pages légales.
  Le choix est mémorisé sur l'appareil ; par défaut, la langue du navigateur (espagnol si elle n'est ni le français ni l'anglais).
- Les textes sont écrits en français dans le code et servent de clé : `t("Texte français")`.
  Traductions dans `src/i18n.es.ts` et `src/i18n.en.ts`. Les valeurs venant de la base (étapes du pipeline, sources) passent par `tv()`.
  **Tout nouveau texte doit être ajouté aux deux fichiers**, sinon il s'affiche en français.
- Dates et montants au format de la langue choisie (es-ES, fr-FR, en-GB).
- Pages légales réécrites pour une société établie en **Espagne** (LSSI-CE, RGPD, LOPDGDD, AEPD), dans les trois langues,
  et complétées avec le traitement des emails classés par IA. Données à compléter dans `src/legal.config.ts`.


## Version 0.7.0 — Boîte de réception

Nouvelle page **Boîte de réception** pour suivre le module emails de l'équipe Automatisation (migrations v0.6 / v0.7) :
- Liste des emails reçus avec onglets À vérifier · Classés · Ignorés · Erreurs · Tous, et compteur « à vérifier » dans le menu.
- Détail : résumé et niveau de confiance de l'IA, points à vérifier, **ce qui a été créé dans le CRM** (note, tâche, rendez-vous, opportunité), texte de l'email et pièces jointes.
- Corrections via `corriger_classification` (type de message, contact, catégorie, confirmation d'identité) ; « Marquer comme traité » et « Ignorer ».
- RGPD : chaque ouverture d'email et de pièce jointe est journalisée via `journaliser_acces`.
- Aucune modification de la base ni des fonctions `email_*`.

À coordonner avec l'équipe Automatisation : pour un affichage **en direct** des nouveaux emails, ajouter la table `emails`
à la publication `supabase_realtime` (sinon ils apparaissent au rechargement de la page).
