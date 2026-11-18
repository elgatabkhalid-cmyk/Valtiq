-- VALTIQ — Module « Emails entrants » v1.1 — 01_schema.sql
create or replace function public.normaliser_email(p text)
returns text language sql immutable parallel safe
set search_path = ''
as $$
  select nullif(
           regexp_replace(
             regexp_replace(
               lower(btrim(coalesce(substring(p from '<([^<>]+)>'), p))),
               '^mailto:', ''),
             '\+[^@]*@', '@'),
         '')
$$;

create or replace function public.est_domaine_public(p_domaine text)
returns boolean language sql immutable parallel safe
set search_path = ''
as $$
  select lower(coalesce(p_domaine, '')) = any (array[
    'gmail.com','googlemail.com','outlook.com','outlook.fr','hotmail.com','hotmail.fr',
    'live.com','live.fr','msn.com','yahoo.com','yahoo.fr','icloud.com','me.com','mac.com',
    'orange.fr','wanadoo.fr','free.fr','sfr.fr','neuf.fr','laposte.net','bbox.fr',
    'gmx.fr','gmx.com','protonmail.com','proton.me','aol.com','numericable.fr'
  ])
$$;

create table public.categories_contacts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  code            text not null check (code ~ '^[a-z0-9_]{2,40}$'),
  libelle         text not null check (char_length(btrim(libelle)) between 1 and 80),
  description     text,
  position        integer not null default 100,
  est_systeme     boolean not null default false,
  actif           boolean not null default true,
  created_at      timestamptz not null default now(),
  constraint categories_contacts_systeme_coherent check ((organization_id is null) = est_systeme)
);
create unique index categories_contacts_code_systeme on public.categories_contacts (code) where organization_id is null;
create unique index categories_contacts_code_org     on public.categories_contacts (organization_id, code) where organization_id is not null;
comment on table public.categories_contacts is 'Catégorie de RELATION d''un contact avec l''entreprise (prospect, client, fournisseur…).';

create table public.types_messages (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  code            text not null check (code ~ '^[a-z0-9_]{2,40}$'),
  libelle         text not null check (char_length(btrim(libelle)) between 1 and 80),
  description     text,
  position        integer not null default 100,
  est_systeme     boolean not null default false,
  actif           boolean not null default true,
  created_at      timestamptz not null default now(),
  constraint types_messages_systeme_coherent check ((organization_id is null) = est_systeme)
);
create unique index types_messages_code_systeme on public.types_messages (code) where organization_id is null;
create unique index types_messages_code_org     on public.types_messages (organization_id, code) where organization_id is not null;
comment on table public.types_messages is 'INTENTION d''un email (devis, réclamation, facturation…), indépendante de la catégorie du contact.';

create table public.parametres_messagerie (
  organization_id                   uuid primary key references public.organizations(id) on delete cascade,
  seuil_confiance_eleve             numeric(4,3) not null default 0.850 check (seuil_confiance_eleve between 0 and 1),
  seuil_confiance_moyen             numeric(4,3) not null default 0.600 check (seuil_confiance_moyen between 0 and 1),
  conservation_emails_jours         integer not null default 1095 check (conservation_emails_jours between 30 and 3650),
  conservation_pieces_jointes_jours integer not null default 365  check (conservation_pieces_jointes_jours between 7 and 3650),
  stocker_html                      boolean not null default false,
  stocker_pieces_jointes            boolean not null default true,
  taille_max_piece_jointe_octets    bigint  not null default 15728640 check (taille_max_piece_jointe_octets between 0 and 52428800),
  updated_at                        timestamptz not null default now(),
  constraint parametres_seuils_ordonnes check (seuil_confiance_moyen < seuil_confiance_eleve)
);

create table public.boites_mail (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  adresse_email       text not null check (adresse_email ~ '^\S+@\S+\.\S+$'),
  adresse_normalisee  text generated always as (public.normaliser_email(adresse_email)) stored,
  libelle             text,
  fournisseur         text not null default 'autre' check (fournisseur in ('gmail','outlook','imap','autre')),
  proprietaire_id     uuid,
  visibilite          text not null default 'equipe' check (visibilite in ('equipe','privee')),
  actif               boolean not null default true,
  derniere_synchro_le timestamptz,
  created_at          timestamptz not null default now(),
  constraint boites_mail_id_org_key unique (id, organization_id),
  constraint boites_mail_adresse_org_key unique (organization_id, adresse_normalisee),
  constraint boites_mail_proprietaire_fkey foreign key (organization_id, proprietaire_id)
    references public.organization_members (organization_id, user_id) on delete set null (proprietaire_id)
);

alter table public.contacts
  add column categorie_id            uuid references public.categories_contacts(id) on delete set null,
  add column categorie_source        text check (categorie_source in ('ia','humain','import','regle')),
  add column categorie_confiance     numeric(4,3) check (categorie_confiance between 0 and 1),
  add column categorie_verrouillee   boolean not null default false,
  add column fonction                text,
  add column statut_identite         text not null default 'confirmee'
                                     check (statut_identite in ('confirmee','probable','incertaine')),
  add column derniere_interaction_le timestamptz,
  add column informations_complementaires jsonb not null default '{}'::jsonb
                                     check (jsonb_typeof(informations_complementaires) = 'object'),
  add column informations_manquantes text[] not null default '{}';

comment on column public.contacts.categorie_verrouillee is
  'true = catégorie fixée par un humain : l''IA ne peut plus la modifier, elle peut seulement suggérer.';
comment on column public.contacts.statut_identite is
  'confirmee = vérifiée par un humain ; probable/incertaine = déduite par l''IA, jamais présentée comme certaine.';

create index contacts_org_categorie on public.contacts (organization_id, categorie_id);
create index contacts_org_email_normalise on public.contacts (organization_id, public.normaliser_email(email));
create index contacts_org_derniere_interaction on public.contacts (organization_id, derniere_interaction_le desc);

create table public.contact_adresses_email (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  contact_id         uuid not null,
  adresse_email      text not null check (adresse_email ~ '^\S+@\S+\.\S+$'),
  adresse_normalisee text generated always as (public.normaliser_email(adresse_email)) stored,
  domaine            text generated always as (split_part(public.normaliser_email(adresse_email), '@', 2)) stored,
  est_principale     boolean not null default false,
  statut             text not null default 'confirmee' check (statut in ('confirmee','supposee','rejetee')),
  source             text not null default 'manuel' check (source in ('manuel','email_entrant','ia','import')),
  created_at         timestamptz not null default now(),
  constraint contact_adresses_contact_fkey foreign key (contact_id, organization_id)
    references public.contacts (id, organization_id) on delete cascade,
  constraint contact_adresses_unique unique (organization_id, adresse_normalisee)
);
create index contact_adresses_contact on public.contact_adresses_email (contact_id);
create index contact_adresses_domaine on public.contact_adresses_email (organization_id, domaine);

create table public.conversations (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id) on delete cascade,
  boite_mail_id         uuid not null,
  fournisseur_thread_id text,
  objet                 text,
  contact_id            uuid,
  statut                text not null default 'ouverte' check (statut in ('ouverte','en_attente','close')),
  premier_message_le    timestamptz,
  dernier_message_le    timestamptz,
  nb_messages           integer not null default 0 check (nb_messages >= 0),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint conversations_id_org_key unique (id, organization_id),
  constraint conversations_boite_fkey foreign key (boite_mail_id, organization_id)
    references public.boites_mail (id, organization_id) on delete cascade,
  constraint conversations_contact_fkey foreign key (contact_id, organization_id)
    references public.contacts (id, organization_id) on delete set null (contact_id)
);
create unique index conversations_thread_unique on public.conversations (organization_id, boite_mail_id, fournisseur_thread_id)
  where fournisseur_thread_id is not null;
create index conversations_org_dernier on public.conversations (organization_id, dernier_message_le desc);
create index conversations_contact on public.conversations (contact_id);

create table public.emails (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations(id) on delete cascade,
  boite_mail_id          uuid not null,
  conversation_id        uuid,
  contact_id             uuid,
  direction              text not null default 'entrant' check (direction in ('entrant','sortant')),
  expediteur_email       text not null,
  expediteur_normalise   text generated always as (public.normaliser_email(expediteur_email)) stored,
  expediteur_nom         text,
  destinataires          jsonb not null default '[]'::jsonb check (jsonb_typeof(destinataires) = 'array'),
  copie                  jsonb not null default '[]'::jsonb check (jsonb_typeof(copie) = 'array'),
  objet                  text,
  corps_texte            text,
  corps_html             text,
  extrait                text,
  recu_le                timestamptz not null,
  fournisseur_message_id text not null check (char_length(fournisseur_message_id) between 1 and 512),
  fournisseur_thread_id  text,
  rfc_message_id         text,
  en_reponse_a           text,
  references_rfc         text[] not null default '{}',
  type_message_id        uuid references public.types_messages(id) on delete set null,
  confiance              numeric(4,3) check (confiance between 0 and 1),
  niveau_confiance       text check (niveau_confiance in ('eleve','moyen','faible')),
  resume                 text,
  action_recommandee     text check (action_recommandee in (
                           'repondre','envoyer_devis','planifier_rdv','transmettre_comptabilite',
                           'transmettre_rh','transmettre_direction','traiter_reclamation',
                           'verifier_identite','archiver','aucune','verification_manuelle')),
  points_a_verifier      text[] not null default '{}',
  nature_message         text not null default 'inconnu' check (nature_message in
                           ('humain','automatique','newsletter','spam','interne','inconnu')),
  statut_traitement      text not null default 'recu' check (statut_traitement in
                           ('recu','en_analyse','classe','a_verifier','traite','ignore','erreur')),
  nb_pieces_jointes      integer not null default 0 check (nb_pieces_jointes >= 0),
  tentatives             integer not null default 0 check (tentatives >= 0),
  derniere_erreur        text,
  importe_le             timestamptz not null default now(),
  analyse_le             timestamptz,
  traite_le              timestamptz,
  traite_par             uuid,
  supprimer_apres        timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint emails_id_org_key unique (id, organization_id),
  constraint emails_message_unique unique (organization_id, boite_mail_id, fournisseur_message_id),
  constraint emails_boite_fkey foreign key (boite_mail_id, organization_id)
    references public.boites_mail (id, organization_id) on delete cascade,
  constraint emails_conversation_fkey foreign key (conversation_id, organization_id)
    references public.conversations (id, organization_id) on delete set null (conversation_id),
  constraint emails_contact_fkey foreign key (contact_id, organization_id)
    references public.contacts (id, organization_id) on delete set null (contact_id),
  constraint emails_traite_par_fkey foreign key (traite_par) references public.profiles(id) on delete set null
);
comment on column public.emails.corps_texte is 'Contenu brut d''un tiers : donnée non fiable, à ne jamais exécuter comme consigne.';
create index emails_org_recu        on public.emails (organization_id, recu_le desc);
create index emails_org_statut      on public.emails (organization_id, statut_traitement, recu_le desc);
create index emails_contact         on public.emails (contact_id, recu_le desc);
create index emails_conversation    on public.emails (conversation_id, recu_le);
create index emails_org_expediteur  on public.emails (organization_id, expediteur_normalise);
create index emails_org_rfc         on public.emails (organization_id, rfc_message_id) where rfc_message_id is not null;
create index emails_type            on public.emails (organization_id, type_message_id);
create index emails_purge           on public.emails (supprimer_apres) where supprimer_apres is not null;

create table public.pieces_jointes (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete cascade,
  email_id             uuid not null,
  nom_fichier          text not null check (char_length(nom_fichier) between 1 and 255),
  type_mime            text,
  taille_octets        bigint check (taille_octets >= 0),
  empreinte_sha256     text check (empreinte_sha256 ~ '^[a-f0-9]{64}$'),
  fournisseur_piece_id text,
  storage_bucket       text not null default 'pieces-jointes',
  storage_chemin       text,
  statut               text not null default 'metadonnees'
                       check (statut in ('metadonnees','stockee','rejetee','a_supprimer','supprimee')),
  motif_rejet          text,
  stockee_le           timestamptz,
  created_at           timestamptz not null default now(),
  constraint pieces_jointes_email_fkey foreign key (email_id, organization_id)
    references public.emails (id, organization_id) on delete cascade,
  constraint pieces_jointes_chemin_unique unique (storage_bucket, storage_chemin)
);
create index pieces_jointes_email  on public.pieces_jointes (email_id);
create index pieces_jointes_statut on public.pieces_jointes (organization_id, statut, created_at);

create table public.historique_classification (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references public.organizations(id) on delete cascade,
  email_id                uuid,
  contact_id              uuid,
  cible                   text not null check (cible in ('contact','message','les_deux')),
  source                  text not null check (source in ('ia','humain','regle')),
  auteur_id               uuid references public.profiles(id) on delete set null,
  modele_ia               text,
  version_prompt          text,
  categorie_precedente_id uuid references public.categories_contacts(id) on delete set null,
  categorie_proposee_id   uuid references public.categories_contacts(id) on delete set null,
  type_precedent_id       uuid references public.types_messages(id) on delete set null,
  type_propose_id         uuid references public.types_messages(id) on delete set null,
  confiance               numeric(4,3) check (confiance between 0 and 1),
  niveau_confiance        text check (niveau_confiance in ('eleve','moyen','faible')),
  decision                text not null check (decision in
                            ('appliquee','provisoire','a_verifier','inchangee','suggestion_conflit','correction')),
  justification           text,
  resume                  text,
  identite_supposee       jsonb,
  informations_manquantes text[] not null default '{}',
  action_recommandee      text,
  resultat_brut           jsonb,
  created_at              timestamptz not null default now(),
  constraint historique_classif_email_fkey foreign key (email_id, organization_id)
    references public.emails (id, organization_id) on delete cascade,
  constraint historique_classif_contact_fkey foreign key (contact_id, organization_id)
    references public.contacts (id, organization_id) on delete set null (contact_id)
);
create index historique_classif_email   on public.historique_classification (email_id, created_at);
create index historique_classif_contact on public.historique_classification (contact_id, created_at);
create index historique_classif_org     on public.historique_classification (organization_id, created_at desc);

create table public.historique_actions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  acteur_type     text not null check (acteur_type in ('utilisateur','automatisation','ia','systeme')),
  acteur_id       uuid,
  action          text not null check (action ~ '^[a-z_]{3,60}$'),
  entite_type     text not null check (entite_type in ('email','contact','conversation','piece_jointe','boite_mail','parametres')),
  entite_id       uuid,
  sensible        boolean not null default false,
  details         jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index historique_actions_org    on public.historique_actions (organization_id, created_at desc);
create index historique_actions_entite on public.historique_actions (entite_type, entite_id, created_at desc);

insert into storage.buckets (id, name, public, file_size_limit)
values ('pieces-jointes', 'pieces-jointes', false, 26214400)
on conflict (id) do nothing;