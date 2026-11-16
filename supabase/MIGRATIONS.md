# Migrations de la base Supabase (projet Valtiq)

Ordre d'application sur le projet `znzdvhfczkhyubkjqvow`, tel qu'enregistré dans
`supabase_migrations.schema_migrations`. Pour recréer la base, exécuter les fichiers dans cet ordre.

| # | Version Supabase | Nom | Fichier | Auteur |
|---|---|---|---|---|
| 0 | — (SQL Editor) | schéma de base | `schema_v0_2.sql` | CRM |
| 1 | 20261115145329 | invitations_v0_3_1 | `migration_v0_3_invitations.sql` ¹ | CRM |
| 2 | 20261115145430 | revoke_trigger_function_execute | — ² | CRM |
| 3 | 20261115152556 | automations_v0_4 | `migration_v0_4_automations.sql` ¹ | CRM |
| 4 | 20261115210144 | v0_5_make_integration | `migration_v0_5_make_integration.sql` ³ | CRM |
| 5 | 20261115210222 | v0_5_1_mk_num_european_format | inclus dans `migration_v0_5_make_integration.sql` | CRM |
| 6 | 20261115231754 | v0_6_emails_01_schema | `migration_v0_6_emails_01_schema.sql` | Automatisation |
| 7 | 20261115231847 | v0_6_emails_02a_internes_triggers | `migration_v0_6_emails_02a_internes_triggers.sql` | Automatisation |
| 8 | 20261115232018 | v0_6_emails_02b_rpc_make | `migration_v0_6_emails_02b_rpc_make.sql` | Automatisation |
| 9 | 20261115232058 | v0_6_emails_02c_rpc_crm_rgpd | `migration_v0_6_emails_02c_rpc_crm_rgpd.sql` | Automatisation |
| 10 | 20261115232128 | v0_6_emails_03_securite | `migration_v0_6_emails_03_securite.sql` | Automatisation |
| 11 | 20261115232142 | v0_6_emails_04_referentiels_planification | `migration_v0_6_emails_04_referentiels_planification.sql` | Automatisation |
| 12 | 20261116015106 | v0_7_emails_routage_metier | `migration_v0_7_emails_routage_metier.sql` | Automatisation |
| 13 | 20261116020606 | v0_7_1_routage_garde_message_court | `migration_v0_7_1_routage_garde_message_court.sql` | Automatisation |

Les fichiers 6 à 13 sont une copie exacte (vérifiée par empreinte MD5) du SQL enregistré dans Supabase le 16/11/2026 :

```
648d5ccc6b4552f9101502a2ded601b6  migration_v0_6_emails_01_schema.sql
431459363c11cc44c98150fd2eb08d2b  migration_v0_6_emails_02a_internes_triggers.sql
31d22ff20323e193e86818285c50f12c  migration_v0_6_emails_02b_rpc_make.sql
e24123918a7e26e6495c891047fbf339  migration_v0_6_emails_02c_rpc_crm_rgpd.sql
a5d7d41b1d2cfc198d7d3be3e79162e7  migration_v0_6_emails_03_securite.sql
5710bc193d70f499877663dd5b6251b5  migration_v0_6_emails_04_referentiels_planification.sql
94cc1d9d359ebe766d43f6f59617546e  migration_v0_7_emails_routage_metier.sql
7a9f880666a495a054e4e029ac1aa815  migration_v0_7_1_routage_garde_message_court.sql
```

¹ Le fichier du dépôt n'a pas été comparé octet par octet avec la version appliquée.
² Non présent dans le dépôt (retrait des droits d'exécution sur des fonctions de trigger).
³ Le fichier contient aussi la correction 5 (format européen des montants).

## Règles de travail

- **Répartition** : l'équipe CRM modifie l'application (`src/`) ; l'équipe Automatisation modifie les scénarios Make
  et les fonctions `email_*`. Les tables métier (`contacts`, `companies`, `opportunities`, `tasks`, `appointments`,
  `invoices`) et les clés d'intégration (`integration_tokens`) sont partagées.
- **Toute migration appliquée sur Supabase est aussi commitée ici**, dans `supabase/`, le jour même, et ajoutée à ce tableau.
- **Contrat avec Make** : ne pas renommer ni changer les paramètres de `make_ingest` et des fonctions `email_*`
  (`email_recevoir_gmail`, `email_ingest`, `email_classer`, `email_appliquer_classification`, `email_contexte`,
  `email_signaler_erreur`, `piece_jointe_confirmer_stockage`) sans prévenir l'autre équipe : les scénarios Make cesseraient de fonctionner.
- **Avant d'appliquer une migration**, vérifier la liste des migrations déjà appliquées pour ne pas écraser le travail de l'autre équipe.
- Les fonctions appelées par Make sans connexion valident toutes la clé d'intégration via `_org_depuis_jeton` (ou le
  contrôle équivalent dans `make_ingest`) : toute nouvelle fonction exposée à `anon` doit faire de même.
