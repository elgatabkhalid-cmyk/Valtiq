# Sécurité de la base Supabase — VALTIQ

Rédigé le 18/11/2026 par Khalid (tâches L3-01, L3-02, L3-04, L3-15). Projet `znzdvhfczkhyubkjqvow` (« Valtiq »).
Mettre ce document à jour à chaque migration qui ajoute ou modifie une fonction.

## Principes

- **La sécurité est dans la base, pas dans l'interface.** Toutes les tables ont la RLS ; le CRM n'utilise que la clé
  publique. Masquer un bouton dans le CRM n'est jamais la seule protection.
- **Make n'a pas de compte utilisateur.** Il appelle 8 fonctions avec la clé publique (rôle `anon`) et un **jeton
  d'intégration par organisation**, stocké haché (SHA-256). Le jeton est vérifié avant toute lecture ou écriture, et
  l'organisation vient toujours du jeton, jamais d'un paramètre.
- **Fonctions SECURITY DEFINER** : toutes ont un `search_path` fixe terminé par `pg_temp` (migration v0.8).
- **Aucune clé secrète** (`service_role`, `sb_secret_`) dans le CRM, GitHub, Netlify ou Make.

## Fonctions exposées et contrôles

### Appelées par Make (rôle `anon`, jeton obligatoire)

| Fonction | Contrôle |
| --- | --- |
| `make_ingest` | Jeton haché comparé à `integration_tokens` ; écrit uniquement dans l'organisation du jeton |
| `email_recevoir_gmail` → `email_ingest` | Jeton (`_org_depuis_jeton`) ; la boîte mail doit appartenir à l'organisation du jeton |
| `email_contexte` | Jeton ; l'e-mail doit appartenir à l'organisation du jeton |
| `email_classer` → `email_appliquer_classification` | Jeton ; l'e-mail doit appartenir à l'organisation du jeton |
| `email_signaler_erreur` | Jeton ; l'e-mail doit appartenir à l'organisation du jeton |
| `piece_jointe_confirmer_stockage` | Jeton ; la pièce jointe doit appartenir à l'organisation du jeton |

Le jeton peut aussi être passé dans l'en-tête `x-valtiq-token` (fonctions `email_*`). Ces fonctions ne sont plus
exécutables par `authenticated` (le CRM ne les appelle pas).

### Appelées par le CRM (rôle `authenticated`)

| Fonction | Contrôle |
| --- | --- |
| `accept_invitations` | Uniquement les invitations adressées à l'email de l'utilisateur connecté, et seulement si cet email est confirmé |
| `create_organization` | Utilisateur connecté ; il devient owner de la nouvelle organisation |
| `create_integration_token`, `revoke_integration_token`, `integration_token_info` | Rôle owner ou admin de l'organisation |
| `corriger_classification` | Membre de l'organisation de l'e-mail et accès à sa boîte mail |
| `journaliser_acces` | Accès à l'élément consulté (boîte mail, organisation) |
| `exporter_donnees_contact` | Rôle owner ou admin |
| `effacer_donnees_contact` | Rôle owner uniquement |

### Utilisées par les politiques RLS (rôle `authenticated`)

| Fonction | Contrôle |
| --- | --- |
| `is_org_member`, `has_org_role` | Ne répondent que pour `auth.uid()` |
| `peut_acceder_boite` | Membre de l'organisation ; boîte « privée » réservée à son propriétaire et aux owners |

### Internes (aucun accès API)

`_org_depuis_jeton`, `_hash_token`, `_mk_*`, `_categorie_par_code`, `_type_par_code`, `_contexte_email`,
`_email_router_metier`, `_journaliser`, `_parametres_messagerie`, `purger_donnees_expirees`, `fichiers_a_effacer`
(rôle `service_role` / tâches planifiées) et toutes les fonctions de déclencheur (`trg_*`, `automation_*`,
`handle_new_user`, `protect_last_owner`, `invitations_before_insert`, `invoices_sync_paid`), plus `rls_auto_enable`.

## Résultats des tests (18/11/2026)

Tests exécutés directement dans la base avec les rôles `anon` et `authenticated`, sur des organisations et des
comptes de test supprimés ensuite (base revenue à 3 organisations et 3 comptes).

### L3-01 — 8 fonctions × 3 cas : 24/24 refusés

| Cas | Résultat |
| --- | --- |
| Sans jeton | 8/8 refusés : « Clé d'intégration manquante ou invalide » |
| Jeton faux | 8/8 refusés : « Clé d'intégration invalide » |
| Jeton d'une autre organisation | 7/7 refusés (« introuvable pour cette entreprise ») ; `make_ingest` n'écrit que dans l'organisation de son propre jeton (0 ligne arrivée dans l'autre) |
| Rôle `authenticated` | Refusé : `permission denied` |

### L3-02 — Rôles appliqués par la base

| Action | owner | admin | sales | autre organisation |
| --- | --- | --- | --- | --- |
| Créer un jeton d'intégration | oui | oui | refusé | refusé |
| Exporter un contact | oui | oui | refusé | refusé |
| Effacement RGPD d'un contact | oui | refusé | refusé | refusé |
| Corriger la classification d'un e-mail | oui | oui | oui | refusé |
| Supprimer un contact | oui | oui | refusé | refusé |
| Lire les contacts | oui | oui | oui | 0 visible |

Une organisation ne peut pas perdre son dernier owner (`protect_last_owner`), constaté pendant les tests.

### L3-04 — Pièces jointes

Bucket `pieces-jointes` **privé**, 25 Mo maximum par fichier. Un fichier n'est visible que si sa ligne dans
`pieces_jointes` est visible par l'utilisateur (RLS : membre de l'organisation) et au statut `stockee`.
Test : membre de l'organisation propriétaire = 1 fichier visible ; membre d'une autre organisation = 0 ;
anonyme = 0. Le CRM télécharge par URL signée valable 2 minutes et journalise chaque téléchargement.

## Boîtes mail privées — v0.10 (24/11/2026)

Correction de deux failles relevées par l'audit externe du 18/11/2026, validée par l'équipe Automatisation.
Une boîte `privee` n'est visible que par son propriétaire et par l'owner de l'organisation (`peut_acceder_boite`).

| Faille | Correction |
| --- | --- |
| `_email_router_metier` recopiait objet, résumé, extrait et expéditeur d'un email privé dans des fiches lisibles par tous | Boîte privée : aucune recopie ; seule une tâche neutre « Email reçu dans une boîte privée » est créée pour le propriétaire de la boîte |
| `exporter_donnees_contact` (admin) exportait les emails de toutes les boîtes | Seuls les emails des boîtes accessibles sont exportés ; `emails_non_exportes` indique combien ont été écartés |
| Un admin pouvait changer `visibilite` ou `proprietaire_id` d'une boîte et se donner accès | Trigger `boites_mail_confidentialite` : réservé à l'owner (les appels serveur sans utilisateur restent permis) |

Tests du 24/11/2026 (boîte privée de test, transaction annulée) : 13/13 conformes — aucune fiche partagée ne contient
le contenu privé ; boîte équipe inchangée ; export admin 1 email sur 2 sans contenu privé ; export owner 2 sur 2 ;
admin refusé pour la visibilité et le propriétaire, autorisé pour le libellé ; admin sans lecture de l'email privé ;
owner autorisé ; commercial refusé à l'export.

Point restant, hors périmètre de l'audit : la création automatique d'un contact à partir de l'expéditeur
(`email_appliquer_classification`) fonctionne aussi pour une boîte privée ; le nom et l'adresse de l'expéditeur
deviennent alors une fiche contact partagée. À décider avec l'équipe Automatisation avant d'ouvrir des boîtes privées.

## En-têtes HTTP du site

`public/_headers` : `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` et, depuis
la v0.10, une **Content-Security-Policy** : scripts, styles et polices du site uniquement ; connexions limitées au site
et à `*.supabase.co` (HTTPS et WebSocket) ; aucune intégration dans un cadre. Vérifiée le 24/11/2026 sur toutes les
pages (FR / ES / EN, mobile, pages légales, connexion) : aucune violation.
Le serveur de développement (`npm run dev`) n'écoute plus que sur l'ordinateur local.

## Alertes Supabase conservées (L3-15)

Relancées le 18/11/2026 après la migration v0.8 : 21 alertes WARN de sécurité (29 avant), toutes justifiées.
Inchangées après la v0.10 (24/11/2026).

| Alerte | Nombre | Justification |
| --- | --- | --- |
| `anon_security_definer_function_executable` | 8 | Voulu : ce sont les 8 fonctions appelées par Make, protégées par jeton (tests ci-dessus) |
| `authenticated_security_definer_function_executable` | 12 | Voulu : fonctions du CRM et de la RLS, chacune contrôle le rôle ou l'appartenance (tests ci-dessus) |
| `auth_leaked_password_protection` | 1 | Nécessite un plan payant Supabase : à activer en L3-03 après le choix du plan (L2-02) |
| `rls_enabled_no_policy` (INFO) | 1 | Voulu : `integration_tokens` n'est accessible que par les fonctions ci-dessus |
| `unindexed_foreign_keys`, `unused_index` (INFO, performance) | 50 | Sans effet avec le volume actuel ; à revoir dès qu'une base client dépasse quelques milliers de lignes |

## Procédure de rotation d'un jeton d'intégration (L5-07, L11-07)

À faire tous les 6 mois, en fin de contrat, ou dès qu'un jeton a pu fuir (capture d'écran, export de scénario).

1. Khalid ouvre le CRM de l'organisation → Paramètres → Intégration Make → **Générer une nouvelle clé**.
   L'ancienne cesse de fonctionner immédiatement.
2. Khalid dépose la nouvelle clé dans le gestionnaire de mots de passe (jamais par message).
3. Soufyane remplace la clé dans la connexion Make du client et lance une exécution test.
4. Vérifier dans le CRM (Paramètres) la date du « dernier appel », et dans Automatisations qu'aucun appel n'échoue.
5. Noter la date de rotation dans le projet central de pilotage.
