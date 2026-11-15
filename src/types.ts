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

export type Workspace = {
  companies: Company[]; contacts: Contact[]; stages: Stage[]; opportunities: Opportunity[];
  tasks: TaskRow[]; activities: ActivityRow[]; members: Member[]; invitations: Invitation[];
  rules: AutomationRule[]; runs: AutomationRun[];
};
export const emptyWorkspace: Workspace = {
  companies: [], contacts: [], stages: [], opportunities: [], tasks: [], activities: [], members: [], invitations: [], rules: [], runs: []
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
