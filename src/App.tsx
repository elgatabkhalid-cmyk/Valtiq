import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  Activity, AlertTriangle, Bot, Inbox as InboxIcon, CalendarClock, CalendarDays, ChevronDown, LayoutDashboard, LogOut, Menu, Receipt, Search, Settings, Target, Users, X
} from "lucide-react";
import { supabase, supabaseConfigured, supabaseKey, supabaseUrl } from "./lib/supabase";
import {
  acceptInvitations, addLead, addOpportunity, addTask, createOrganization, deleteContact, errMsg, exportOrganization, inviteMember, listMemberships,
  loadWorkspace, moveOpportunity, revokeInvitation, setRuleEnabled, setTaskStatus, updateContactStatus,
  addAppointment, addInvoice, correctClassification, setEmailStatus, createIntegrationToken, getIntegrationInfo, revokeIntegrationToken, setAppointmentStatus, setInvoiceStatus
} from "./lib/api";
import { emptyWorkspace } from "./types";
import { loc, t, tv } from "./i18n";
import { LangSwitch } from "./components/LangSwitch";
import type {
  AppointmentStatus, EmailStatus, DealRow, IntegrationInfo, Invoice, InvoiceStatus, LeadRow, LeadStatus, OrgInfo, TaskStatus, TaskView, Workspace
} from "./types";
import { AuthScreen, ConfigMissing, Loading, Onboarding } from "./components/AuthScreens";
import { AppointmentForm, DealForm, InvoiceForm, LeadForm, Modal, TaskForm } from "./components/Modals";
import { Agenda, Invoices, MakeIntegration, isOverdue, upcomingUrgent } from "./components/Business";
import { InboxPage, needsReview } from "./components/Inbox";
import type { CorrectionInput } from "./components/Inbox";
import { Assistant, Automation, Dashboard, Leads, Pipeline, SettingsPage, Tasks } from "./components/Pages";
import type { Page } from "./components/Pages";

type ModalKind = "lead" | "task" | "deal" | "appointment" | "invoice" | null;
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
  const [apptDate, setApptDate] = useState<string | undefined>(undefined);
  const [integration, setIntegration] = useState<IntegrationInfo>(null);
  const [newToken, setNewToken] = useState<string | null>(null);

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

  // Temps réel : toute modification (application, autre utilisateur, Make) recharge les données
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    if (!supabase || !orgId) return;
    const client = supabase;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => { clearTimeout(timer); timer = setTimeout(() => { void refreshRef.current(); }, 400); };
    const channel = client.channel(`org-${orgId}`);
    for (const table of ["contacts", "companies", "opportunities", "tasks", "appointments", "invoices", "activities", "automation_runs", "emails"]) {
      channel.on("postgres_changes", { event: "*", schema: "public", table, filter: `organization_id=eq.${orgId}` }, schedule);
    }
    channel.subscribe();
    return () => { clearTimeout(timer); void client.removeChannel(channel); };
  }, [orgId]);

  // Clé d'intégration Make : on oublie la clé affichée quand on change d'organisation
  useEffect(() => { setIntegration(null); setNewToken(null); }, [orgId]);
  const loadIntegration = useCallback(async () => {
    if (!orgId) return;
    setIntegration(await getIntegrationInfo(orgId));
  }, [orgId]);

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
    if (id === userId) return t("Vous");
    return ws.members.find(m => m.user_id === id)?.full_name || t("Membre");
  }, [ws.members, userId]);
  const companyName = useCallback((id: string | null) => ws.companies.find(c => c.id === id)?.name ?? "", [ws.companies]);
  const contactName = useCallback((id: string | null) => {
    const c = ws.contacts.find(x => x.id === id);
    return c ? `${c.first_name} ${c.last_name}` : "";
  }, [ws.contacts]);

  // Vues
  const leadRows: LeadRow[] = useMemo(() => ws.contacts.map(c => ({
    id: c.id, name: `${c.first_name} ${c.last_name}`, company: companyName(c.company_id),
    email: c.email ?? "", phone: c.phone ?? "", source: c.source ? tv(c.source) : "—", status: c.status, owner: nameOf(c.owner_id)
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
      due: t.due_at ? new Date(t.due_at).toLocaleDateString(loc()) : null,
      status: t.status, priority: t.priority,
      overdue: t.status !== "done" && !!t.due_at && new Date(t.due_at) < startOfToday
    }));
  }, [ws.tasks, contactName, nameOf]);

  const overdue = taskViews.filter(t => t.overdue).length;
  const urgentAppts = useMemo(() => upcomingUrgent(ws.appointments), [ws.appointments]);
  const overdueInvoices = useMemo(() => ws.invoices.filter(isOverdue), [ws.invoices]);
  const emailsToReview = useMemo(() => ws.emails.filter(needsReview).length, [ws.emails]);
  const invoiceClient = useCallback((i: Invoice) => i.client_name || companyName(i.company_id) || contactName(i.contact_id), [companyName, contactName]);
  const openStageIds = useMemo(
    () => new Set(ws.stages.filter(s => !CLOSED_STAGES.includes(s.name)).map(s => s.id)), [ws.stages]);
  const pipelineValue = dealRows.filter(d => d.stageId && openStageIds.has(d.stageId)).reduce((s, d) => s + d.amount, 0);

  // Actions
  const onAddLead = (v: Parameters<typeof addLead>[3]) =>
    run(async () => { if (orgId && userId) await addLead(orgId, userId, ws.companies, v); }, t("Prospect ajouté."))
      .then(err => { if (!err) setModal(null); return err; });
  const onAddDeal = (v: Parameters<typeof addOpportunity>[2]) =>
    run(async () => { if (orgId && userId) await addOpportunity(orgId, userId, v); }, t("Opportunité créée."))
      .then(err => { if (!err) setModal(null); return err; });
  const onAddTask = (v: Parameters<typeof addTask>[2]) =>
    run(async () => { if (orgId && userId) await addTask(orgId, userId, v); }, t("Tâche créée."))
      .then(err => { if (!err) setModal(null); return err; });
  const onMoveDeal = (id: string, stageId: string) => {
    const opp = ws.opportunities.find(o => o.id === id);
    const stage = ws.stages.find(s => s.id === stageId);
    if (!opp || !stage || opp.stage_id === stageId || !userId) return;
    void run(() => moveOpportunity(opp, stage, userId));
  };
  const onInvite = (email: string, role: "admin" | "sales") =>
    run(async () => { if (orgId && userId) await inviteMember(orgId, userId, email, role); }, t("Invitation enregistrée."));
  const onRevoke = (id: string) => { void run(() => revokeInvitation(id)); };
  const onToggleRule = (id: string, enabled: boolean) => { void run(() => setRuleEnabled(id, enabled)); };
  const onToggleTask = (id: string, status: TaskStatus) => { void run(() => setTaskStatus(id, status)); };
  const [toDelete, setToDelete] = useState<LeadRow | null>(null);
  const onConfirmDelete = async () => {
    if (!toDelete) return;
    const err = await run(() => deleteContact(toDelete.id), t("Contact supprimé définitivement."));
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
      setNotice({ text: t("Export téléchargé."), error: false });
    } catch (e) { setNotice({ text: errMsg(e), error: true }); }
    finally { setBusy(false); }
  };
  const onLeadStatus = (id: string, status: LeadStatus) => { void run(() => updateContactStatus(id, status)); };
  const onAddAppointment = (v: Parameters<typeof addAppointment>[2]) =>
    run(async () => { if (orgId && userId) await addAppointment(orgId, userId, v); }, t("Rendez-vous créé."))
      .then(err => { if (!err) setModal(null); return err; });
  const onAddInvoice = (v: Parameters<typeof addInvoice>[1]) =>
    run(async () => { if (orgId) await addInvoice(orgId, v); }, t("Facture créée."))
      .then(err => { if (!err) setModal(null); return err; });
  const onCorrectEmail = (v: CorrectionInput) => run(() => correctClassification(v), t("Correction enregistrée."));
  const onEmailStatus = (id: string, status: EmailStatus) => {
    void run(() => setEmailStatus(id, status), status === "traite" ? t("Email marqué comme traité.") : t("Email ignoré."));
  };
  const onApptStatus = (id: string, status: AppointmentStatus) => { void run(() => setAppointmentStatus(id, status)); };
  const onInvoiceStatus = (id: string, status: InvoiceStatus) => { void run(() => setInvoiceStatus(id, status)); };
  const onGenerateToken = async () => {
    if (!orgId) return;
    setBusy(true);
    try { setNewToken(await createIntegrationToken(orgId)); await loadIntegration(); }
    catch (e) { setNotice({ text: errMsg(e), error: true }); }
    finally { setBusy(false); }
  };
  const onRevokeToken = async () => {
    if (!orgId) return;
    setBusy(true);
    try { await revokeIntegrationToken(orgId); setNewToken(null); await loadIntegration(); setNotice({ text: t("Clé d'intégration désactivée."), error: false }); }
    catch (e) { setNotice({ text: errMsg(e), error: true }); }
    finally { setBusy(false); }
  };

  // Écrans avant l'application
  if (!supabaseConfigured) return <ConfigMissing />;
  if (session === undefined) return <Loading />;
  if (!session) return <AuthScreen />;
  if (orgs === null) return <Loading text={t("Chargement de votre espace…")} />;
  if (orgs.length === 0 || !org) return <Onboarding onCreate={createOrg} onSignOut={signOut} />;

  const fullName = (user?.user_metadata?.full_name as string | undefined) ?? "";
  const firstName = fullName.split(" ")[0] ?? "";
  const email = user?.email ?? "";
  const initial = (fullName || email || "V").charAt(0).toUpperCase();

  const nav = [
    { id: "dashboard" as Page, label: t("Vue d'ensemble"), icon: LayoutDashboard },
    { id: "inbox" as Page, label: t("Boîte de réception"), icon: InboxIcon },
    { id: "leads" as Page, label: t("Prospects & clients"), icon: Users },
    { id: "pipeline" as Page, label: t("Pipeline commercial"), icon: Target },
    { id: "tasks" as Page, label: t("Tâches & relances"), icon: CalendarClock },
    { id: "agenda" as Page, label: t("Agenda"), icon: CalendarDays },
    { id: "invoices" as Page, label: t("Factures"), icon: Receipt },
    { id: "automation" as Page, label: t("Automatisations"), icon: Activity },
    { id: "assistant" as Page, label: t("Assistant IA"), icon: Bot }
  ];
  const title = nav.find(n => n.id === page)?.label ?? t("Paramètres");

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-symbol">V</div>
          <div><b>VALTIQ</b><small>CRM PLATFORM</small></div>
          <button type="button" className="icon-btn mobile-close" aria-label={t("Fermer le menu")} onClick={() => setMobileNav(false)}><X size={18} /></button>
        </div>
        <div className="workspace">
          <div className="workspace-icon">{org.name.charAt(0).toUpperCase()}</div>
          {orgs.length > 1 ? (
            <select className="org-select" aria-label={t("Changer d'organisation")} value={org.id}
              onChange={e => { setOrgId(e.target.value); setPage("dashboard"); }}>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          ) : (
            <><div><b>{org.name}</b><small>{t("Votre organisation")}</small></div><ChevronDown size={15} /></>
          )}
        </div>
        <div className="nav-label">{t("ESPACE COMMERCIAL")}</div>
        <nav>
          {nav.map(n => (
            <button type="button" key={n.id} className={`nav-item ${page === n.id ? "active" : ""}`}
              onClick={() => { setPage(n.id); setMobileNav(false); }}>
              <n.icon size={18} /><span>{n.label}</span>
              {n.id === "tasks" && overdue > 0 && <em>{overdue}</em>}
              {n.id === "inbox" && emailsToReview > 0 && <em>{emailsToReview}</em>}
              {n.id === "agenda" && urgentAppts.length > 0 && <em>{urgentAppts.length}</em>}
              {n.id === "invoices" && overdueInvoices.length > 0 && <em>{overdueInvoices.length}</em>}
            </button>
          ))}
        </nav>
        <div className="nav-label bottom-label">{t("CONFIGURATION")}</div>
        <button type="button" className={`nav-item ${page === "settings" ? "active" : ""}`}
          onClick={() => { setPage("settings"); setMobileNav(false); }}>
          <Settings size={18} /><span>{t("Paramètres")}</span>
        </button>
        <div className="sidebar-bottom">
          <LangSwitch className="sidebar-lang" />
          <div className="user">
            <div className="avatar">{initial}</div>
            <div><b>{fullName || t("Mon compte")}</b><small>{email}</small></div>
            <button type="button" className="icon-btn" aria-label={t("Se déconnecter")} onClick={signOut}><LogOut size={18} /></button>
          </div>
        </div>
      </aside>
      {mobileNav && <div className="scrim" onClick={() => setMobileNav(false)} />}
      <main className="main">
        <header className="topbar">
          <button type="button" className="icon-btn mobile-menu" aria-label={t("Ouvrir le menu")} onClick={() => setMobileNav(true)}><Menu /></button>
          <div className="breadcrumb">VALTIQ <span>/</span> {title}</div>
          <div className="top-actions">
            {page === "leads" && (
              <div className="search">
                <Search size={16} />
                <input placeholder={t("Rechercher un prospect…")} aria-label={t("Rechercher un prospect")} value={query} onChange={e => setQuery(e.target.value)} />
              </div>
            )}
            <div className="avatar">{initial}</div>
          </div>
        </header>
        <div className="content">
          {notice && (
            <div className={`notice ${notice.error ? "error" : ""}`} role={notice.error ? "alert" : "status"}>
              <span className="notice-dot" />{notice.text}
              <button type="button" aria-label={t("Fermer le message")} onClick={() => setNotice(null)}><X size={14} /></button>
            </div>
          )}
          {page === "dashboard" && (urgentAppts.length > 0 || overdueInvoices.length > 0) && (
            <div className="alert-row">
              {urgentAppts.length > 0 && (
                <button type="button" className="alert-card" onClick={() => setPage("agenda")}>
                  <AlertTriangle size={16} />
                  <span><b>{t("{n} rendez-vous urgent(s)", { n: urgentAppts.length })}</b>
                    <small>{t("Prochain :")} {urgentAppts[0].title} · {new Date(urgentAppts[0].starts_at).toLocaleString(loc(), { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</small></span>
                </button>
              )}
              {overdueInvoices.length > 0 && (
                <button type="button" className="alert-card" onClick={() => setPage("invoices")}>
                  <Receipt size={16} />
                  <span><b>{t("{n} facture(s) en retard", { n: overdueInvoices.length })}</b>
                    <small>{t("{amount} à relancer", { amount: new Intl.NumberFormat(loc(), { style: "currency", currency: "EUR" }).format(overdueInvoices.reduce((s, i) => s + i.amount, 0)) })}</small></span>
                </button>
              )}
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
          {page === "inbox" && <InboxPage emails={ws.emails} types={ws.messageTypes} categories={ws.categories} mailboxes={ws.mailboxes}
            contacts={ws.contacts} tasks={ws.tasks} appointments={ws.appointments} opportunities={ws.opportunities} busy={busy}
            onCorrect={onCorrectEmail} onStatus={onEmailStatus} onNavigate={setPage} />}
          {page === "agenda" && <Agenda appointments={ws.appointments} contactName={contactName} onStatus={onApptStatus}
            onAdd={d => { setApptDate(d); setModal("appointment"); }} />}
          {page === "invoices" && <Invoices invoices={ws.invoices} clientName={invoiceClient} onStatus={onInvoiceStatus} onAdd={() => setModal("invoice")} />}
          {page === "automation" && (
            <Automation rules={ws.rules} runs={ws.runs} canEdit={org.role === "owner" || org.role === "admin"} onToggle={onToggleRule} />
          )}
          {page === "assistant" && <Assistant />}
          {page === "settings" && userId && <SettingsPage org={org} email={email} members={ws.members} invitations={ws.invitations} currentUserId={userId}
            canInvite={org.role === "owner" || org.role === "admin"} busy={busy} onInvite={onInvite} onRevoke={onRevoke} onSignOut={signOut}
            canExport={org.role === "owner" || org.role === "admin"} onExport={onExport}
            integration={(org.role === "owner" || org.role === "admin") ? (
              <MakeIntegration endpoint={`${supabaseUrl.replace(/\/+$/, "")}/rest/v1/rpc/make_ingest`} apiKey={supabaseKey}
                info={integration} newToken={newToken} busy={busy} onGenerate={onGenerateToken} onRevoke={onRevokeToken} onLoad={loadIntegration} />
            ) : undefined} />}
        </div>
        <footer className="footer">
          VALTIQ © 2026 <span>{t("CRM intelligent · Conçu pour simplifier votre quotidien")}</span>
          <span><a href="#/mentions-legales">{t("Mentions légales")}</a> · <a href="#/confidentialite">{t("Confidentialité")}</a></span>
          <span className="footer-status"><i /> {t("Version de développement")}</span>
        </footer>
      </main>
      {toDelete && (
        <Modal title={t("Supprimer ce contact ?")} onClose={() => setToDelete(null)}>
          <p>{t("« {name} » sera supprimé définitivement, ainsi que son historique d'activités. Cette action est irréversible.", { name: toDelete.name })}</p>
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={() => setToDelete(null)}>{t("Annuler")}</button>
            <button type="button" className="primary danger" disabled={busy} onClick={onConfirmDelete}>{t("Supprimer définitivement")}</button>
          </div>
        </Modal>
      )}
      {modal === "lead" && (
        <Modal title={t("Nouveau prospect")} onClose={() => setModal(null)}>
          <LeadForm companies={ws.companies} busy={busy} onSubmit={onAddLead} />
        </Modal>
      )}
      {modal === "deal" && (
        <Modal title={t("Nouvelle opportunité")} onClose={() => setModal(null)}>
          <DealForm companies={ws.companies} contacts={ws.contacts} stages={ws.stages} busy={busy} onSubmit={onAddDeal} />
        </Modal>
      )}
      {modal === "appointment" && (
        <Modal title={t("Nouveau rendez-vous")} onClose={() => setModal(null)}>
          <AppointmentForm contacts={ws.contacts} busy={busy} defaultDate={apptDate} onSubmit={onAddAppointment} />
        </Modal>
      )}
      {modal === "invoice" && (
        <Modal title={t("Nouvelle facture")} onClose={() => setModal(null)}>
          <InvoiceForm companies={ws.companies} busy={busy} onSubmit={onAddInvoice} />
        </Modal>
      )}
      {modal === "task" && (
        <Modal title={t("Nouvelle tâche")} onClose={() => setModal(null)}>
          <TaskForm contacts={ws.contacts} busy={busy} onSubmit={onAddTask} />
        </Modal>
      )}
    </div>
  );
}
