# Lot 1 — Vérification et décisions

Rédigé le 17/11/2026 par Khalid. Ce document clôt le lot 1 de la feuille de route : il consigne l'état vérifié
du dépôt et du site, et propose les décisions D-04 (HMAC), D-10 (sites Netlify) et le rôle du projet « Valtiq ».
Les propositions marquées **« à valider avec Soufyane »** ne sont pas encore des décisions.

---

## L1-03 — Dépôt GitHub du CRM (vérifié le 17/11/2026)

| Point | Constat |
| --- | --- |
| Dépôt | `elgatabkhalid-cmyk/Valtiq`, branche par défaut `main` |
| Visibilité | **Public** : le code et les migrations SQL sont lisibles par tous (aucune clé secrète dedans). À passer en privé lors du transfert vers l'organisation `valtiq` (L2-03) |
| Branches | `main` + 7 branches de travail déjà fusionnées (supprimables) |
| Protection de `main` | Aucune (prévu en L2-03) |
| Dernier commit | 16/11/2026, `8e44ea2`, fusion de la PR #5 (emails Supabase en ES / FR / EN) |
| Build | `npm ci` puis `npm run build` : OK, sans erreur TypeScript ni avertissement |
| Versions | React 18.3, Vite 6.4, TypeScript 5.9, @supabase/supabase-js 2.49 |
| `.env` | Présent dans `.gitignore`, jamais commité (`git log --all -- .env` : 0 commit) |
| Clés secrètes | Aucune dans `src/` ni dans `dist/` (`service_role`, `sk-`, `eyJhbGci`, `sb_secret_`) |
| `.env.example` | Ajouté avec ce document |
| Accès de Soufyane | Lecture possible tant que le dépôt est public ; à remplacer par un accès membre dans l'organisation `valtiq` (L2-03) |

### Écrans existants comparés aux 15 points (annexe A)

Écrans du CRM : Connexion / inscription, Mot de passe oublié (PR #7, en revue), Vue d'ensemble, Boîte de réception,
Prospects & clients, Pipeline commercial, Tâches & relances, Agenda, Factures, Automatisations, Assistant IA
(page d'attente, IA non branchée), Paramètres, Mentions légales, Politique de confidentialité.
L'interface existe en espagnol, français et anglais.

| # | Point | État | Ce qui manque |
| --- | --- | --- | --- |
| 1 | Connexion Supabase | ✅ | — |
| 2 | Affichage | ✅ | Écran dédié aux entreprises |
| 3 | Création / modification | 🟡 | Création OK pour contacts, opportunités, tâches, rendez-vous, factures ; modifier une fiche, supprimer (hors contacts), créer une entreprise seule |
| 4 | Synchronisation avec Make | ✅ | E-mails visibles et corrigeables ; temps réel sur `emails` à activer ; cadenas sur catégorie verrouillée |
| 5 | Utilisateurs | 🟡 | Invitation OK ; retrait d'un membre |
| 6 | Rôles | 🟡 | Appliqués par la RLS ; matrice des droits à écrire et à tester avec 3 comptes |
| 7 | Personnalisation | ⬜ | Nom, logo, catégories, types, pipeline (L3-11) |
| 8 | Modules par forfait | ⬜ | L3-11 |
| 9 | Tableau de bord | 🟡 | Indicateurs « e-mails 24 h par type », opportunités par étape en montant |
| 10 | Notifications | ✅ | Pastilles « à vérifier », rendez-vous urgents, factures en retard |
| 11 | Erreurs | 🟡 | Gestionnaire d'erreur global (éviter l'écran blanc) |
| 12 | Navigation | ✅ | Routage par `#` : pas de 404 au rechargement |
| 13 | Sécurité | 🟡 | L3-01, L3-02, L9-06 |
| 14 | Responsive | ✅ | Testé à 390 px et 1 440 px |
| 15 | Déploiement | 🟡 | Production depuis `main` ; démo depuis `develop` à créer (L2-04) |

---

## L1-04 — Site Netlify

| Point | Constat |
| --- | --- |
| URL | `https://valtiqz.netlify.app` |
| Branche de production | `main` (chaque fusion publie le site) |
| Commande de build / dossier | `npm run build` / `dist` |
| Variables (noms) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| Clé secrète dans une variable `VITE_…` | Non : `VITE_SUPABASE_ANON_KEY` contient la clé publique `sb_publishable_…` |
| Connexion au site | Fonctionne (constaté le 15/11/2026 : connexion et génération de la clé Make dans Paramètres) |
| Dernier déploiement réussi | **À noter par Khalid** dans Netlify → Deploys (fusion de la PR #5 le 16/11/2026) |

Les variables sont définies au niveau de l'équipe Netlify (« Team settings ») : elles s'appliquent à tous les sites
de l'équipe. Avec un site par client (D-10), il faudra les définir **par site**, sinon tous les sites pointeraient
vers le même projet Supabase.

---

## L1-06 — Signature HMAC des appels de Make (D-04) — proposition, à valider avec Soufyane

**Proposition : pas de HMAC pour la démo et les pilotes ; le jeton haché suffit. On réexamine au bilan à 10 clients (L11-06).**

Ce que le jeton apporte déjà (vérifié dans le code des 8 fonctions, voir L3-01) :

- un jeton aléatoire par organisation (192 bits), stocké uniquement haché (SHA-256), affiché une seule fois ;
- vérifié **avant** toute lecture ou écriture, et l'organisation vient du jeton, jamais d'un paramètre ;
- il ne permet que d'ajouter ou de mettre à jour des données de son organisation, pas d'en lire en masse ni d'en supprimer ;
- révocable instantanément depuis le CRM (Paramètres → Intégration Make) ;
- transmis uniquement en HTTPS.

Limites assumées :

- **pas de protection contre le rejeu** : une requête interceptée peut être renvoyée. Effet limité, car les appels sont
  idempotents (`external_id`, identifiant du message Gmail) : un rejeu met à jour au lieu de dupliquer ;
- **le jeton voyage dans le corps de la requête** : s'il fuit (capture d'écran, export du scénario Make), il est
  utilisable jusqu'à sa révocation. D'où la rotation tous les 6 mois et en fin de contrat (L5-07, L11-07) ;
- **la clé publique Supabase n'authentifie pas** : la sécurité repose entièrement sur le jeton et la RLS.

Si le HMAC devient nécessaire : une Edge Function vérifie la signature (`X-Valtiq-Signature` = HMAC-SHA256 du corps +
horodatage, refus au-delà de 5 minutes) puis appelle les fonctions SQL avec la clé secrète côté serveur. Make sait
calculer un HMAC (fonction `sha256` avec clé). Coût : une Edge Function par projet client à déployer et maintenir.

**Format d'appel retenu pour Make (à communiquer à Soufyane)** : `POST https://<ref>.supabase.co/rest/v1/rpc/<fonction>`,
en-têtes `apikey` (clé publique) et `Content-Type: application/json`, jeton dans le paramètre `p_token`
(ou l'en-tête `x-valtiq-token`, accepté par les fonctions `email_*`).

---

## L1-07 — Rôle du projet « Valtiq » et du projet central — proposition, à valider avec Soufyane

1. **Projet « Valtiq » (actuel) = développement + démo.** Il garde les organisations « Démo Maintenance » et
   « VALTIQ interne » (L3-14). Les 3 organisations de test actuelles sont à supprimer ou archiver.
   Il ne reçoit **aucune donnée de vrai client**.
2. **Un projet Supabase par client** (décision D-02), créé avec la procédure de l'annexe C.
3. **Projet central de pilotage** : liste des clients, forfait, URL du projet et du site, date de rotation du jeton,
   budget IA. **Aucune donnée personnelle de client.** Pour démarrer, un tableau partagé suffit ; un projet Supabase
   dédié n'est utile qu'au-delà de 10 clients.

Conséquence à traiter : le contrat de sous-traitance, le registre des traitements et la politique de confidentialité
décrivent aujourd'hui « une base partagée, séparée par organisation ». Ils doivent dire « une base par client »
(à corriger en L6-10).

---

## L1-09 — Un site Netlify par client ou un site unique (D-10) — proposition, à valider avec Soufyane

| | Un site par client (recommandé) | Un site unique |
| --- | --- | --- |
| Lien avec D-02 | Naturel : chaque site pointe vers le projet Supabase du client | Le site devrait choisir le projet du client à la connexion : développement spécifique |
| Isolation | Totale : variables et adresse propres | Une erreur de configuration touche tous les clients |
| Mise à jour | Même code depuis GitHub ; chaque site se republie à la fusion | Une seule publication |
| Coût | Gratuit au début ; quelques minutes de mise en place par client | Le plus simple à maintenir |
| Adresse | `<client>.valtiq.<domaine>` | `app.valtiq.<domaine>` |

**Recommandation pour moins de 10 clients : un site par client**, même dépôt, variables définies par site, sous-domaine
par client. À réexaminer au bilan à 10 clients (L11-06).

---

## L1-08 / L1-10 / L1-11 — Décisions communes : contribution technique

| Décision | Impact technique et sur la base |
| --- | --- |
| Fournisseur d'IA (L1-08) | Indifférent pour la base : Make envoie la réponse de l'IA à `email_classer`. À retenir : région des données (UE de préférence), absence d'entraînement sur nos données, contrat de sous-traitance. Le nom du fournisseur doit apparaître dans la politique de confidentialité, le contrat et le registre. Prévoir la table `consommations_ia` (L5-04) |
| Agent vocal (L1-10) | Nouveau type de donnée (appels, transcriptions) : nouvelles tables, fonction d'ingestion protégée par jeton comme les autres, écran dans le CRM, mise à jour RGPD (enregistrement de la voix = information préalable des appelants). À chiffrer avant de vendre |
| Répartition et rituel du lundi (L1-11) | D'accord avec la répartition de la feuille de route. Pour le lundi : alertes Supabase, sauvegardes, déploiements Netlify (L11-03) et PR en attente |

---

## Décisions à prendre ensemble (récapitulatif)

- [ ] D-04 : jeton haché sans HMAC pour la démo et les pilotes
- [ ] D-10 : un site Netlify par client
- [ ] L1-07 : « Valtiq » = développement + démo ; projet central = tableau partagé au début
- [ ] Passer le dépôt GitHub en privé lors du transfert vers l'organisation `valtiq`
- [ ] Qui applique les migrations de base (règle « seul Khalid modifie la base ») : les migrations v0.6 et v0.7 ont été appliquées par l'équipe Automatisation
