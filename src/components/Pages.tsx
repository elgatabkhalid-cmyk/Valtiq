import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  Activity, ArrowDownRight, ArrowUpRight, Bot, Building2, CalendarClock, Check, CircleHelp,
  Clock3, Inbox, Pencil, Plus, Settings, Sparkles, Target, Trash2, Users
} from "lucide-react";
import type {
  ActivityRow as ActivityData, AutomationRule as AutomationRuleData, AutomationRun as AutomationRunData, DealRow, Invitation, LeadRow, LeadStatus, Member, OrgInfo, Stage, TaskStatus, TaskView
} from "../types";
import { loc, t, tv } from "../i18n";
import { LangSwitch } from "./LangSwitch";
import { money as formatMoney } from "../lib/format";

export type Page = "dashboard" | "inbox" | "leads" | "pipeline" | "tasks" | "agenda" | "invoices" | "automation" | "assistant" | "settings";

/** Totaux du tableau de bord : arrondis à l'euro. */
const money = (n: number) => formatMoney(n, "EUR", 0);

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "Nouveau", contacted: "Contacté", qualified: "Qualifié", customer: "Client", lost: "Perdu"
};
const PRIORITY_LABELS = { high: "Haute", normal: "Normale", low: "Basse" } as const;
const ROLE_LABELS = { owner: "Propriétaire", admin: "Administrateur", sales: "Commercial" } as const;
const CLOSED_STAGES = ["Gagné", "Perdu"];

/** Boutons « Modifier » et « Supprimer » d'une ligne. Sans `onDelete` (droits insuffisants), seul « Modifier » s'affiche. */
export function RowActions({ name, onEdit, onDelete }: { name: string; onEdit: () => void; onDelete?: () => void }) {
  return (
    <span className="row-actions">
      <button type="button" className="icon-btn small" title={t("Modifier")} aria-label={t("Modifier « {name} »", { name })} onClick={onEdit}><Pencil size={14} /></button>
      {onDelete && <button type="button" className="icon-btn small danger" title={t("Supprimer")} aria-label={t("Supprimer « {name} »", { name })} onClick={onDelete}><Trash2 size={14} /></button>}
    </span>
  );
}

export function PageHeading({ eyebrow, title, desc, action }: { eyebrow: string; title: string; desc: string; action?: ReactNode }) {
  return (
    <div className="page-heading">
      <div><div className="eyebrow">{t(eyebrow)}</div><h1>{t(title)}</h1><p>{t(desc)}</p></div>
      {action}
    </div>
  );
}
export function Kpi({ label, value, change, icon, alert = false }: { label: string; value: string; change: string; icon: ReactNode; alert?: boolean }) {
  return (
    <div className="kpi-card">
      <div className="kpi-top"><span>{t(label)}</span><div className={`kpi-icon ${alert ? "red" : ""}`}>{icon}</div></div>
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
  const openTasks = tasks.filter(x => x.status !== "done");
  const openStages = stages.filter(s => !CLOSED_STAGES.includes(s.name));
  const openDeals = deals.filter(d => openStages.some(s => s.id === d.stageId));
  const today = new Date().toLocaleDateString(loc(), { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return (
    <>
      <PageHeading eyebrow={today.toUpperCase()} title={firstName ? t("Bonjour, {name}.", { name: firstName }) : t("Bonjour.")}
        desc="Voici l'état de votre activité commerciale."
        action={<button type="button" className="primary" onClick={onAddLead}><Plus size={16} /> {t("Nouveau prospect")}</button>} />
      <div className="kpi-grid">
        <Kpi label="Prospects & clients" value={String(leadCount)} change={t("Contacts suivis")} icon={<Users />} />
        <Kpi label="Pipeline commercial" value={money(pipelineValue)} change={t("{n} opportunité(s) ouverte(s)", { n: openDeals.length })} icon={<Target />} />
        <Kpi label="Tâches en cours" value={String(openTasks.length)} change={t("À traiter")} icon={<CalendarClock />} />
        <Kpi label="Relances en retard" value={String(overdue)} change={overdue ? t("Nécessitent votre attention") : t("Aucun retard")} icon={<Clock3 />} alert={overdue > 0} />
      </div>
      <div className="dashboard-grid">
        <section className="panel pipeline-panel">
          <div className="panel-head">
            <div><h3>{t("Pipeline commercial")}</h3><p>{t("Opportunités ouvertes par étape")}</p></div>
            <button type="button" className="text-btn" onClick={() => onNavigate("pipeline")}>{t("Voir le pipeline")} <ArrowUpRight size={14} /></button>
          </div>
          <div className="stage-bars">
            {openStages.map(s => {
              const n = deals.filter(d => d.stageId === s.id).length;
              const width = openDeals.length ? Math.max((n / openDeals.length) * 100, n ? 4 : 0) : 0;
              return (
                <div className="stage-row" key={s.id}>
                  <span>{tv(s.name)}</span>
                  <div className="bar-track"><div className="bar-fill" style={{ width: `${width}%` }} /></div>
                  <b>{n}</b>
                </div>
              );
            })}
            {openStages.length === 0 && <div className="empty"><Inbox size={24} aria-hidden="true" />{t("Aucune étape de pipeline.")}</div>}
          </div>
          <div className="panel-foot"><span>{t("Valeur totale du pipeline")}</span><b>{money(pipelineValue)}</b></div>
        </section>
        <section className="panel tasks-panel">
          <div className="panel-head">
            <div><h3>{t("Prochaines actions")}</h3><p>{t("Vos tâches ouvertes")}</p></div>
            <button type="button" className="text-btn" onClick={() => onNavigate("tasks")}>{t("Tout voir")} <ArrowUpRight size={14} /></button>
          </div>
          {openTasks.slice(0, 4).map(tk => (
            <div className="mini-task" key={tk.id}>
              <div className="task-check" />
              <div><b>{tk.title}</b><small>{tk.related}{tk.due ? ` · ${tk.due}` : ""}</small></div>
              <span className={`priority ${tk.priority}`}>{t(PRIORITY_LABELS[tk.priority])}</span>
            </div>
          ))}
          {openTasks.length === 0 && <div className="empty"><Inbox size={24} aria-hidden="true" />{t("Aucune tâche ouverte.")}</div>}
        </section>
      </div>
      <section className="panel activity-panel">
        <div className="panel-head"><div><h3>{t("Activité récente")}</h3><p>{t("Derniers mouvements de votre portefeuille")}</p></div></div>
        <div className="activity-list">
          {activities.map(a => (
            <div className="activity-row" key={a.id}>
              <div className="activity-icon">{a.type === "stage_change" ? <Target /> : <Activity />}</div>
              <div><b>{t(ACTIVITY_LABELS[a.type] ?? "Activité")}</b><small>{a.body}</small></div>
              <time>{new Date(a.created_at).toLocaleDateString(loc())}</time>
            </div>
          ))}
          {activities.length === 0 && <div className="empty"><Inbox size={24} aria-hidden="true" />{t("Aucune activité pour le moment.")}</div>}
        </div>
      </section>
    </>
  );
}

export function Leads({ leads, total, onAdd, onStatus, onEdit, onDelete }: {
  leads: LeadRow[]; total: number; onAdd: () => void; onStatus: (id: string, s: LeadStatus) => void;
  onEdit: (l: LeadRow) => void; onDelete?: (l: LeadRow) => void;
}) {
  const PAGE_SIZE = 50;
  const [status, setStatus] = useState<LeadStatus | "all">("all");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const shown = status === "all" ? leads : leads.filter(l => l.status === status);
  const visible = shown.slice(0, limit);
  return (
    <>
      <PageHeading eyebrow="GESTION DE LA RELATION CLIENT" title="Prospects & clients"
        desc="Centralisez vos contacts et ne laissez plus aucune opportunité vous échapper."
        action={<button type="button" className="primary" onClick={onAdd}><Plus size={16} /> {t("Ajouter un prospect")}</button>} />
      <section className="panel table-panel">
        <div className="panel-head">
          <div><h3>{t("Votre portefeuille")}</h3><p>{t("{n} contact(s) affiché(s) sur {total}", { n: shown.length, total })}</p></div>
          <select className="filter-select" aria-label={t("Filtrer par statut")} value={status}
            onChange={e => { setStatus(e.target.value as LeadStatus | "all"); setLimit(PAGE_SIZE); }}>
            <option value="all">{t("Tous les statuts")}</option>
            {(Object.keys(STATUS_LABELS) as LeadStatus[]).map(st => <option key={st} value={st}>{t(STATUS_LABELS[st])}</option>)}
          </select>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>{t("CONTACT")}</th><th>{t("ENTREPRISE")}</th><th>{t("EMAIL")}</th><th>{t("SOURCE")}</th><th>{t("STATUT")}</th><th>{t("RESPONSABLE")}</th><th></th></tr></thead>
            <tbody>
              {visible.map(l => (
                <tr key={l.id}>
                  <td><b>{l.name}</b></td><td>{l.company || "—"}</td><td>{l.email || "—"}</td><td>{tv(l.source)}</td>
                  <td>
                    <select className={`status-select status ${l.status}`} value={l.status} aria-label={t("Statut de {name}", { name: l.name })}
                      onChange={e => onStatus(l.id, e.target.value as LeadStatus)}>
                      {(Object.keys(STATUS_LABELS) as LeadStatus[]).map(s => <option key={s} value={s}>{t(STATUS_LABELS[s])}</option>)}
                    </select>
                  </td>
                  <td>{tv(l.owner)}</td>
                  <td><RowActions name={l.name} onEdit={() => onEdit(l)} onDelete={onDelete && (() => onDelete(l))} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {shown.length > visible.length && (
          <div className="more-row">
            <button type="button" className="secondary" onClick={() => setLimit(limit + PAGE_SIZE)}>
              {t("Afficher {n} de plus", { n: Math.min(PAGE_SIZE, shown.length - visible.length) })}
            </button>
          </div>
        )}
        {shown.length === 0 && (
          <div className="empty"><Inbox size={24} aria-hidden="true" />{total === 0 ? t("Aucun prospect pour le moment. Ajoutez le premier avec le bouton ci-dessus.") : t("Aucun prospect ne correspond à votre recherche.")}</div>
        )}
      </section>
    </>
  );
}

export function Pipeline({ deals, stages, onMove, onAdd, onEdit, onDelete }: {
  deals: DealRow[]; stages: Stage[]; onMove: (id: string, stageId: string) => void; onAdd: () => void;
  onEdit: (d: DealRow) => void; onDelete?: (d: DealRow) => void;
}) {
  return (
    <>
      <PageHeading eyebrow="SUIVI DES VENTES" title="Pipeline commercial" desc="Visualisez vos opportunités et faites avancer chaque vente."
        action={<button type="button" className="primary" onClick={onAdd}><Plus size={16} /> {t("Nouvelle opportunité")}</button>} />
      <div className="kanban">
        {stages.map(s => {
          const col = deals.filter(d => d.stageId === s.id);
          return (
            <div className="kanban-col" key={s.id}>
              <div className="kanban-head"><b>{tv(s.name)}</b><span>{col.length}</span></div>
              {col.map(d => (
                <div className="deal-card" key={d.id}>
                  <div className="deal-top"><small>{d.company || t("Sans entreprise")}</small>
                    <RowActions name={d.title} onEdit={() => onEdit(d)} onDelete={onDelete && (() => onDelete(d))} /></div>
                  <b>{d.title}</b><strong>{money(d.amount)}</strong>
                  <div className="deal-foot">
                    <span>{tv(d.owner)}</span>
                    <select value={s.id} onChange={e => onMove(d.id, e.target.value)} aria-label={t("Changer l'étape de {title}", { title: d.title })}>
                      {stages.map(st => <option key={st.id} value={st.id}>{tv(st.name)}</option>)}
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

export function Tasks({ tasks, onToggle, onAdd, onEdit, onDelete }: {
  tasks: TaskView[]; onToggle: (id: string, s: TaskStatus) => void; onAdd: () => void;
  onEdit: (tk: TaskView) => void; onDelete?: (tk: TaskView) => void;
}) {
  const [filter, setFilter] = useState<"open" | "done" | "all">("open");
  const open = tasks.filter(x => x.status !== "done");
  const done = tasks.filter(x => x.status === "done");
  const shown = filter === "open" ? open : filter === "done" ? done : tasks;
  const tabs = [
    { id: "open" as const, label: "À faire", n: open.length },
    { id: "done" as const, label: "Terminées", n: done.length },
    { id: "all" as const, label: "Toutes", n: tasks.length }
  ];
  return (
    <>
      <PageHeading eyebrow="ORGANISATION COMMERCIALE" title="Tâches & relances" desc="Priorisez vos actions et gardez le contrôle de vos suivis."
        action={<button type="button" className="primary" onClick={onAdd}><Plus size={16} /> {t("Nouvelle tâche")}</button>} />
      <section className="panel task-list-panel">
        <div className="panel-head"><div><h3>{t("Liste des actions")}</h3><p>{t("{n} tâche(s) ouverte(s)", { n: open.length })}</p></div></div>
        <div className="tabs" role="tablist">
          {tabs.map(tb => (
            <button type="button" role="tab" aria-selected={filter === tb.id} key={tb.id}
              className={`tab ${filter === tb.id ? "active" : ""}`} onClick={() => setFilter(tb.id)}>
              {t(tb.label)} <span>{tb.n}</span>
            </button>
          ))}
        </div>
        {shown.map(tk => (
          <div className="task-line" key={tk.id}>
            <button type="button" className={`task-check ${tk.status === "done" ? "checked" : ""}`}
              aria-label={tk.status === "done" ? t("Rouvrir la tâche") : t("Marquer comme terminée")}
              onClick={() => onToggle(tk.id, tk.status === "done" ? "todo" : "done")}>
              {tk.status === "done" && <Check size={12} />}
            </button>
            <div className="task-main">
              <b className={tk.status === "done" ? "strike" : ""}>{tk.title}</b>
              <small>{tk.related} · {tk.owner}</small>
            </div>
            <span className={`priority ${tk.priority}`}>{t(PRIORITY_LABELS[tk.priority])}</span>
            <time className={tk.overdue ? "overdue-date" : ""}>{tk.due ?? t("Sans échéance")}</time>
            <RowActions name={tk.title} onEdit={() => onEdit(tk)} onDelete={onDelete && (() => onDelete(tk))} />
          </div>
        ))}
        {tasks.length === 0 && <div className="empty"><Inbox size={24} aria-hidden="true" />{t("Aucune tâche. Créez-en une avec le bouton ci-dessus.")}</div>}
        {tasks.length > 0 && shown.length === 0 && <div className="empty"><Inbox size={24} aria-hidden="true" />{t("Aucune tâche dans cette catégorie.")}</div>}
      </section>
    </>
  );
}

const RULE_TEXT: Record<string, { desc: string; detail: (c: Record<string, unknown>) => string }> = {
  NEW_CONTACT_TASK: {
    desc: "À la création d'un prospect, une tâche « Premier contact » est créée pour son responsable.",
    detail: c => t("Échéance : J+{n}", { n: Number(c.delay_days ?? 1) })
  },
  STAGE_CHANGE_LOG: {
    desc: "Chaque déplacement d'une opportunité dans le pipeline est enregistré dans l'activité récente.",
    detail: () => t("Automatique")
  },
  STALE_DEAL_ALERT: {
    desc: "Chaque jour vers 7 h, une tâche de relance est créée pour les opportunités ouvertes sans mise à jour depuis plusieurs jours.",
    detail: c => t("Seuil : {n} jours (une alerte par période d'inactivité)", { n: Number(c.days ?? 7) })
  }
};

function runSummary(r: AutomationRunData): string {
  if (r.status === "failed") return t("Échec : {error}", { error: String(r.details?.error ?? r.details?.erreur ?? t("erreur inconnue")) });
  if (r.event_key.startsWith("stale:")) return t("Tâche de relance créée");
  if (r.event_key.startsWith("contact:")) return t("Tâche de premier contact créée");
  if (r.event_key.startsWith("opp:")) return t("Changement d'étape tracé");
  if (r.event_key.startsWith("email:")) {
    if (r.event_key.includes(":routage")) return t("Email traité : actions créées dans le CRM");
    if (r.event_key.endsWith(":reception")) return t("Email reçu");
    return t("Email");
  }
  if (r.event_key.startsWith("make:")) {
    const types: Record<string, string> = {
      contact: "prospect", lead: "prospect", prospect: "prospect", company: "entreprise", empresa: "entreprise", entreprise: "entreprise",
      opportunity: "opportunité", deal: "opportunité", oportunidad: "opportunité", opportunite: "opportunité",
      appointment: "rendez-vous", cita: "rendez-vous", rdv: "rendez-vous", "rendez-vous": "rendez-vous", meeting: "rendez-vous",
      invoice: "facture", factura: "facture", facture: "facture"
    };
    const kind = types[String(r.details?.type ?? "")] ?? "élément";
    return t(r.details?.action === "updated" ? "Import Make : {kind} mis à jour" : "Import Make : {kind} ajouté", { kind: t(kind) });
  }
  return t("Exécutée");
}

export function Automation({ rules, runs, canEdit, onToggle }: {
  rules: AutomationRuleData[]; runs: AutomationRunData[]; canEdit: boolean; onToggle: (id: string, enabled: boolean) => void;
}) {
  const ruleName = (id: string | null) => tv(rules.find(r => r.id === id)?.name) || t("Règle supprimée");
  return (
    <>
      <PageHeading eyebrow="PRODUCTIVITÉ" title="Automatisations" desc="Des règles simples, exécutées côté serveur, pour ne plus oublier les actions commerciales importantes." />
      <div className="automation-grid">
        {rules.map(r => {
          const rt = RULE_TEXT[r.code];
          return (
            <div className="panel automation-card" key={r.id}>
              <div className="automation-top">
                <div className="automation-icon"><Activity /></div>
                <span className={`status ${r.enabled ? "qualified" : "new"}`}>{r.enabled ? t("Actif") : t("Désactivé")}</span>
              </div>
              <small>{r.code}</small><h3>{tv(r.name)}</h3>
              <p>{rt ? t(rt.desc) : t("Règle personnalisée.")}</p>
              <p className="muted">{rt ? rt.detail(r.config) : ""}</p>
              {canEdit ? (
                <button type="button" className="secondary" onClick={() => onToggle(r.id, !r.enabled)}>
                  {r.enabled ? t("Désactiver") : t("Activer")}
                </button>
              ) : (
                <p className="muted">{t("Seuls les propriétaires et administrateurs peuvent modifier cette règle.")}</p>
              )}
            </div>
          );
        })}
        {rules.length === 0 && <div className="empty"><Inbox size={24} aria-hidden="true" />{t("Aucune règle disponible pour cette organisation.")}</div>}
      </div>
      <section className="panel table-panel" style={{ marginTop: 18 }}>
        <div className="panel-head"><div><h3>{t("Dernières exécutions")}</h3><p>{t("Journal des règles (12 dernières)")}</p></div></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>{t("DATE")}</th><th>{t("RÈGLE")}</th><th>{t("RÉSULTAT")}</th></tr></thead>
            <tbody>
              {runs.map(r => (
                <tr key={r.id}>
                  <td>{new Date(r.created_at).toLocaleString(loc(), { dateStyle: "short", timeStyle: "short" })}</td>
                  <td>{r.event_key.startsWith("make:") ? t("Intégration Make") : r.event_key.startsWith("email:") ? t("Emails entrants") : ruleName(r.rule_id)}</td>
                  <td><span className={`status ${r.status === "failed" ? "lost" : "qualified"}`}>{runSummary(r)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {runs.length === 0 && <div className="empty"><Inbox size={24} aria-hidden="true" />{t("Aucune exécution pour le moment. Créez un prospect pour voir la première règle s'exécuter.")}</div>}
      </section>
      <div className="callout"><CircleHelp size={18} /><p>{t("Les règles s'exécutent dans la base de données, même si l'application est fermée. Une règle qui échoue n'empêche jamais l'action de l'utilisateur : l'erreur est simplement inscrite dans ce journal.")}</p></div>
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
          <h2>{t("Votre copilote commercial")}</h2>
          <p>{t("Fonctionnalité prévue : analyser le contexte d'un prospect, résumer vos échanges et préparer un message de relance adapté.")}</p>
          <div className="ai-feature"><Sparkles /><div><b>{t("Qualification assistée")}</b><small>{t("Repérer les informations manquantes et les signaux d'intérêt.")}</small></div></div>
          <div className="ai-feature"><Activity /><div><b>{t("Résumé de fiche")}</b><small>{t("Retrouver rapidement l'historique et les prochaines actions.")}</small></div></div>
          <div className="ai-feature"><ArrowDownRight /><div><b>{t("Brouillon de relance")}</b><small>{t("Rédiger un message modifiable, jamais envoyé sans validation.")}</small></div></div>
          <div className="callout"><CircleHelp size={18} /><p>{t("IA non configurée : elle n'est pas disponible dans cette version. Aucun faux résultat IA n'est affiché.")}</p></div>
        </div>
        <div className="panel ai-side">
          <h3>{t("Principes de l'assistant")}</h3><p>{t("La décision finale reste toujours entre vos mains.")}</p>
          <ul><li>{t("Suggestions vérifiables")}</li><li>{t("Validation humaine obligatoire")}</li><li>{t("Aucun envoi automatique")}</li><li>{t("Respect des permissions CRM")}</li></ul>
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
    if (!/^\S+@\S+\.\S+$/.test(inviteEmail.trim())) { setInviteError(t("Adresse email invalide.")); return; }
    const err = await onInvite(inviteEmail, inviteRole);
    if (err) setInviteError(err); else setInviteEmail("");
  }

  return (
    <>
      <PageHeading eyebrow="CONFIGURATION" title="Paramètres" desc="Votre espace de travail VALTIQ." />
      <div className="settings-grid">
        <div className="panel setting-card"><Building2 /><h3>{t("Organisation")}</h3><p>{org.name}</p><p>{t("Votre rôle :")} {t(ROLE_LABELS[org.role])}</p></div>
        <div className="panel setting-card"><Users /><h3>{t("Compte")}</h3><p>{email}</p><button type="button" className="secondary" onClick={onSignOut}>{t("Se déconnecter")}</button></div>
      </div>
      <section className="panel invite-panel lang-panel">
        <div className="panel-head"><div><h3>{t("Langue")}</h3><p>{t("Langue de l'interface sur cet appareil.")}</p></div><LangSwitch /></div>
      </section>
      <section className="panel table-panel">
        <div className="panel-head"><div><h3>{t("Équipe")}</h3><p>{t("{n} membre(s)", { n: members.length })}</p></div></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>{t("NOM")}</th><th>{t("RÔLE")}</th></tr></thead>
            <tbody>
              {members.map(m => (
                <tr key={m.user_id}><td><b>{m.full_name || t("Membre")}{m.user_id === currentUserId ? ` ${t("(vous)")}` : ""}</b></td><td>{t(ROLE_LABELS[m.role])}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {canInvite && (
        <section className="panel invite-panel">
          <div className="panel-head"><div><h3>{t("Inviter un collègue")}</h3>
            <p>{t("Aucun email n'est envoyé : donnez-lui l'adresse de l'application. Dès qu'il crée son compte (ou se connecte) avec cet email, il rejoint « {org} ».", { org: org.name })}</p></div></div>
          <form onSubmit={submitInvite} noValidate className="invite-form">
            <label>{t("Email du collègue")}
              <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder={t("collegue@entreprise.fr")} />
            </label>
            <label>{t("Rôle")}
              <select value={inviteRole} onChange={e => setInviteRole(e.target.value as "admin" | "sales")}>
                <option value="sales">{t("Commercial (crée et modifie)")}</option>
                <option value="admin">{t("Administrateur (supprime, invite)")}</option>
              </select>
            </label>
            <button type="submit" className="primary" disabled={busy}>{t("Inviter")}</button>
          </form>
          {inviteError && <div className="form-error" role="alert">{inviteError}</div>}
          {invitations.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead><tr><th>{t("INVITATION EN ATTENTE")}</th><th>{t("RÔLE")}</th><th></th></tr></thead>
                <tbody>
                  {invitations.map(i => (
                    <tr key={i.id}>
                      <td>{i.email}</td><td>{t(ROLE_LABELS[i.role])}</td>
                      <td><button type="button" className="text-btn" onClick={() => onRevoke(i.id)}>{t("Annuler")}</button></td>
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
        <div className="panel-head"><div><h3>{t("Données personnelles")}</h3>
          <p>{t("Vos droits d'accès, de portabilité et d'effacement. Consultez la")} <a href="#/confidentialite">{t("politique de confidentialité")}</a>.</p></div></div>
        {canExport
          ? <button type="button" className="secondary" disabled={busy} onClick={onExport}>{t("Exporter les données de l'organisation (JSON)")}</button>
          : <p className="muted">{t("L'export est réservé aux propriétaires et administrateurs.")}</p>}
        <p className="muted">{t("Pour supprimer un contact : page Prospects, bouton « Supprimer » (propriétaires et administrateurs). Pour supprimer votre compte ou l'organisation, contactez-nous.")}</p>
      </section>
      <div className="callout"><Settings size={18} /><p>{t("Connecté à Supabase. Vos données sont isolées par organisation.")}</p></div>
    </>
  );
}
