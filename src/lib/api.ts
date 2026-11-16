import { supabase } from "./supabase";
import { t } from "../i18n";
import type {
  ActivityRow, Appointment, AppointmentStatus, AutomationRule, AutomationRun, Company, IntegrationInfo, Invoice, InvoiceStatus,
  Attachment, ContactCategory, EmailDetail, EmailRow, EmailStatus, Mailbox, MessageType, Contact, Invitation, LeadStatus, Member, OrgInfo, Opportunity, Role, Stage,
  TaskPriority, TaskRow, TaskStatus, Workspace
} from "../types";

function db() {
  if (!supabase) throw new Error(t("Supabase n'est pas configuré (fichier .env)."));
  return supabase;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrap(res: { data: any; error: { message: string } | null }): any {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export function errMsg(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/Invalid login credentials/i.test(m)) return t("Email ou mot de passe incorrect.");
  if (/User already registered/i.test(m)) return t("Un compte existe déjà avec cet email.");
  if (/Email not confirmed/i.test(m)) return t("Email non confirmé : cliquez sur le lien reçu par email.");
  if (/duplicate key/i.test(m) && /invitations/i.test(m)) return t("Une invitation est déjà en attente pour cet email.");
  if (/row-level security/i.test(m)) return t("Action refusée : vous n'avez pas les droits nécessaires.");
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return t("Connexion impossible. Vérifiez votre accès à Internet puis réessayez.");
  // Messages connus renvoyés par la base (ex. « Action réservée aux propriétaires et administrateurs. »)
  return t(m);
}

export async function listMemberships(userId: string): Promise<OrgInfo[]> {
  const rows = unwrap(
    await db().from("organization_members").select("organization_id, role, organizations(name)").eq("user_id", userId)
  ) as any[];
  return (rows ?? []).map((r: any) => {
    const o = Array.isArray(r.organizations) ? r.organizations[0] : r.organizations;
    return { id: r.organization_id as string, role: r.role, name: (o?.name as string) ?? "Organisation" };
  });
}

export async function createOrganization(name: string): Promise<string> {
  const id = unwrap(await db().rpc("create_organization", { org_name: name }));
  return id as string;
}

export async function loadWorkspace(orgId: string): Promise<Workspace> {
  const c = db();
  const [companies, contacts, stages, opps, tasks, acts, members] = await Promise.all([
    c.from("companies").select("*").eq("organization_id", orgId).order("name"),
    c.from("contacts").select("*").eq("organization_id", orgId).order("created_at", { ascending: false }),
    c.from("pipeline_stages").select("*").eq("organization_id", orgId).order("position"),
    c.from("opportunities").select("*").eq("organization_id", orgId).order("updated_at", { ascending: false }),
    c.from("tasks").select("*").eq("organization_id", orgId).order("due_at", { ascending: true, nullsFirst: false }),
    c.from("activities").select("*").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(8),
    c.from("organization_members").select("user_id, role, profiles(full_name)").eq("organization_id", orgId)
  ]);
  // Les invitations n'existent qu'après la migration SQL v0.3 : on ignore l'erreur si la table est absente
  const invRes = await c.from("invitations").select("*").eq("organization_id", orgId).order("created_at", { ascending: false });
  const rulesRes = await c.from("automation_rules").select("*").eq("organization_id", orgId).order("code");
  const runsRes = await c.from("automation_runs").select("*").eq("organization_id", orgId)
    .order("created_at", { ascending: false }).limit(12);
  // Rendez-vous et factures : tables ajoutées par la migration v0.5 (erreur ignorée si absentes)
  const since = new Date(); since.setDate(since.getDate() - 120);
  const apptRes = await c.from("appointments").select("*").eq("organization_id", orgId)
    .gte("starts_at", since.toISOString()).order("starts_at").limit(2000);
  const invRes2 = await c.from("invoices").select("*").eq("organization_id", orgId)
    .order("due_at", { ascending: true, nullsFirst: false }).limit(2000);
  // Module emails (migrations v0.6 / v0.7 de l'équipe Automatisation) : ignoré si absent
  const EMAIL_COLS = "id, organization_id, boite_mail_id, contact_id, expediteur_normalise, expediteur_nom, objet, extrait, recu_le, "
    + "type_message_id, confiance, niveau_confiance, resume, action_recommandee, points_a_verifier, nature_message, "
    + "statut_traitement, nb_pieces_jointes, derniere_erreur, traite_le";
  const [emailsRes, typesRes, catsRes, boxesRes] = await Promise.all([
    c.from("emails").select(EMAIL_COLS).eq("organization_id", orgId).order("recu_le", { ascending: false }).limit(300),
    c.from("types_messages").select("id, code, libelle, position").eq("actif", true).order("position"),
    c.from("categories_contacts").select("id, code, libelle, position").eq("actif", true).order("position"),
    c.from("boites_mail").select("id, adresse_email, libelle").eq("organization_id", orgId)
  ]);
  return {
    emails: ((emailsRes.error ? [] : (emailsRes.data ?? [])) as any[]).map((e: any) => ({
      ...e, confiance: e.confiance === null ? null : Number(e.confiance), points_a_verifier: e.points_a_verifier ?? []
    })) as EmailRow[],
    messageTypes: (typesRes.error ? [] : (typesRes.data ?? [])) as MessageType[],
    categories: (catsRes.error ? [] : (catsRes.data ?? [])) as ContactCategory[],
    mailboxes: (boxesRes.error ? [] : (boxesRes.data ?? [])) as Mailbox[],
    appointments: (apptRes.error ? [] : (apptRes.data ?? [])) as Appointment[],
    invoices: ((invRes2.error ? [] : (invRes2.data ?? [])) as any[]).map((i: any) => ({ ...i, amount: Number(i.amount) })) as Invoice[],
    rules: (rulesRes.error ? [] : (rulesRes.data ?? [])) as AutomationRule[],
    runs: (runsRes.error ? [] : (runsRes.data ?? [])) as AutomationRun[],
    invitations: (invRes.error ? [] : (invRes.data ?? [])) as Invitation[],
    companies: (unwrap(companies) ?? []) as Company[],
    contacts: (unwrap(contacts) ?? []) as Contact[],
    stages: (unwrap(stages) ?? []) as Stage[],
    opportunities: ((unwrap(opps) ?? []) as any[]).map((o: any) => ({ ...o, amount: Number(o.amount) })) as Opportunity[],
    tasks: (unwrap(tasks) ?? []) as TaskRow[],
    activities: (unwrap(acts) ?? []) as ActivityRow[],
    members: ((unwrap(members) ?? []) as any[]).map((m: any) => {
      const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
      return { user_id: m.user_id, role: m.role, full_name: p?.full_name ?? null } as Member;
    })
  };
}

export async function addLead(
  orgId: string, userId: string, companies: Company[],
  input: { firstName: string; lastName: string; company: string; email: string; phone: string; source: string }
) {
  let companyId: string | null = null;
  const name = input.company.trim();
  if (name) {
    const existing = companies.find(x => x.name.trim().toLowerCase() === name.toLowerCase());
    if (existing) companyId = existing.id;
    else {
      const row = unwrap(
        await db().from("companies").insert({ organization_id: orgId, name, owner_id: userId }).select("id").single()
      );
      companyId = row.id as string;
    }
  }
  unwrap(
    await db().from("contacts").insert({
      organization_id: orgId, company_id: companyId,
      first_name: input.firstName.trim(), last_name: input.lastName.trim(),
      email: input.email.trim() || null, phone: input.phone.trim() || null,
      source: input.source.trim() || "Saisie manuelle", owner_id: userId
    })
  );
}

export async function updateContactStatus(id: string, status: LeadStatus) {
  unwrap(await db().from("contacts").update({ status }).eq("id", id));
}

export async function addOpportunity(
  orgId: string, userId: string,
  input: { title: string; amount: number; companyId: string | null; contactId: string | null; stageId: string | null }
) {
  unwrap(
    await db().from("opportunities").insert({
      organization_id: orgId, title: input.title.trim(), amount: input.amount,
      company_id: input.companyId, contact_id: input.contactId, stage_id: input.stageId, owner_id: userId
    })
  );
}

export async function moveOpportunity(opp: Opportunity, stage: Stage, userId: string) {
  const closed = stage.name === "Gagné" || stage.name === "Perdu";
  unwrap(
    await db().from("opportunities")
      .update({ stage_id: stage.id, closed_at: closed ? new Date().toISOString() : null })
      .eq("id", opp.id)
  );
  // L'activité « changement d'étape » est créée par la règle STAGE_CHANGE_LOG (côté base de données).
  void userId;
}

export async function setRuleEnabled(id: string, enabled: boolean) {
  unwrap(await db().from("automation_rules").update({ enabled }).eq("id", id));
}

export async function addTask(
  orgId: string, userId: string,
  input: { title: string; dueDate: string; priority: TaskPriority; contactId: string | null }
) {
  unwrap(
    await db().from("tasks").insert({
      organization_id: orgId, title: input.title.trim(), priority: input.priority,
      due_at: input.dueDate ? new Date(input.dueDate + "T12:00:00").toISOString() : null,
      contact_id: input.contactId, owner_id: userId
    })
  );
}

export async function setTaskStatus(id: string, status: TaskStatus) {
  unwrap(await db().from("tasks").update({ status }).eq("id", id));
}

// Rattache l'utilisateur connecté aux organisations qui l'ont invité (par email)
export async function acceptInvitations(): Promise<number> {
  const n = unwrap(await db().rpc("accept_invitations"));
  return Number(n) || 0;
}

export async function inviteMember(orgId: string, userId: string, email: string, role: Exclude<Role, "owner">) {
  unwrap(
    await db().from("invitations").insert({ organization_id: orgId, email: email.trim().toLowerCase(), role, invited_by: userId })
  );
}

export async function revokeInvitation(id: string) {
  unwrap(await db().from("invitations").delete().eq("id", id));
}

// RGPD : suppression définitive d'un contact (ses activités liées sont supprimées en cascade ; les opportunités sont conservées sans contact)
export async function deleteContact(id: string) {
  unwrap(await db().from("contacts").delete().eq("id", id));
}

// RGPD : export complet des données de l'organisation (droit d'accès / portabilité)
export async function exportOrganization(orgId: string): Promise<Blob> {
  const c = db();
  const tables = ["companies", "contacts", "pipeline_stages", "opportunities", "tasks", "activities", "appointments", "invoices", "automation_rules", "automation_runs"];
  const out: Record<string, unknown> = { exported_at: new Date().toISOString(), organization_id: orgId };
  for (const t of tables) {
    const { data, error } = await c.from(t).select("*").eq("organization_id", orgId);
    if (error) throw error;
    out[t] = data ?? [];
  }
  return new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
}

// ----- Rendez-vous -----
export async function addAppointment(
  orgId: string, userId: string,
  input: { title: string; date: string; start: string; end: string; location: string; notes: string; urgent: boolean; contactId: string | null }
) {
  const startsAt = new Date(`${input.date}T${input.start || "09:00"}`);
  const endsAt = input.end ? new Date(`${input.date}T${input.end}`) : null;
  unwrap(
    await db().from("appointments").insert({
      organization_id: orgId, title: input.title.trim(), starts_at: startsAt.toISOString(),
      ends_at: endsAt ? endsAt.toISOString() : null, location: input.location.trim() || null,
      notes: input.notes.trim() || null, urgent: input.urgent, contact_id: input.contactId,
      owner_id: userId, source: "Saisie manuelle"
    })
  );
}

export async function setAppointmentStatus(id: string, status: AppointmentStatus) {
  unwrap(await db().from("appointments").update({ status }).eq("id", id));
}

// ----- Factures -----
export async function addInvoice(
  orgId: string,
  input: { number: string; clientName: string; amount: number; issuedAt: string; dueAt: string; status: InvoiceStatus }
) {
  unwrap(
    await db().from("invoices").insert({
      organization_id: orgId, number: input.number.trim() || null, client_name: input.clientName.trim() || null,
      amount: input.amount, issued_at: input.issuedAt || null, due_at: input.dueAt || null,
      status: input.status, source: "Saisie manuelle"
    })
  );
}

export async function setInvoiceStatus(id: string, status: InvoiceStatus) {
  unwrap(await db().from("invoices").update({ status }).eq("id", id));
}

// ----- Intégration Make (clé par organisation) -----
export async function getIntegrationInfo(orgId: string): Promise<IntegrationInfo> {
  const { data, error } = await db().rpc("integration_token_info", { p_org: orgId });
  if (error) return null;
  const rows = (data ?? []) as { token_hint: string; created_at: string; last_used_at: string | null }[];
  return rows[0] ?? null;
}

export async function createIntegrationToken(orgId: string): Promise<string> {
  return unwrap(await db().rpc("create_integration_token", { p_org: orgId })) as string;
}

export async function revokeIntegrationToken(orgId: string) {
  unwrap(await db().rpc("revoke_integration_token", { p_org: orgId }));
}

// ----- Boîte de réception (module emails) -----
export async function loadEmailDetail(emailId: string): Promise<EmailDetail> {
  const c = db();
  const [body, pieces, runs, hist] = await Promise.all([
    c.from("emails").select("corps_texte").eq("id", emailId).single(),
    c.from("pieces_jointes").select("id, nom_fichier, type_mime, taille_octets, statut, motif_rejet, storage_bucket, storage_chemin")
      .eq("email_id", emailId).order("created_at"),
    c.from("automation_runs").select("event_key, details").like("event_key", `email:${emailId}:routage%`)
      .order("created_at", { ascending: false }).limit(1),
    c.from("historique_classification").select("justification, source, created_at").eq("email_id", emailId)
      .eq("source", "ia").order("created_at", { ascending: false }).limit(1)
  ]);
  const run = ((runs.data ?? []) as any[])[0];
  return {
    corps_texte: (unwrap(body) as any)?.corps_texte ?? null,
    pieces: (pieces.error ? [] : (pieces.data ?? [])) as Attachment[],
    created: run ? (run.details as EmailDetail["created"]) : null,
    justification: ((hist.data ?? []) as any[])[0]?.justification ?? null
  };
}

/** RGPD : chaque consultation d'un email ou téléchargement de pièce jointe est journalisé. */
export async function logEmailAccess(kind: "email" | "piece_jointe", id: string, action: "consultation" | "telechargement") {
  await db().rpc("journaliser_acces", { p_entite_type: kind, p_entite_id: id, p_action: action });
}

export async function correctClassification(input: {
  emailId: string; typeCode: string | null; categoryCode: string | null; contactId: string | null;
  confirmIdentity: boolean; comment: string;
}) {
  unwrap(await db().rpc("corriger_classification", {
    p_email_id: input.emailId, p_type_code: input.typeCode, p_categorie_code: input.categoryCode,
    p_contact_id: input.contactId, p_confirmer_identite: input.confirmIdentity, p_commentaire: input.comment.trim() || null
  }));
}

export async function setEmailStatus(id: string, status: EmailStatus) {
  unwrap(await db().from("emails").update({ statut_traitement: status }).eq("id", id));
}

export async function attachmentUrl(p: Attachment): Promise<string> {
  if (!p.storage_chemin) throw new Error(t("Ce fichier n'est pas disponible."));
  const { data, error } = await db().storage.from(p.storage_bucket).createSignedUrl(p.storage_chemin, 120);
  if (error || !data) throw new Error(t("Ce fichier n'est pas disponible."));
  await logEmailAccess("piece_jointe", p.id, "telechargement");
  return data.signedUrl;
}
