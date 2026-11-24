# VALTIQ CRM — v0.10.0

CRM multi-organisation en React + TypeScript + Vite, relié à Supabase (authentification, base de données, temps réel).
Les données arrivent aussi par Make (scénarios de l'équipe Automatisation).

## Démarrage
1. `npm install`
2. Copier `.env.example` en `.env` et renseigner `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`
   (clé « publishable » uniquement — jamais la clé secrète).
3. Base de données : exécuter, dans l'ordre, les fichiers de `supabase/migrations/` (voir `supabase/MIGRATIONS.md`),
   par exemple avec la CLI : `supabase link --project-ref <ref>` puis `supabase db push`.
   Tests : `supabase/rls_tests.sql` et `supabase/invitations_tests.sql`. Gardez « Confirm email » activé.
4. `npm run dev` puis ouvrir http://localhost:5173 — `npm run build` produit `dist/` pour Netlify.

## Fonctionnalités
- Comptes : inscription, connexion, mot de passe oublié, organisation, invitations d'équipe, rôles propriétaire / admin / commercial
- Prospects (entreprises + contacts), pipeline d'opportunités, tâches et relances — création, modification, suppression, filtres
- Agenda (rendez-vous urgents mis en avant) et factures (à payer, en retard, payées)
- Boîte de réception : emails classés par IA (module de l'équipe Automatisation), corrections, pièces jointes
- Automatisations : tâche de premier contact, journal des changements d'étape, relance des opportunités inactives (6 h UTC)
- Intégration Make par clé d'organisation ; données mises à jour en temps réel
- Français (langue officielle, par défaut) + espagnol et anglais au choix ; pages légales Espagne, export RGPD et suppression de contact

## Organisation du code
| Dossier / fichier | Contenu |
|---|---|
| `src/App.tsx` | Session, chargement des données, navigation, fenêtres de saisie |
| `src/components/Pages.tsx` | Tableau de bord, prospects, pipeline, tâches, automatisations, assistant, paramètres |
| `src/components/Business.tsx` | Agenda, factures, intégration Make |
| `src/components/Inbox.tsx` | Boîte de réception |
| `src/components/Modals.tsx` | Formulaires de création et de modification |
| `src/components/AuthScreens.tsx`, `LegalPages.tsx`, `LangSwitch.tsx`, `ErrorBoundary.tsx` | Connexion, pages légales, choix de langue, écran d'erreur |
| `src/lib/api.ts` | Tous les appels à Supabase |
| `src/lib/format.ts` | Formatage des dates et montants |
| `src/i18n*.ts` | Traductions (le français sert de clé) |
| `supabase/migrations/` | Migrations de la base, au format CLI Supabase |
| `docs/` | Sécurité, vérifications et décisions |

## Historique des versions

### Version 0.4.0 — Automatisations et RGPD

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


### Version 0.5.0 — Agenda, factures et intégration Make

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


### Version 0.6.0 — Application en trois langues (ES / FR / EN)

- Sélecteur de langue **ES · FR · EN** : écran de connexion, menu latéral, Paramètres et pages légales.
  Le choix est mémorisé sur l'appareil ; par défaut, la langue du navigateur (espagnol si elle n'est ni le français ni l'anglais).
- Les textes sont écrits en français dans le code et servent de clé : `t("Texte français")`.
  Traductions dans `src/i18n.es.ts` et `src/i18n.en.ts`. Les valeurs venant de la base (étapes du pipeline, sources) passent par `tv()`.
  **Tout nouveau texte doit être ajouté aux deux fichiers**, sinon il s'affiche en français.
- Dates et montants au format de la langue choisie (es-ES, fr-FR, en-GB).
- Pages légales réécrites pour une société établie en **Espagne** (LSSI-CE, RGPD, LOPDGDD, AEPD), dans les trois langues,
  et complétées avec le traitement des emails classés par IA. Données à compléter dans `src/legal.config.ts`.


### Version 0.7.0 — Boîte de réception

Nouvelle page **Boîte de réception** pour suivre le module emails de l'équipe Automatisation (migrations v0.6 / v0.7) :
- Liste des emails reçus avec onglets À vérifier · Classés · Ignorés · Erreurs · Tous, et compteur « à vérifier » dans le menu.
- Détail : résumé et niveau de confiance de l'IA, points à vérifier, **ce qui a été créé dans le CRM** (note, tâche, rendez-vous, opportunité), texte de l'email et pièces jointes.
- Corrections via `corriger_classification` (type de message, contact, catégorie, confirmation d'identité) ; « Marquer comme traité » et « Ignorer ».
- RGPD : chaque ouverture d'email et de pièce jointe est journalisée via `journaliser_acces`.
- Aucune modification de la base ni des fonctions `email_*`.

À coordonner avec l'équipe Automatisation : pour un affichage **en direct** des nouveaux emails, ajouter la table `emails`
à la publication `supabase_realtime` (sinon ils apparaissent au rechargement de la page).


### Version 0.8.0 — Sécurité et organisation

- Fonctions de la base sécurisées (migration v0.8), tests de sécurité documentés dans `docs/securite.md`.
- Migrations rangées dans `supabase/migrations/` (copies exactes de la base) ; relances planifiées versionnées.
- Chargement des données plus rapide (toutes les requêtes en parallèle) ; formatage des montants et dates centralisé ;
  code et styles inutilisés retirés ; la compilation refuse désormais les variables inutilisées.
- Le français devient la langue officielle : langue par défaut du site et des emails ; ES et EN restent disponibles
  (sélecteur FR · ES · EN, choix mémorisé sur l'appareil et dans le compte).


### Version 0.9.0 — Modifier, supprimer, filtrer

- **Modifier** prospects, opportunités, tâches, rendez-vous et factures (bouton crayon, formulaire pré-rempli) — tous les rôles.
- **Supprimer** ces éléments (bouton corbeille, avec confirmation) — propriétaires et administrateurs uniquement, comme l'impose la base.
  Supprimer un contact ou une opportunité supprime aussi ses tâches et son historique.
- Prospects : filtre par statut et affichage par pages de 50. Tâches : onglets À faire · Terminées · Toutes.
- Écran d'erreur global : en cas de plantage, message clair et bouton « Recharger la page » au lieu d'une page blanche.


### Version 0.10.0 — Confidentialité des boîtes mail privées

- Base (migration v0.10, validée par l'équipe Automatisation) : le contenu d'un email d'une boîte privée n'est plus
  recopié dans les fiches partagées ; l'export RGPD ne contient que les emails autorisés ; seul le propriétaire de
  l'organisation peut changer la visibilité ou le propriétaire d'une boîte ; nouveaux emails affichés en temps réel.
- Site : politique de sécurité du contenu (CSP) ; serveur de développement limité à l'ordinateur local.
