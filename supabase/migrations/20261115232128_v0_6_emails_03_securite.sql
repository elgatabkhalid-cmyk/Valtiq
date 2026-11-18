alter table public.categories_contacts       enable row level security;
alter table public.types_messages            enable row level security;
alter table public.parametres_messagerie     enable row level security;
alter table public.boites_mail               enable row level security;
alter table public.contact_adresses_email    enable row level security;
alter table public.conversations             enable row level security;
alter table public.emails                    enable row level security;
alter table public.pieces_jointes            enable row level security;
alter table public.historique_classification enable row level security;
alter table public.historique_actions        enable row level security;

revoke all on public.categories_contacts, public.types_messages, public.parametres_messagerie,
              public.boites_mail, public.contact_adresses_email, public.conversations, public.emails,
              public.pieces_jointes, public.historique_classification, public.historique_actions
  from anon, authenticated;

grant select, insert, update, delete on public.categories_contacts, public.types_messages to authenticated;
grant select, insert, update          on public.parametres_messagerie to authenticated;
grant select, insert, update, delete on public.boites_mail to authenticated;
grant select, insert, update, delete on public.contact_adresses_email to authenticated;
grant select, update (statut)        on public.conversations to authenticated;
grant delete                          on public.conversations to authenticated;
grant select, delete                  on public.emails to authenticated;
grant update (statut_traitement, type_message_id, contact_id, points_a_verifier) on public.emails to authenticated;
grant select                          on public.pieces_jointes to authenticated;
grant select                          on public.historique_classification to authenticated;
grant select                          on public.historique_actions to authenticated;

create policy "lecture categories" on public.categories_contacts for select to authenticated
  using (organization_id is null or public.is_org_member(organization_id));
create policy "admins creent categories" on public.categories_contacts for insert to authenticated
  with check (organization_id is not null and not est_systeme
              and public.has_org_role(organization_id, array['owner','admin']::public.member_role[]));
create policy "admins modifient categories" on public.categories_contacts for update to authenticated
  using (organization_id is not null and public.has_org_role(organization_id, array['owner','admin']::public.member_role[]))
  with check (organization_id is not null and not est_systeme
              and public.has_org_role(organization_id, array['owner','admin']::public.member_role[]));
create policy "admins suppriment categories" on public.categories_contacts for delete to authenticated
  using (organization_id is not null and public.has_org_role(organization_id, array['owner','admin']::public.member_role[]));

create policy "lecture types" on public.types_messages for select to authenticated
  using (organization_id is null or public.is_org_member(organization_id));
create policy "admins creent types" on public.types_messages for insert to authenticated
  with check (organization_id is not null and not est_systeme
              and public.has_org_role(organization_id, array['owner','admin']::public.member_role[]));
create policy "admins modifient types" on public.types_messages for update to authenticated
  using (organization_id is not null and public.has_org_role(organization_id, array['owner','admin']::public.member_role[]))
  with check (organization_id is not null and not est_systeme
              and public.has_org_role(organization_id, array['owner','admin']::public.member_role[]));
create policy "admins suppriment types" on public.types_messages for delete to authenticated
  using (organization_id is not null and public.has_org_role(organization_id, array['owner','admin']::public.member_role[]));

create policy "membres lisent parametres" on public.parametres_messagerie for select to authenticated
  using (public.is_org_member(organization_id));
create policy "admins creent parametres" on public.parametres_messagerie for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner','admin']::public.member_role[]));
create policy "admins modifient parametres" on public.parametres_messagerie for update to authenticated
  using (public.has_org_role(organization_id, array['owner','admin']::public.member_role[]))
  with check (public.has_org_role(organization_id, array['owner','admin']::public.member_role[]));

create policy "membres lisent boites" on public.boites_mail for select to authenticated
  using (public.is_org_member(organization_id));
create policy "admins creent boites" on public.boites_mail for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner','admin']::public.member_role[]));
create policy "admins modifient boites" on public.boites_mail for update to authenticated
  using (public.has_org_role(organization_id, array['owner','admin']::public.member_role[]))
  with check (public.has_org_role(organization_id, array['owner','admin']::public.member_role[]));
create policy "admins suppriment boites" on public.boites_mail for delete to authenticated
  using (public.has_org_role(organization_id, array['owner','admin']::public.member_role[]));

create policy "membres lisent adresses" on public.contact_adresses_email for select to authenticated
  using (public.is_org_member(organization_id));
create policy "membres ajoutent adresses" on public.contact_adresses_email for insert to authenticated
  with check (public.is_org_member(organization_id));
create policy "membres modifient adresses" on public.contact_adresses_email for update to authenticated
  using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy "admins suppriment adresses" on public.contact_adresses_email for delete to authenticated
  using (public.has_org_role(organization_id, array['owner','admin']::public.member_role[]));

create policy "lecture conversations" on public.conversations for select to authenticated
  using (public.is_org_member(organization_id) and public.peut_acceder_boite(boite_mail_id));
create policy "maj conversations" on public.conversations for update to authenticated
  using (public.is_org_member(organization_id) and public.peut_acceder_boite(boite_mail_id))
  with check (public.is_org_member(organization_id) and public.peut_acceder_boite(boite_mail_id));
create policy "admins suppriment conversations" on public.conversations for delete to authenticated
  using (public.has_org_role(organization_id, array['owner','admin']::public.member_role[])
         and public.peut_acceder_boite(boite_mail_id));

create policy "lecture emails" on public.emails for select to authenticated
  using (public.is_org_member(organization_id) and public.peut_acceder_boite(boite_mail_id));
create policy "maj traitement emails" on public.emails for update to authenticated
  using (public.is_org_member(organization_id) and public.peut_acceder_boite(boite_mail_id))
  with check (public.is_org_member(organization_id) and public.peut_acceder_boite(boite_mail_id));
create policy "admins suppriment emails" on public.emails for delete to authenticated
  using (public.has_org_role(organization_id, array['owner','admin']::public.member_role[])
         and public.peut_acceder_boite(boite_mail_id));

create policy "lecture pieces jointes" on public.pieces_jointes for select to authenticated
  using (public.is_org_member(organization_id)
         and exists (select 1 from public.emails e where e.id = pieces_jointes.email_id));

create policy "lecture historique classification" on public.historique_classification for select to authenticated
  using (public.is_org_member(organization_id)
         and (email_id is null or exists (select 1 from public.emails e where e.id = historique_classification.email_id)));
create policy "dirigeants lisent journal" on public.historique_actions for select to authenticated
  using (public.has_org_role(organization_id, array['owner','admin']::public.member_role[]));

create policy "valtiq lecture pieces jointes" on storage.objects for select to authenticated
  using (bucket_id = 'pieces-jointes'
         and exists (select 1 from public.pieces_jointes pj
                      where pj.storage_bucket = storage.objects.bucket_id
                        and pj.storage_chemin = storage.objects.name
                        and pj.statut = 'stockee'));

revoke execute on function
  public.normaliser_email(text), public.est_domaine_public(text), public.peut_acceder_boite(uuid)
from public, anon, authenticated;

grant execute on function public.normaliser_email(text), public.est_domaine_public(text) to authenticated;
grant execute on function public.peut_acceder_boite(uuid) to authenticated;
grant execute on function
  public.email_ingest(text, jsonb), public.email_contexte(text, uuid),
  public.email_appliquer_classification(text, uuid, jsonb), public.email_signaler_erreur(text, uuid, text, text),
  public.piece_jointe_confirmer_stockage(text, uuid, text),
  public.email_recevoir_gmail(text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text),
  public.email_classer(uuid, text, text)
to anon, authenticated;
grant execute on function
  public.corriger_classification(uuid, text, text, uuid, boolean, text),
  public.journaliser_acces(text, uuid, text),
  public.exporter_donnees_contact(uuid), public.effacer_donnees_contact(uuid, boolean)
to authenticated;
grant execute on function public.purger_donnees_expirees(), public.fichiers_a_effacer() to service_role;