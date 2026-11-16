insert into public.categories_contacts (organization_id, code, libelle, description, position, est_systeme) values
  (null, 'prospect',                'Prospect',                  'Intéressé par les services, pas encore client', 10, true),
  (null, 'client',                  'Client',                    'Relation commerciale existante',                20, true),
  (null, 'fournisseur',             'Fournisseur',               'Fournit des produits ou services à l''entreprise', 30, true),
  (null, 'partenaire',              'Partenaire',                'Partenariat, collaboration, apport d''affaires', 40, true),
  (null, 'candidat',                'Candidat / Recrutement',    'Candidature, stage, alternance',                50, true),
  (null, 'administratif_juridique', 'Administratif / Juridique', 'Administrations, URSSAF, banques, assurances, comptable, avocat', 60, true),
  (null, 'autre',                   'Autre contact',             'Ne correspond à aucune autre catégorie',        70, true),
  (null, 'a_verifier',              'À vérifier',                'Identité ou nature incertaine : contrôle humain requis', 80, true)
on conflict (code) where organization_id is null do nothing;

insert into public.types_messages (organization_id, code, libelle, position, est_systeme) values
  (null, 'demande_devis',           'Demande de devis',          10, true),
  (null, 'demande_renseignements',  'Demande de renseignements', 20, true),
  (null, 'reclamation',             'Réclamation',               30, true),
  (null, 'facturation',             'Facturation',               40, true),
  (null, 'paiement',                'Paiement',                  50, true),
  (null, 'rendez_vous',             'Rendez-vous',               60, true),
  (null, 'commande',                'Commande',                  70, true),
  (null, 'support',                 'Support',                   80, true),
  (null, 'proposition_commerciale', 'Proposition commerciale',   90, true),
  (null, 'candidature',             'Candidature',              100, true),
  (null, 'partenariat',             'Partenariat',              110, true),
  (null, 'livraison',               'Livraison',                120, true),
  (null, 'relance',                 'Relance',                  130, true),
  (null, 'autre',                   'Autre',                    140, true)
on conflict (code) where organization_id is null do nothing;

insert into public.parametres_messagerie (organization_id)
select id from public.organizations
on conflict (organization_id) do nothing;

insert into public.contact_adresses_email (organization_id, contact_id, adresse_email, est_principale, statut, source)
select distinct on (c.organization_id, public.normaliser_email(c.email))
       c.organization_id, c.id, public.normaliser_email(c.email), true, 'confirmee', 'import'
  from public.contacts c
 where public.normaliser_email(c.email) ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
 order by c.organization_id, public.normaliser_email(c.email), c.created_at
on conflict (organization_id, adresse_normalisee) do nothing;

select cron.schedule('valtiq-purge-emails', '15 3 * * *', 'select public.purger_donnees_expirees()');