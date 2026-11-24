# Mettre en service un nouveau client

Décision D-10 (24/11/2026, Khalid et Soufyane) : **chaque client a son propre projet Supabase et son propre site
Netlify**, construits depuis le même dépôt GitHub. Aucune donnée d'un client n'est stockée dans la base d'un autre.
Le projet « Valtiq » actuel sert au développement et à la démo ; il ne reçoit aucune donnée de vrai client.

Durée estimée : 30 à 45 minutes. Qui : Khalid (base, site), puis Soufyane (Make).

## Avant de commencer

- Plan Supabase : sur l'offre gratuite, un compte est limité à 2 projets actifs, et un projet inactif pendant une
  semaine est mis en pause. Pour un client réel, prévoir l'offre Pro : chaque projet supplémentaire y est facturé
  à part. Tarifs à vérifier sur supabase.com/pricing (décision L2-02).
- Nom court du client, en minuscules sans espace, par exemple `clinica-sol`. Il sert partout ci-dessous.
- Serveur d'envoi d'e-mails (SMTP) : nécessaire pour que les vrais utilisateurs reçoivent les e-mails de
  confirmation et de mot de passe oublié (voir `supabase/email-templates/README.md`).

## 1. Base de données (Supabase)

1. supabase.com → **New project** : nom `valtiq-<client>`, région **Europe (Paris ou Francfort)**, mot de passe de
   base généré et rangé dans le gestionnaire de mots de passe (jamais dans le dépôt).
2. **SQL Editor** : coller et exécuter `supabase/prerequis-nouveau-projet.sql`. Il active pg_cron et la protection
   RLS automatique, deux réglages du projet « Valtiq » absents des migrations. Sans ce script, l'installation
   s'arrête à la migration 12 (« schema "cron" does not exist »), puis à la 15 (`rls_auto_enable()` introuvable).
3. Installer le schéma depuis le dépôt, avec la CLI Supabase :
   ```bash
   supabase link --project-ref <ref-du-projet>
   ```
   ```bash
   supabase db push
   ```
   Les 17 fichiers de `supabase/migrations/` sont appliqués dans l'ordre.
4. Vérifier : **Database → Advisors → Security** doit montrer les mêmes alertes que celles justifiées dans
   `docs/securite.md`, et rien d'autre.
5. **Authentication → Sign In / Providers → Email** : laisser « Confirm email » activé.
6. **Authentication → URL Configuration** : *Site URL* = l'adresse du site du client (étape 2) ; *Redirect URLs* =
   cette même adresse suivie de `/**`. Aucune autre adresse.
7. **Authentication → Emails** : après configuration du SMTP, coller les 3 modèles de `supabase/email-templates/`.
8. **Project Settings → API Keys** : noter l'URL du projet et la clé **publishable** (`sb_publishable_…`).
   Ne jamais utiliser la clé secrète dans le site.

## 2. Site (Netlify)

1. app.netlify.com → **Add new project → Import an existing project → GitHub** → dépôt `valtiq`, branche `main`.
2. Build command `npm run build`, publish directory `dist`.
3. **Environment variables**, au niveau **du site** (pas de l'équipe) :
   - `VITE_SUPABASE_URL` = l'URL du projet du client
   - `VITE_SUPABASE_ANON_KEY` = sa clé publishable

   Attention : les variables du premier site sont aujourd'hui définies au niveau de l'équipe Netlify. Elles
   s'appliqueraient à tous les nouveaux sites et les relieraient à la mauvaise base. Les déplacer au niveau du site
   `valtiqz` avant de créer le deuxième site.
4. Nom du site : `valtiq-<client>` ; plus tard un sous-domaine `<client>.<domaine>` (Domain management).
5. Déployer, ouvrir le site, créer le compte du responsable du client, puis créer son organisation.
6. Vérifier sur le site : connexion, déconnexion, mot de passe oublié, ajout d'un prospect.

## 3. Automatisation (Make)

1. Sur le site du client, avec le compte propriétaire : **Paramètres → Intégration Make → Générer une clé**.
   Transmettre la clé à Soufyane par un canal sûr (pas par e-mail ni dans le chat).
2. Soufyane duplique les scénarios et les pointe vers l'URL du projet du client et cette clé.
3. Boîte mail du client : visibilité « équipe » ou « privée » à décider avec lui (voir `docs/securite.md`).
4. Test de bout en bout : un e-mail envoyé à la boîte doit apparaître dans la Boîte de réception du site du client,
   et dans aucun autre.

## 4. Enregistrer le client

Dans le tableau de pilotage (L1-07) : nom, forfait, URL du projet Supabase, URL du site, date de création de la clé
Make (rotation, L5-07), responsable côté client, contrat de sous-traitance signé.

## Mises à jour ensuite

- **Code du site** : une fusion sur `main` republie automatiquement tous les sites clients.
- **Base de données** : une nouvelle migration doit être appliquée **à chaque projet client**
  (`supabase link` puis `supabase db push`, projet par projet), puis notée dans `supabase/MIGRATIONS.md`.
  Appliquer d'abord sur le projet « Valtiq » (démo), vérifier, puis sur les clients.

## Essai sur un projet vierge (24/11/2026)

Projet temporaire `valtiq-essai-temporaire` (Paris), migrations téléchargées depuis GitHub et vérifiées par MD5 :

- sans prérequis : arrêt à la migration 12 (pg_cron absent), puis à la 15 (`rls_auto_enable()` absente) ;
- avec `supabase/prerequis-nouveau-projet.sql` : **les 17 migrations s'installent** ;
- comparaison avec la base « Valtiq » : **592 éléments identiques** (25 tables, 283 colonnes, 56 fonctions avec leurs
  droits, 77 politiques RLS, 100 index, 15 triggers, 24 droits sur tables, 2 tâches planifiées, 9 tables en temps réel,
  le bucket des pièces jointes) ;
- alertes de sécurité Supabase : les mêmes que sur « Valtiq ».

Non couvert par l'essai : la configuration Auth (étapes 1.5 à 1.7), le site Netlify et Make, à vérifier lors du
premier vrai client.
