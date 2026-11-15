import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  Activity, ArrowDownRight, ArrowUpRight, Bot, Building2, CalendarClock, Check, CircleHelp,
  Clock3, Plus, Settings, Sparkles, Target, Users
} from "lucide-react";
import type {
  ActivityRow as ActivityData, AutomationRule as AutomationRuleData, AutomationRun as AutomationRunData, DealRow, Invitation, LeadRow, LeadStatus, Member, OrgInfo, Stage, TaskStatus, TaskView
} from "../types";

export type Page = "dashboard" | "leads" | "pipeline" | "tasks" | "agenda" | "invoices" | "automation" | "assistant" | "settings";

export const money = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "Nouveau", contacted: "Contacté", qualified: "Qualifié", customer: "Client", lost: "Perdu"
};
const PRIORITY_LABELS = { high: "Haute", normal: "Normale", low: "Basse" } as const;
const ROLE_LABELS = { owner: "Propriétaire", admin: "Administrateur", sales: "Commercial" } as const;
const CLOSED_STAGES = ["Gagné", "Perdu"];

export function PageHeading({ eyebrow, title, desc, action }: { eyebrow: string; title: string; desc: string; action?: ReactNode }) {
  return (
    <div className="page-heading">
      <div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{desc}</p></div>
      {action}
    </div>
  );
}
export function Kpi({ label, value, change, icon, alert = false }: { label: string; value: string; change: string; icon: ReactNode; alert?: boolean }) {
  return (
    <div className="kpi-card">
      <div className="kpi-top"><span>{label}</span><div className={`kpi-icon ${alert ? "red" : ""}`}>{icon}</div></div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-change">{change}</div>
    </div>
  );
}

const ACTIVITY_LABELS: Record<string, string> = {
  call: "Appel", email: "Email", meeting: "Rendez-vous", demo: "Démonstration", note: "Note", stage_change: "Changement d'étape"
};

export function Dashboard({ firstName, leadCount, deals, stages, tasks, overdue, pipelineValue, activities, onNavigate, onAddLead }: {
  firstName: string; leadCount: number; deals: DealRow[]; stages: Stage[]; tasks: TaskView[]; overdue: number;
  pipelineValue: number; activities: ActivityData[]; onNavigate: (p: Page) => void; onAddLead: () => void;
}) {
  const openTasks = tasks.filter(t => t.status !== "done");
  const openStages = stages.filter(s => !CLOSED_STAGES.includes(s.name));
  const openDeals = deals.filter(d => openStages.some(s => s.id === d.stageId));
  const today = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return (
    <>
      <PageHeading eyebrow={today.toUpperCase()} title={firstName ? `Bonjour, ${firstName}.` : "Bonjour."}
        desc="Voici l'état de votre activité commerciale."
        action={<button type="button" className="primary" onClick={onAddLead}><Plus size={16} /> Nouveau prospect</button>} />
      <div className="kpi-grid">
        <Kpi label="Prospects & clients" value={String(leadCount)} change="Contacts suivis" icon={<Users />} />
        <Kpi label="Pipeline commercial" value={money(pipelineValue)} change={`${openDeals.length} opportunité(s) ouverte(s)`} icon={<Target />} />
        <Kpi label="Tâches en cours" value={String(openTasks.length)} change="À traiter" icon={<CalendarClock />} />
        <Kpi label="Relances en retard" value={String(overdue)} change={overdue ? "Nécessitent votre attention" : "Aucun retard"} icon={<Clock3 />} alert={overdue > 0} />
      </div>
      <div className="dashboard-grid">
        <section className="panel pipeline-panel">
          <div className="panel-head">
            <div><h3>Pipeline commercial</h3><p>Opportunités ouvertes par étape</p></div>
            <button type="button" className="text-btn" onClick={() => onNavigate("pipeline")}>Voir le pipeline <ArrowUpRight size={14} /></button>
          </div>
          <div className="stage-bars">
            {openStages.map(s => {
              const n = deals.filter(d => d.stageId === s.id).length;
              const width = openDeals.length ? Math.max((n / openDeals.length) * 100, n ? 4 : 0) : 0;
              return (
                <div className="stage-row" key={s.id}>
                  <span>{s.name}</span>
                  <div className="bar-track"><div className="bar-fill" style={{ width: `${width}%` }} /></div>
                  <b>{n}</b>
                </div>
              );
            })}
            {openStages.length === 0 && <div className="empty">Aucune étape de pipeline.</div>}
          </div>
          <div className="panel-foot"><span>Valeur totale du pipeline</span><b>{money(pipelineValue)}</b></div>
        </section>
        <section className="panel tasks-panel">
          <div className="panel-head">
            <div><h3>Prochaines actions</h3><p>Vos tâches ouvertes</p></div>
            <button type="button" className="text-btn" onClick={() => onNavigate("tasks")}>Tout voir <ArrowUpRight size={14} /></button>
          </div>
          {openTasks.slice(0, 4).map(t => (
            <div className="mini-task" key={t.id}>
              <div className="task-check" />
              <div><b>{t.title}</b><small>{t.related}{t.due ? ` · ${t.due}` : ""}</small></div>
              <span className={`priority ${t.priority}`}>{PRIORITY_LABELS[t.priority]}</span>
            </div>
          ))}
          {openTasks.length === 0 && <div className="empty">Aucune tâche ouverte.</div>}
        </section>
      </div>
      <section className="panel activity-panel">
        <div className="panel-head"><div><h3>Activité récente</h3><p>Derniers mouvements de votre portefeuille</p></div></div>
        <div className="activity-list">
          {activities.map(a => (
            <div className="activity-row" key={a.id}>
              <div className="activity-icon">{a.type === "stage_change" ? <Target /> : <Activity />}</div>
              <div><b>{ACTIVITY_LABELS[a.type] ?? "Activité"}</b><small>{a.body}</small></div>
              <time>{new Date(a.created_at).toLocaleDateString("fr-FR")}</time>
            </div>
          ))}
          {activities.length === 0 && <div className="empty">Aucune activité pour le moment.</div>}
        </div>
      </section>
    </>
  );
}

export function Leads({ leads, total, onAdd, onStatus, canDelete, onDelete }: {
  leads: LeadRow[]; total: number; onAdd: () => void; onStatus: (id: string, s: LeadStatus) => void;
  canDelete: boolean; onDelete: (l: LeadRow) => void;
}) {
  return (
    <>
      <PageHeading eyebrow="GESTION DE LA RELATION CLIENT" title="Prospects & clients"
        desc="Centralisez vos contacts et ne laissez plus aucune opportunité vous échapper."
        action={<button type="button" className="primary" onClick={onAdd}><Plus size={16} /> Ajouter un prospect</button>} />
      <section className="panel table-panel">
        <div className="panel-head"><div><h3>Votre portefeuille</h3><p>{leads.length} contact(s) affiché(s) sur {total}</p></div></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>CONTACT</th><th>ENTREPRISE</th><th>EMAIL</th><th>SOURCE</th><th>STATUT</th><th>RESPONSABLE</th>{canDelete && <th></th>}</tr></thead>
            <tbody>
              {leads.map(l => (
                <tr key={l.id}>
                  <td><b>{l.name}</b></td><td>{l.company || "—"}</td><td>{l.email || "—"}</td><td>{l.source}</td>
                  <td>
                    <select className={`status-select status ${l.status}`} value={l.status} aria-label={`Statut de ${l.name}`}
                      onChange={e => onStatus(l.id, e.target.value as LeadStatus)}>
                      {(Object.keys(STATUS_LABELS) as LeadStatus[]).map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                    </select>
                  </td>
                  <td>{l.owner}</td>
                  {canDelete && <td><button type="button" className="row-btn" onClick={() => onDelete(l)}>Supprimer</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {leads.length === 0 && (
          <div className="empty">{total === 0 ? "Aucun prospect pour le moment. Ajoutez le premier avec le bouton ci-dessus." : "Aucun prospect ne correspond à votre recherche."}</div>
        )}
      </section>
    </>
  );
}

export function Pipeline({ deals, stages, onMove, onAdd }: {
  deals: DealRow[]; stages: Stage[]; onMove: (id: string, stageId: string) => void; onAdd: () => void;
}) {
  return (
    <>
      <PageHeading eyebrow="SUIVI DES VENTES" title="Pipeline commercial" desc="Visualisez vos opportunités et faites avancer chaque vente."
        action={<button type="button" className="primary" onClick={onAdd}><Plus size={16} /> Nouvelle opportunité</button>} />
      <div className="kanban">
        {stages.map(s => {
          const col = deals.filter(d => d.stageId === s.id);
          return (
            <div className="kanban-col" key={s.id}>
              <div className="kanban-head"><b>{s.name}</b><span>{col.length}</span></div>
              {col.map(d => (
                <div className="deal-card" key={d.id}>
                  <small>{d.company || "Sans entreprise"}</small><b>{d.title}</b><strong>{money(d.amount)}</strong>
                  <div className="deal-foot">
                    <span>{d.owner}</span>
                    <select value={s.id} onChange={e => onMove(d.id, e.target.value)} aria-label={`Changer l'étape de ${d.title}`}>
                      {stages.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}

export function Tasks({ tasks, onToggle, onAdd }: { tasks: TaskView[]; onToggle: (id: string, s: TaskStatus) => void; onAdd: () => void }) {
  return (
    <>
      <PageHeading eyebrow="ORGANISATION COMMERCIALE" title="Tâches & relances" desc="Priorisez vos actions et gardez le contrôle de vos suivis."
        action={<button type="button" className="primary" onClick={onAdd}><Plus size={16} /> Nouvelle tâche</button>} />
      <section className="panel task-list-panel">
        <div className="panel-head"><div><h3>Liste des actions</h3><p>{tasks.filter(t => t.status !== "done").length} tâche(s) ouverte(s)</p></div></div>
        {tasks.map(t => (
          <div className="task-line" key={t.id}>
            <button type="button" className={`task-check ${t.status === "done" ? "checked" : ""}`}
              aria-label={t.status === "done" ? "Rouvrir la tâche" : "Marquer comme terminée"}
              onClick={() => onToggle(t.id, t.status === "done" ? "todo" : "done")}>
              {t.status === "done" && <Check size={12} />}
            </button>
            <div className="task-main">
              <b className={t.status === "done" ? "strike" : ""}>{t.title}</b>
              <small>{t.related} · {t.owner}</small>
            </div>
            <span className={`priority ${t.priority}`}>{PRIORITY_LABELS[t.priority]}</span>
            <time className={t.overdue ? "overdue-date" : ""}>{t.due ?? "Sans échéance"}</time>
          </div>
        ))}
        {tasks.length === 0 && <div className="empty">Aucune tâche. Créez-en une avec le bouton ci-dessus.</div>}
      </section>
    </>
  );
}

const RULE_TEXT: Record<string, { desc: string; detail: (c: Record<string, unknown>) => string }> = {
  NEW_CONTACT_TASK: {
    desc: "À la création d'un prospect, une tâche « Premier contact » est créée pour son responsable.",
    detail: c => `Échéance : J+${Number(c.delay_days ?? 1)}`
  },
  STAGE_CHANGE_LOG: {
    desc: "Chaque déplacement d'une opportunité dans le pipeline est enregistré dans l'activité récente.",
    detail: () => "Automatique"
  },
  STALE_DEAL_ALERT: {
    desc: "Chaque jour vers 7 h, une tâche de relance est créée pour les opportunités ouvertes sans mise à jour depuis plusieurs jours.",
    detail: c => `Seuil : ${Number(c.days ?? 7)} jours (une alerte par période d'inactivité)`
  }
};

function runSummary(r: AutomationRunData): string {
  if (r.status === "failed") return `Échec : ${String(r.details?.error ?? "erreur inconnue")}`;
  if (r.event_key.startsWith("stale:")) return "Tâche de relance créée";
  if (r.event_key.startsWith("contact:")) return "Tâche de premier contact créée";
  if (r.event_key.startsWith("opp:")) return "Changement d'étape tracé";
  if (r.event_key.startsWith("make:")) {
    const types: Record<string, string> = {
      contact: "prospect", lead: "prospect", prospect: "prospect", company: "entreprise", empresa: "entreprise", entreprise: "entreprise",
      opportunity: "opportunité", deal: "opportunité", oportunidad: "opportunité", opportunite: "opportunité",
      appointment: "rendez-vous", cita: "rendez-vous", rdv: "rendez-vous", "rendez-vous": "rendez-vous", meeting: "rendez-vous",
      invoice: "facture", factura: "facture", facture: "facture"
    };
    const t = types[String(r.details?.type ?? "")] ?? "élément";
    return `Import Make : ${t} ${r.details?.action === "updated" ? "mis à jour" : "ajouté"}`;
  }
  return "Exécutée";
}

export function Automation({ rules, runs, canEdit, onToggle }: {
  rules: AutomationRuleData[]; runs: AutomationRunData[]; canEdit: boolean; onToggle: (id: string, enabled: boolean) => void;
}) {
  const ruleName = (id: string | null) => rules.find(r => r.id === id)?.name ?? "Règle supprimée";
  return (
    <>
      <PageHeading eyebrow="PRODUCTIVITÉ" title="Automatisations" desc="Des règles simples, exécutées côté serveur, pour ne plus oublier les actions commerciales importantes." />
      <div className="automation-grid">
        {rules.map(r => {
          const t = RULE_TEXT[r.code];
          return (
            <div className="panel automation-card" key={r.id}>
              <div className="automation-top">
                <div className="automation-icon"><Activity /></div>
                <span className={`status ${r.enabled ? "qualified" : "new"}`}>{r.enabled ? "Actif" : "Désactivé"}</span>
              </div>
              <small>{r.code}</small><h3>{r.name}</h3>
              <p>{t?.desc ?? "Règle personnalisée."}</p>
              <p className="muted">{t ? t.detail(r.config) : ""}</p>
              {canEdit ? (
                <button type="button" className="secondary" onClick={() => onToggle(r.id, !r.enabled)}>
                  {r.enabled ? "Désactiver" : "Activer"}
                </button>
              ) : (
                <p className="muted">Seuls les propriétaires et administrateurs peuvent modifier cette règle.</p>
              )}
            </div>
          );
        })}
        {rules.length === 0 && <div className="empty">Aucune règle disponible pour cette organisation.</div>}
      </div>
      <section className="panel table-panel" style={{ marginTop: 18 }}>
        <div className="panel-head"><div><h3>Dernières exécutions</h3><p>Journal des règles (12 dernières)</p></div></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>DATE</th><th>RÈGLE</th><th>RÉSULTAT</th></tr></thead>
            <tbody>
              {runs.map(r => (
                <tr key={r.id}>
                  <td>{new Date(r.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</td>
                  <td>{r.event_key.startsWith("make:") ? "Intégration Make" : ruleName(r.rule_id)}</td>
                  <td><span className={`status ${r.status === "failed" ? "lost" : "qualified"}`}>{runSummary(r)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {runs.length === 0 && <div className="empty">Aucune exécution pour le moment. Créez un prospect pour voir la première règle s'exécuter.</div>}
      </section>
      <div className="callout"><CircleHelp size={18} /><p>Les règles s'exécutent dans la base de données, même si l'application est fermée. Une règle qui échoue n'empêche jamais l'action de l'utilisateur : l'erreur est simplement inscrite dans ce journal.</p></div>
    </>
  );
}

export function Assistant() {
  return (
    <>
      <PageHeading eyebrow="INTELLIGENCE COMMERCIALE" title="Assistant IA" desc="Préparez vos relances et obtenez une aide à la qualification de vos prospects." />
      <div className="ai-layout">
        <div className="panel ai-main">
          <div className="ai-orb"><Bot size={28} /></div>
          <h2>Votre copilote commercial</h2>
          <p>Fonctionnalité prévue : analyser le contexte d'un prospect, résumer vos échanges et préparer un message de relance adapté.</p>
          <div className="ai-feature"><Sparkles /><div><b>Qualification assistée</b><small>Repérer les informations manquantes et les signaux d'intérêt.</small></div></div>
          <div className="ai-feature"><Activity /><div><b>Résumé de fiche</b><small>Retrouver rapidement l'historique et les prochaines actions.</small></div></div>
          <div className="ai-feature"><ArrowDownRight /><div><b>Brouillon de relance</b><small>Rédiger un message modifiable, jamais envoyé sans validation.</small></div></div>
          <div className="callout"><CircleHelp size={18} /><p>IA non configurée : elle n'est pas disponible dans cette version. Aucun faux résultat IA n'est affiché.</p></div>
        </div>
        <div className="panel ai-side">
          <h3>Principes de l'assistant</h3><p>La décision finale reste toujours entre vos mains.</p>
          <ul><li>Suggestions vérifiables</li><li>Validation humaine obligatoire</li><li>Aucun envoi automatique</li><li>Respect des permissions CRM</li></ul>
        </div>
      </div>
    </>
  );
}

export function SettingsPage({ org, email, members, invitations, currentUserId, canInvite, busy, onInvite, onRevoke, onSignOut, canExport, onExport, integration }: {
  org: OrgInfo; email: string; members: Member[]; invitations: Invitation[]; currentUserId: string; canInvite: boolean;
  busy: boolean; onInvite: (email: string, role: "admin" | "sales") => Promise<string | null>;
  onRevoke: (id: string) => void; onSignOut: () => void; canExport: boolean; onExport: () => void; integration?: ReactNode;
}) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "sales">("sales");
  const [inviteError, setInviteError] = useState("");

  async function submitInvite(e: FormEvent) {
    e.preventDefault();
    setInviteError("");
    if (!/^\S+@\S+\.\S+$/.test(inviteEmail.trim())) { setInviteError("Adresse email invalide."); return; }
    const err = await onInvite(inviteEmail, inviteRole);
    if (err) setInviteError(err); else setInviteEmail("");
  }

  return (
    <>
      <PageHeading eyebrow="CONFIGURATION" title="Paramètres" desc="Votre espace de travail VALTIQ." />
      <div className="settings-grid">
        <div className="panel setting-card"><Building2 /><h3>Organisation</h3><p>{org.name}</p><p>Votre rôle : {ROLE_LABELS[org.role]}</p></div>
        <div className="panel setting-card"><Users /><h3>Compte</h3><p>{email}</p><button type="button" className="secondary" onClick={onSignOut}>Se déconnecter</button></div>
      </div>
      <section className="panel table-panel">
        <div className="panel-head"><div><h3>Équipe</h3><p>{members.length} membre(s)</p></div></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>NOM</th><th>RÔLE</th></tr></thead>
            <tbody>
              {members.map(m => (
                <tr key={m.user_id}><td><b>{m.full_name || "Membre"}{m.user_id === currentUserId ? " (vous)" : ""}</b></td><td>{ROLE_LABELS[m.role]}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {canInvite && (
        <section className="panel invite-panel">
          <div className="panel-head"><div><h3>Inviter un collègue</h3>
            <p>Aucun email n'est envoyé : donnez-lui l'adresse de l'application. Dès qu'il crée son compte (ou se connecte) avec cet email, il rejoint « {org.name} ».</p></div></div>
          <form onSubmit={submitInvite} noValidate className="invite-form">
            <label>Email du collègue
              <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="collegue@entreprise.fr" />
            </label>
            <label>Rôle
              <select value={inviteRole} onChange={e => setInviteRole(e.target.value as "admin" | "sales")}>
                <option value="sales">Commercial (crée et modifie)</option>
                <option value="admin">Administrateur (supprime, invite)</option>
              </select>
            </label>
            <button type="submit" className="primary" disabled={busy}>Inviter</button>
          </form>
          {inviteError && <div className="form-error" role="alert">{inviteError}</div>}
          {invitations.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead><tr><th>INVITATION EN ATTENTE</th><th>RÔLE</th><th></th></tr></thead>
                <tbody>
                  {invitations.map(i => (
                    <tr key={i.id}>
                      <td>{i.email}</td><td>{ROLE_LABELS[i.role]}</td>
                      <td><button type="button" className="text-btn" onClick={() => onRevoke(i.id)}>Annuler</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
      {integration}
      <section className="panel invite-panel">
        <div className="panel-head"><div><h3>Données personnelles</h3>
          <p>Vos droits d'accès, de portabilité et d'effacement. Consultez la <a href="#/confidentialite">politique de confidentialité</a>.</p></div></div>
        {canExport
          ? <button type="button" className="secondary" disabled={busy} onClick={onExport}>Exporter les données de l'organisation (JSON)</button>
          : <p className="muted">L'export est réservé aux propriétaires et administrateurs.</p>}
        <p className="muted">Pour supprimer un contact : page Prospects, bouton « Supprimer » (propriétaires et administrateurs). Pour supprimer votre compte ou l'organisation, contactez-nous.</p>
      </section>
      <div className="callout"><Settings size={18} /><p>Connecté à Supabase. Vos données sont isolées par organisation.</p></div>
    </>
  );
}
