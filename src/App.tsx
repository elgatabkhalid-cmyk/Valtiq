import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  Activity, Bot, CalendarClock, ChevronDown, LayoutDashboard, LogOut, Menu, Search, Settings, Target, Users, X
} from "lucide-react";
import { supabase, supabaseConfigured } from "./lib/supabase";
import {
  acceptInvitations, addLead, addOpportunity, addTask, createOrganization, deleteContact, errMsg, exportOrganization, inviteMember, listMemberships,
  loadWorkspace, moveOpportunity, revokeInvitation, setRuleEnabled, setTaskStatus, updateContactStatus
} from "./lib/api";
import { emptyWorkspace } from "./types";
import type { DealRow, LeadRow, LeadStatus, OrgInfo, TaskStatus, TaskView, Workspace } from "./types";
import { AuthScreen, ConfigMissing, Loading, Onboarding } from "./components/AuthScreens";
import { DealForm, LeadForm, Modal, TaskForm } from "./components/Modals";
import { Assistant, Automation, Dashboard, Leads, Pipeline, SettingsPage, Tasks } from "./components/Pages";
import type { Page } from "./components/Pages";

type ModalKind = "lead" | "task" | "deal" | null;
type Notice = { text: string; error: boolean } | null;

const CLOSED_STAGES = ["Gagné", "Perdu"];

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [orgs, setOrgs] = useState<OrgInfo[] | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [ws, setWs] = useState<Workspace>(emptyWorkspace);
  const [page, setPage] = useState<Page>("dashboard");
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<ModalKind>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);

  const user = session?.user;
  const userId = user?.id;

  // Session
  useEffect(() => {
    if (!supabase) { setSession(null); return; }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  // Organisations de l'utilisateur
  useEffect(() => {
    if (!userId) { setOrgs(null); setOrgId(null); setWs(emptyWorkspace); return; }
    let cancelled = false;
    acceptInvitations()
      .catch(() => 0)
      .then(() => listMemberships(userId))
      .then(list => {
        if (cancelled) return;
        setOrgs(list);
        setOrgId(prev => (prev && list.some(o => o.id === prev) ? prev : list[0]?.id ?? null));
      })
      .catch(e => { if (!cancelled) { setOrgs([]); setNotice({ text: errMsg(e), error: true }); } });
    return () => { cancelled = true; };
  }, [userId]);

  // Données de l'organisation
  const refresh = useCallback(async () => {
    if (!orgId) { setWs(emptyWorkspace); return; }
    try { setWs(await loadWorkspace(orgId)); }
    catch (e) { setNotice({ text: errMsg(e), error: true }); }
  }, [orgId]);
  useEffect(() => { refresh(); }, [refresh]);

  // Exécute une action, recharge les données, renvoie un message d'erreur ou null
  async function run(action: () => Promise<void>, success?: string): Promise<string | null> {
    setBusy(true);
    try {
      await action();
      await refresh();
      if (success) setNotice({ text: success, error: false });
      return null;
    } catch (e) {
      const m = errMsg(e);
      setNotice({ text: m, error: true });
      return m;
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut();
    setPage("dashboard"); setModal(null); setNotice(null);
  }

  async function createOrg(name: string) {
    if (!userId) return;
    const id = await createOrganization(name);
    const list = await listMemberships(userId);
    setOrgs(list);
    setOrgId(id);
  }

  const org = orgs?.find(o => o.id === orgId) ?? null;

  // Noms affichés
  const nameOf = useCallback((id: string | null) => {
    if (!id) return "—";
    if (id === userId) return "Vous";
    return ws.members.find(m => m.user_id === id)?.full_name || "Membre";
  }, [ws.members, userId]);
  const companyName = useCallback((id: string | null) => ws.companies.find(c => c.id === id)?.name ?? "", [ws.companies]);
  const contactName = useCallback((id: string | null) => {
    const c = ws.contacts.find(x => x.id === id);
    return c ? `${c.first_name} ${c.last_name}` : "";
  }, [ws.contacts]);

  // Vues
  const leadRows: LeadRow[] = useMemo(() => ws.contacts.map(c => ({
    id: c.id, name: `${c.first_name} ${c.last_name}`, company: companyName(c.company_id),
    email: c.email ?? "", phone: c.phone ?? "", source: c.source ?? "—", status: c.status, owner: nameOf(c.owner_id)
  })), [ws.contacts, companyName, nameOf]);

  const filteredLeads = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? leadRows.filter(l => `${l.name} ${l.company} ${l.email}`.toLowerCase().includes(q)) : leadRows;
  }, [leadRows, query]);

  const dealRows: DealRow[] = useMemo(() => ws.opportunities.map(o => ({
    id: o.id, title: o.title, company: companyName(o.company_id), contact: contactName(o.contact_id),
    amount: o.amount, stageId: o.stage_id, owner: nameOf(o.owner_id)
  })), [ws.opportunities, companyName, contactName, nameOf]);

  const taskViews: TaskView[] = useMemo(() => {
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    return ws.tasks.map(t => ({
      id: t.id, title: t.title, related: contactName(t.contact_id) || "—", owner: nameOf(t.owner_id),
      due: t.due_at ? new Date(t.due_at).toLocaleDateString("fr-FR") : null,
      status: t.status, priority: t.priority,
      overdue: t.status !== "done" && !!t.due_at && new Date(t.due_at) < startOfToday
    }));
  }, [ws.tasks, contactName, nameOf]);

  const overdue = taskViews.filter(t => t.overdue).length;
  const openStageIds = useMemo(
    () => new Set(ws.stages.filter(s => !CLOSED_STAGES.includes(s.name)).map(s => s.id)), [ws.stages]);
  const pipelineValue = dealRows.filter(d => d.stageId && openStageIds.has(d.stageId)).reduce((s, d) => s + d.amount, 0);

  // Actions
  const onAddLead = (v: Parameters<typeof addLead>[3]) =>
    run(async () => { if (orgId && userId) await addLead(orgId, userId, ws.companies, v); }, "Prospect ajouté.")
      .then(err => { if (!err) setModal(null); return err; });
  const onAddDeal = (v: Parameters<typeof addOpportunity>[2]) =>
    run(async () => { if (orgId && userId) await addOpportunity(orgId, userId, v); }, "Opportunité créée.")
      .then(err => { if (!err) setModal(null); return err; });
  const onAddTask = (v: Parameters<typeof addTask>[2]) =>
    run(async () => { if (orgId && userId) await addTask(orgId, userId, v); }, "Tâche créée.")
      .then(err => { if (!err) setModal(null); return err; });
  const onMoveDeal = (id: string, stageId: string) => {
    const opp = ws.opportunities.find(o => o.id === id);
    const stage = ws.stages.find(s => s.id === stageId);
    if (!opp || !stage || opp.stage_id === stageId || !userId) return;
    void run(() => moveOpportunity(opp, stage, userId));
  };
  const onInvite = (email: string, role: "admin" | "sales") =>
    run(async () => { if (orgId && userId) await inviteMember(orgId, userId, email, role); }, "Invitation enregistrée.");
  const onRevoke = (id: string) => { void run(() => revokeInvitation(id)); };
  const onToggleRule = (id: string, enabled: boolean) => { void run(() => setRuleEnabled(id, enabled)); };
  const onToggleTask = (id: string, status: TaskStatus) => { void run(() => setTaskStatus(id, status)); };
  const [toDelete, setToDelete] = useState<LeadRow | null>(null);
  const onConfirmDelete = async () => {
    if (!toDelete) return;
    const err = await run(() => deleteContact(toDelete.id), "Contact supprimé définitivement.");
    if (!err) setToDelete(null);
  };
  const onExport = async () => {
    if (!orgId) return;
    setBusy(true);
    try {
      const blob = await exportOrganization(orgId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `valtiq-export-${new Date().toISOString().slice(0, 10)}.json`; a.click();
      URL.revokeObjectURL(url);
      setNotice({ text: "Export téléchargé.", error: false });
    } catch (e) { setNotice({ text: errMsg(e), error: true }); }
    finally { setBusy(false); }
  };
  const onLeadStatus = (id: string, status: LeadStatus) => { void run(() => updateContactStatus(id, status)); };

  // Écrans avant l'application
  if (!supabaseConfigured) return <ConfigMissing />;
  if (session === undefined) return <Loading />;
  if (!session) return <AuthScreen />;
  if (orgs === null) return <Loading text="Chargement de votre espace…" />;
  if (orgs.length === 0 || !org) return <Onboarding onCreate={createOrg} onSignOut={signOut} />;

  const fullName = (user?.user_metadata?.full_name as string | undefined) ?? "";
  const firstName = fullName.split(" ")[0] ?? "";
  const email = user?.email ?? "";
  const initial = (fullName || email || "V").charAt(0).toUpperCase();

  const nav = [
    { id: "dashboard" as Page, label: "Vue d'ensemble", icon: LayoutDashboard },
    { id: "leads" as Page, label: "Prospects & clients", icon: Users },
    { id: "pipeline" as Page, label: "Pipeline commercial", icon: Target },
    { id: "tasks" as Page, label: "Tâches & relances", icon: CalendarClock },
    { id: "automation" as Page, label: "Automatisations", icon: Activity },
    { id: "assistant" as Page, label: "Assistant IA", icon: Bot }
  ];
  const title = nav.find(n => n.id === page)?.label ?? "Paramètres";

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-symbol">V</div>
          <div><b>VALTIQ</b><small>CRM PLATFORM</small></div>
          <button type="button" className="icon-btn mobile-close" aria-label="Fermer le menu" onClick={() => setMobileNav(false)}><X size={18} /></button>
        </div>
        <div className="workspace">
          <div className="workspace-icon">{org.name.charAt(0).toUpperCase()}</div>
          {orgs.length > 1 ? (
            <select className="org-select" aria-label="Changer d'organisation" value={org.id}
              onChange={e => { setOrgId(e.target.value); setPage("dashboard"); }}>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          ) : (
            <><div><b>{org.name}</b><small>Votre organisation</small></div><ChevronDown size={15} /></>
          )}
        </div>
        <div className="nav-label">ESPACE COMMERCIAL</div>
        <nav>
          {nav.map(n => (
            <button type="button" key={n.id} className={`nav-item ${page === n.id ? "active" : ""}`}
              onClick={() => { setPage(n.id); setMobileNav(false); }}>
              <n.icon size={18} /><span>{n.label}</span>{n.id === "tasks" && overdue > 0 && <em>{overdue}</em>}
            </button>
          ))}
        </nav>
        <div className="nav-label bottom-label">CONFIGURATION</div>
        <button type="button" className={`nav-item ${page === "settings" ? "active" : ""}`}
          onClick={() => { setPage("settings"); setMobileNav(false); }}>
          <Settings size={18} /><span>Paramètres</span>
        </button>
        <div className="sidebar-bottom">
          <div className="user">
            <div className="avatar">{initial}</div>
            <div><b>{fullName || "Mon compte"}</b><small>{email}</small></div>
            <button type="button" className="icon-btn" aria-label="Se déconnecter" onClick={signOut}><LogOut size={18} /></button>
          </div>
        </div>
      </aside>
      {mobileNav && <div className="scrim" onClick={() => setMobileNav(false)} />}
      <main className="main">
        <header className="topbar">
          <button type="button" className="icon-btn mobile-menu" aria-label="Ouvrir le menu" onClick={() => setMobileNav(true)}><Menu /></button>
          <div className="breadcrumb">VALTIQ <span>/</span> {title}</div>
          <div className="top-actions">
            {page === "leads" && (
              <div className="search">
                <Search size={16} />
                <input placeholder="Rechercher un prospect…" aria-label="Rechercher un prospect" value={query} onChange={e => setQuery(e.target.value)} />
              </div>
            )}
            <div className="avatar">{initial}</div>
          </div>
        </header>
        <div className="content">
          {notice && (
            <div className={`notice ${notice.error ? "error" : ""}`} role={notice.error ? "alert" : "status"}>
              <span className="notice-dot" />{notice.text}
              <button type="button" aria-label="Fermer le message" onClick={() => setNotice(null)}><X size={14} /></button>
            </div>
          )}
          {page === "dashboard" && (
            <Dashboard firstName={firstName} leadCount={ws.contacts.length} deals={dealRows} stages={ws.stages}
              tasks={taskViews} overdue={overdue} pipelineValue={pipelineValue} activities={ws.activities}
              onNavigate={setPage} onAddLead={() => setModal("lead")} />
          )}
          {page === "leads" && <Leads leads={filteredLeads} total={leadRows.length} onAdd={() => setModal("lead")} onStatus={onLeadStatus}
            canDelete={org.role === "owner" || org.role === "admin"} onDelete={setToDelete} />}
          {page === "pipeline" && <Pipeline deals={dealRows} stages={ws.stages} onMove={onMoveDeal} onAdd={() => setModal("deal")} />}
          {page === "tasks" && <Tasks tasks={taskViews} onToggle={onToggleTask} onAdd={() => setModal("task")} />}
          {page === "automation" && (
            <Automation rules={ws.rules} runs={ws.runs} canEdit={org.role === "owner" || org.role === "admin"} onToggle={onToggleRule} />
          )}
          {page === "assistant" && <Assistant />}
          {page === "settings" && userId && <SettingsPage org={org} email={email} members={ws.members} invitations={ws.invitations} currentUserId={userId}
            canInvite={org.role === "owner" || org.role === "admin"} busy={busy} onInvite={onInvite} onRevoke={onRevoke} onSignOut={signOut}
            canExport={org.role === "owner" || org.role === "admin"} onExport={onExport} />}
        </div>
        <footer className="footer">
          VALTIQ © 2026 <span>CRM intelligent · Conçu pour simplifier votre quotidien</span>
          <span><a href="#/mentions-legales">Mentions légales</a> · <a href="#/confidentialite">Confidentialité</a></span>
          <span className="footer-status"><i /> Version de développement</span>
        </footer>
      </main>
      {toDelete && (
        <Modal title="Supprimer ce contact ?" onClose={() => setToDelete(null)}>
          <p>« {toDelete.name} » sera supprimé définitivement, ainsi que son historique d'activités. Cette action est irréversible.</p>
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={() => setToDelete(null)}>Annuler</button>
            <button type="button" className="primary danger" disabled={busy} onClick={onConfirmDelete}>Supprimer définitivement</button>
          </div>
        </Modal>
      )}
      {modal === "lead" && (
        <Modal title="Nouveau prospect" onClose={() => setModal(null)}>
          <LeadForm companies={ws.companies} busy={busy} onSubmit={onAddLead} />
        </Modal>
      )}
      {modal === "deal" && (
        <Modal title="Nouvelle opportunité" onClose={() => setModal(null)}>
          <DealForm companies={ws.companies} contacts={ws.contacts} stages={ws.stages} busy={busy} onSubmit={onAddDeal} />
        </Modal>
      )}
      {modal === "task" && (
        <Modal title="Nouvelle tâche" onClose={() => setModal(null)}>
          <TaskForm contacts={ws.contacts} busy={busy} onSubmit={onAddTask} />
        </Modal>
      )}
    </div>
  );
}
