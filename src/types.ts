export type Role = "owner" | "admin" | "sales";
export type LeadStatus = "new" | "contacted" | "qualified" | "customer" | "lost";
export type TaskStatus = "todo" | "doing" | "done";
export type TaskPriority = "low" | "normal" | "high";

export type OrgInfo = { id: string; name: string; role: Role };

export type Company = {
  id: string; organization_id: string; name: string; sector: string | null; website: string | null;
  email: string | null; phone: string | null; owner_id: string | null; created_at: string;
};
export type Contact = {
  id: string; organization_id: string; company_id: string | null; first_name: string; last_name: string;
  email: string | null; phone: string | null; source: string | null; status: LeadStatus;
  owner_id: string | null; created_at: string;
  // Ajoutés par le module emails (v0.6)
  categorie_id?: string | null; statut_identite?: "confirmee" | "probable" | "incertaine";
};
export type Stage = { id: string; organization_id: string; name: string; position: number; probability: number };
export type Opportunity = {
  id: string; organization_id: string; title: string; company_id: string | null; contact_id: string | null;
  stage_id: string | null; amount: number; owner_id: string | null; closed_at: string | null;
  lost_reason: string | null; created_at: string; updated_at: string;
};
export type TaskRow = {
  id: string; organization_id: string; title: string; description: string | null; due_at: string | null;
  status: TaskStatus; priority: TaskPriority; owner_id: string | null; contact_id: string | null;
  opportunity_id: string | null; created_at: string;
};
export type ActivityRow = {
  id: string; organization_id: string; type: string; body: string; actor_id: string | null;
  contact_id: string | null; opportunity_id: string | null; created_at: string;
};
export type Member = { user_id: string; role: Role; full_name: string | null };
export type AutomationRule = {
  id: string; organization_id: string; code: string; name: string; enabled: boolean; config: Record<string, unknown>;
};
export type AutomationRun = {
  id: string; organization_id: string; rule_id: string | null; event_key: string;
  status: "success" | "failed" | "skipped"; details: Record<string, unknown>; created_at: string;
};
export type Invitation = { id: string; organization_id: string; email: string; role: Role; created_at: string };
export type AppointmentStatus = "scheduled" | "done" | "cancelled";
export type Appointment = {
  id: string; organization_id: string; title: string; starts_at: string; ends_at: string | null;
  location: string | null; notes: string | null; urgent: boolean; status: AppointmentStatus;
  contact_id: string | null; owner_id: string | null; source: string | null; external_id: string | null;
  created_at: string; updated_at: string;
};
export type InvoiceStatus = "unpaid" | "paid";
export type Invoice = {
  id: string; organization_id: string; number: string | null; client_name: string | null;
  company_id: string | null; contact_id: string | null; amount: number; currency: string;
  issued_at: string | null; due_at: string | null; paid_at: string | null; status: InvoiceStatus;
  notes: string | null; source: string | null; external_id: string | null; created_at: string;
};
export type EmailStatus = "recu" | "en_analyse" | "classe" | "a_verifier" | "traite" | "ignore" | "erreur";
export type EmailRow = {
  id: string; organization_id: string; boite_mail_id: string; contact_id: string | null;
  expediteur_normalise: string; expediteur_nom: string | null; objet: string | null; extrait: string | null;
  recu_le: string; type_message_id: string | null; confiance: number | null;
  niveau_confiance: "eleve" | "moyen" | "faible" | null; resume: string | null; action_recommandee: string | null;
  points_a_verifier: string[]; nature_message: string; statut_traitement: EmailStatus;
  nb_pieces_jointes: number; derniere_erreur: string | null; traite_le: string | null;
};
export type MessageType = { id: string; code: string; libelle: string; position: number };
export type ContactCategory = { id: string; code: string; libelle: string; position: number };
export type Mailbox = { id: string; adresse_email: string; libelle: string | null };
export type Attachment = {
  id: string; nom_fichier: string; type_mime: string | null; taille_octets: number | null;
  statut: string; motif_rejet: string | null; storage_bucket: string; storage_chemin: string | null;
};
export type EmailDetail = {
  corps_texte: string | null; pieces: Attachment[];
  created: { tache_id?: string; activite_id?: string; rdv_id?: string; opportunite_id?: string; garde?: string; erreur?: string } | null;
  justification: string | null;
};
export type IntegrationInfo = { token_hint: string; created_at: string; last_used_at: string | null } | null;

export type Workspace = {
  companies: Company[]; contacts: Contact[]; stages: Stage[]; opportunities: Opportunity[];
  tasks: TaskRow[]; activities: ActivityRow[]; members: Member[]; invitations: Invitation[];
  rules: AutomationRule[]; runs: AutomationRun[]; appointments: Appointment[]; invoices: Invoice[];
  emails: EmailRow[]; messageTypes: MessageType[]; categories: ContactCategory[]; mailboxes: Mailbox[];
};
export const emptyWorkspace: Workspace = {
  companies: [], contacts: [], stages: [], opportunities: [], tasks: [], activities: [], members: [], invitations: [], rules: [], runs: [],
  appointments: [], invoices: [], emails: [], messageTypes: [], categories: [], mailboxes: []
};

// Vues prêtes à afficher
export type LeadRow = {
  id: string; name: string; company: string; email: string; phone: string;
  source: string; status: LeadStatus; owner: string;
};
export type DealRow = {
  id: string; title: string; company: string; contact: string; amount: number; stageId: string | null; owner: string;
};
export type TaskView = {
  id: string; title: string; related: string; owner: string; due: string | null;
  status: TaskStatus; priority: TaskPriority; overdue: boolean;
};

// Valeurs saisies dans les formulaires (création et modification)
export type LeadInput = { firstName: string; lastName: string; company: string; email: string; phone: string; source: string };
export type DealInput = { title: string; amount: number; companyId: string | null; contactId: string | null; stageId: string | null };
export type TaskInput = { title: string; dueDate: string; priority: TaskPriority; contactId: string | null };
export type AppointmentInput = {
  title: string; date: string; start: string; end: string; location: string; notes: string; urgent: boolean; contactId: string | null;
};
export type InvoiceInput = { number: string; clientName: string; amount: number; issuedAt: string; dueAt: string; status: InvoiceStatus };
/** Éléments modifiables ou supprimables depuis l'interface. */
export type EditableKind = "lead" | "deal" | "task" | "appointment" | "invoice";
