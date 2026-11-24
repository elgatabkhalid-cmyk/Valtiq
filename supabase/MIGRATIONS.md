# Migrations de la base Supabase (projet Valtiq)

Toutes les migrations sont dans `supabase/migrations/`, au format de la CLI Supabase
(`<version>_<nom>.sql`). La version est celle enregistrée dans `supabase_migrations.schema_migrations`
du projet `znzdvhfczkhyubkjqvow`. Pour recréer une base : `supabase link --project-ref <ref>` puis `supabase db push`
(ou exécuter les fichiers dans l'ordre dans le SQL Editor).

| # | Version | Nom | Auteur |
|---|---|---|---|
| 0 | 20261115000000 | schema_v0_2_base ¹ | CRM |
| 1 | 20261115145329 | invitations_v0_3_1 | CRM |
| 2 | 20261115145430 | revoke_trigger_function_execute | CRM |
| 3 | 20261115152556 | automations_v0_4 | CRM |
| 4 | 20261115210144 | v0_5_make_integration | CRM |
| 5 | 20261115210222 | v0_5_1_mk_num_european_format | CRM |
| 6 | 20261115231754 | v0_6_emails_01_schema | Automatisation |
| 7 | 20261115231847 | v0_6_emails_02a_internes_triggers | Automatisation |
| 8 | 20261115232018 | v0_6_emails_02b_rpc_make | Automatisation |
| 9 | 20261115232058 | v0_6_emails_02c_rpc_crm_rgpd | Automatisation |
| 10 | 20261115232128 | v0_6_emails_03_securite | Automatisation |
| 11 | 20261115232142 | v0_6_emails_04_referentiels_planification | Automatisation |
| 12 | 20261116015106 | v0_7_emails_routage_metier | Automatisation |
| 13 | 20261116020606 | v0_7_1_routage_garde_message_court | Automatisation |
| 14 | 20261118140016 | v0_8_securite_fonctions | CRM |
| 15 | 20261118141431 | v0_8_1_cron_relances ² | CRM |
| 16 | 20261124011215 | v0_10_boites_privees ³ | CRM (validé par l'Automatisation) |

Les fichiers 1 à 16 sont une **copie exacte** du SQL enregistré dans Supabase, vérifiée le 18/11/2026 (le 24/11/2026 pour le 16) par
comparaison de `md5sum <fichier>` avec `select version, md5(statements[1]) from supabase_migrations.schema_migrations` :

```
c372f68a57c32d671811c160d63c9ef1  20261115145329_invitations_v0_3_1.sql
14cd028939529105cdf0e3688fcd2774  20261115145430_revoke_trigger_function_execute.sql
2277e06006ad679f5445901496131de5  20261115152556_automations_v0_4.sql
842d9daa354b24deebf7b1d798077b65  20261115210144_v0_5_make_integration.sql
2f6af7a2b9971a4fcce03307305d5ab5  20261115210222_v0_5_1_mk_num_european_format.sql
648d5ccc6b4552f9101502a2ded601b6  20261115231754_v0_6_emails_01_schema.sql
431459363c11cc44c98150fd2eb08d2b  20261115231847_v0_6_emails_02a_internes_triggers.sql
31d22ff20323e193e86818285c50f12c  20261115232018_v0_6_emails_02b_rpc_make.sql
e24123918a7e26e6495c891047fbf339  20261115232058_v0_6_emails_02c_rpc_crm_rgpd.sql
a5d7d41b1d2cfc198d7d3be3e79162e7  20261115232128_v0_6_emails_03_securite.sql
5710bc193d70f499877663dd5b6251b5  20261115232142_v0_6_emails_04_referentiels_planification.sql
94cc1d9d359ebe766d43f6f59617546e  20261116015106_v0_7_emails_routage_metier.sql
7a9f880666a495a054e4e029ac1aa815  20261116020606_v0_7_1_routage_garde_message_court.sql
9e263d2b0313bfdf8eda122900b2a54a  20261118140016_v0_8_securite_fonctions.sql
2a44d0e34e68bf6362fd5e6ec1f1bd99  20261118141431_v0_8_1_cron_relances.sql
7bd416269ffb3d77de99320a2a45ac6e  20261124011215_v0_10_boites_privees.sql
```

¹ Schéma de base, exécuté à l'origine dans le SQL Editor (ancien `schema_v0_2.sql`). Il a été inscrit comme
« déjà appliqué » dans l'historique du projet (équivalent de `supabase migration repair --status applied 20261115000000`)
pour que `supabase db push` ne tente pas de le rejouer sur la base existante.
² Versionne le job pg_cron `valtiq-stale-deal-alerts` (6 h UTC), qui existait sur la base sans être dans une migration.
Le job `valtiq-purge-emails` est créé par la migration 11.

Les anciens fichiers `supabase/migration_v0_*.sql` (dont les versions v0_3 à v0_5 ne correspondaient pas exactement
à ce qui avait été appliqué) ont été remplacés par ce dossier ; ils restent consultables dans l'historique Git.
³ Confidentialité des boîtes mail privées (audit du 18/11/2026) : routage sans recopie du contenu, export RGPD filtré,
visibilité et propriétaire d'une boîte modifiables par le seul owner, table `emails` en temps réel. Voir `docs/securite.md`.

## Règles de travail

- **Répartition** : l'équipe CRM modifie l'application (`src/`) ; l'équipe Automatisation modifie les scénarios Make
  et les fonctions `email_*`. Les tables métier (`contacts`, `companies`, `opportunities`, `tasks`, `appointments`,
  `invoices`) et les clés d'intégration (`integration_tokens`) sont partagées.
- **Toute migration appliquée sur Supabase est aussi commitée ici**, dans `supabase/migrations/`, sous le nom `<version>_<nom>.sql` (version identique à celle enregistrée par Supabase), le jour même, et ajoutée à ce tableau.
- **Contrat avec Make** : ne pas renommer ni changer les paramètres de `make_ingest` et des fonctions `email_*`
  (`email_recevoir_gmail`, `email_ingest`, `email_classer`, `email_appliquer_classification`, `email_contexte`,
  `email_signaler_erreur`, `piece_jointe_confirmer_stockage`) sans prévenir l'autre équipe : les scénarios Make cesseraient de fonctionner.
- **Avant d'appliquer une migration**, vérifier la liste des migrations déjà appliquées pour ne pas écraser le travail de l'autre équipe.
- Les fonctions appelées par Make sans connexion valident toutes la clé d'intégration via `_org_depuis_jeton` (ou le
  contrôle équivalent dans `make_ingest`) : toute nouvelle fonction exposée à `anon` doit faire de même.
