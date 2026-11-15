import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, Check, ChevronLeft, ChevronRight, CircleHelp, Copy, KeyRound, MapPin, Plug, Plus, Receipt, Undo2, Wallet, X
} from "lucide-react";
import type { Appointment, AppointmentStatus, IntegrationInfo, Invoice, InvoiceStatus } from "../types";
import { Kpi, PageHeading } from "./Pages";

// ---------------------------------------------------------------------------
// Utilitaires de dates (heure locale)
// ---------------------------------------------------------------------------
function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function startOfWeek(d: Date) { const x = startOfDay(d); const wd = (x.getDay() + 6) % 7; return addDays(x, -wd); } // lundi
function sameDay(a: Date, b: Date) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
const hm = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const dmy = (iso: string | null) => (iso ? new Date(iso.length === 10 ? iso + "T12:00:00" : iso).toLocaleDateString("fr-FR") : "—");
export function isoDay(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function fmtMoney(n: number, currency = "EUR") {
  try { return new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: 2 }).format(n); }
  catch { return `${n.toFixed(2)} ${currency}`; }
}

// ---------------------------------------------------------------------------
// Agenda
// ---------------------------------------------------------------------------
const APPT_STATUS: Record<AppointmentStatus, string> = { scheduled: "Prévu", done: "Terminé", cancelled: "Annulé" };

export function upcomingUrgent(appointments: Appointment[]) {
  const from = startOfDay(new Date());
  return appointments
    .filter(a => a.urgent && a.status === "scheduled" && new Date(a.starts_at) >= from)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

function ApptCard({ a, contact, onStatus, showDate = false }: {
  a: Appointment; contact: string; onStatus: (id: string, s: AppointmentStatus) => void; showDate?: boolean;
}) {
  return (
    <div className={`appt-card ${a.urgent ? "urgent" : ""} ${a.status}`}>
      <div className="appt-time">
        {showDate && <span>{new Date(a.starts_at).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })} · </span>}
        {hm(a.starts_at)}{a.ends_at ? `–${hm(a.ends_at)}` : ""}
        {a.urgent && <em><AlertTriangle size={11} /> Urgent</em>}
      </div>
      <b className={a.status === "cancelled" ? "strike" : ""}>{a.title}</b>
      {contact && <small>{contact}</small>}
      {a.location && <small><MapPin size={10} /> {a.location}</small>}
      {a.notes && <small className="appt-notes">{a.notes}</small>}
      <div className="appt-actions">
        {a.status === "scheduled" ? (
          <>
            <button type="button" className="mini-btn" onClick={() => onStatus(a.id, "done")}><Check size={12} /> Terminé</button>
            <button type="button" className="mini-btn" onClick={() => onStatus(a.id, "cancelled")}><X size={12} /> Annuler</button>
          </>
        ) : (
          <>
            <span className={`status ${a.status === "done" ? "qualified" : "lost"}`}>{APPT_STATUS[a.status]}</span>
            <button type="button" className="mini-btn" onClick={() => onStatus(a.id, "scheduled")}><Undo2 size={12} /> Rétablir</button>
          </>
        )}
      </div>
    </div>
  );
}

export function Agenda({ appointments, contactName, onStatus, onAdd }: {
  appointments: Appointment[]; contactName: (id: string | null) => string;
  onStatus: (id: string, s: AppointmentStatus) => void; onAdd: (date?: string) => void;
}) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const today = new Date();
  const urgent = upcomingUrgent(appointments);
  const weekEnd = addDays(weekStart, 7);
  const inWeek = appointments.filter(a => { const d = new Date(a.starts_at); return d >= weekStart && d < weekEnd; });
  const label = `${days[0].toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} – ${days[6].toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}`;

  return (
    <>
      <PageHeading eyebrow="ORGANISATION" title="Agenda" desc="Vos rendez-vous de la semaine. Les rendez-vous urgents sont mis en avant."
        action={<button type="button" className="primary" onClick={() => onAdd()}><Plus size={16} /> Nouveau rendez-vous</button>} />

      <section className={`panel urgent-panel ${urgent.length ? "has-urgent" : ""}`}>
        <div className="panel-head">
          <div><h3><AlertTriangle size={14} /> Rendez-vous urgents</h3><p>{urgent.length ? `${urgent.length} à traiter` : "Aucun rendez-vous urgent à venir."}</p></div>
        </div>
        {urgent.length > 0 && (
          <div className="urgent-list">
            {urgent.slice(0, 6).map(a => <ApptCard key={a.id} a={a} contact={contactName(a.contact_id)} onStatus={onStatus} showDate />)}
          </div>
        )}
      </section>

      <section className="panel week-panel">
        <div className="week-nav">
          <button type="button" className="icon-btn" aria-label="Semaine précédente" onClick={() => setWeekStart(addDays(weekStart, -7))}><ChevronLeft /></button>
          <button type="button" className="secondary" onClick={() => setWeekStart(startOfWeek(new Date()))}>Aujourd'hui</button>
          <button type="button" className="icon-btn" aria-label="Semaine suivante" onClick={() => setWeekStart(addDays(weekStart, 7))}><ChevronRight /></button>
          <b>{label}</b>
          <span className="muted">{inWeek.filter(a => a.status !== "cancelled").length} rendez-vous</span>
        </div>
        <div className="week-grid">
          {days.map(d => {
            const list = inWeek.filter(a => sameDay(new Date(a.starts_at), d)).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
            return (
              <div className={`day-col ${sameDay(d, today) ? "today" : ""}`} key={d.toISOString()}>
                <div className="day-head">
                  <span>{d.toLocaleDateString("fr-FR", { weekday: "short" })}</span><b>{d.getDate()}</b>
                  <button type="button" className="icon-btn" aria-label={`Ajouter un rendez-vous le ${d.toLocaleDateString("fr-FR")}`} onClick={() => onAdd(isoDay(d))}><Plus size={14} /></button>
                </div>
                {list.map(a => <ApptCard key={a.id} a={a} contact={contactName(a.contact_id)} onStatus={onStatus} />)}
                {list.length === 0 && <div className="day-empty">—</div>}
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Factures
// ---------------------------------------------------------------------------
type InvoiceFilter = "unpaid" | "overdue" | "paid" | "all";

export function isOverdue(i: Invoice) {
  return i.status === "unpaid" && !!i.due_at && i.due_at < isoDay(new Date());
}

export function Invoices({ invoices, clientName, onStatus, onAdd }: {
  invoices: Invoice[]; clientName: (i: Invoice) => string;
  onStatus: (id: string, s: InvoiceStatus) => void; onAdd: () => void;
}) {
  const [filter, setFilter] = useState<InvoiceFilter>("unpaid");
  const unpaid = invoices.filter(i => i.status === "unpaid");
  const overdue = unpaid.filter(isOverdue);
  const paid = invoices.filter(i => i.status === "paid");
  const sum = (l: Invoice[]) => l.reduce((s, i) => s + i.amount, 0);
  const monthKey = isoDay(new Date()).slice(0, 7);
  const paidThisMonth = paid.filter(i => (i.paid_at ?? "").startsWith(monthKey));

  const rows = (filter === "unpaid" ? unpaid : filter === "overdue" ? overdue : filter === "paid" ? paid : invoices)
    .slice()
    .sort((a, b) => filter === "paid"
      ? (b.paid_at ?? "").localeCompare(a.paid_at ?? "")
      : (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999"));

  const tabs: { id: InvoiceFilter; label: string; n: number }[] = [
    { id: "unpaid", label: "À payer", n: unpaid.length },
    { id: "overdue", label: "En retard", n: overdue.length },
    { id: "paid", label: "Payées", n: paid.length },
    { id: "all", label: "Toutes", n: invoices.length }
  ];

  return (
    <>
      <PageHeading eyebrow="FINANCES" title="Factures" desc="Suivez ce qui a été encaissé et ce qui reste à payer."
        action={<button type="button" className="primary" onClick={onAdd}><Plus size={16} /> Nouvelle facture</button>} />
      <div className="kpi-grid kpi-3">
        <Kpi label="À encaisser" value={fmtMoney(sum(unpaid))} change={`${unpaid.length} facture(s) à payer`} icon={<Wallet />} />
        <Kpi label="En retard" value={fmtMoney(sum(overdue))} change={overdue.length ? `${overdue.length} échéance(s) dépassée(s)` : "Aucun retard"} icon={<AlertTriangle />} alert={overdue.length > 0} />
        <Kpi label="Encaissé ce mois-ci" value={fmtMoney(sum(paidThisMonth))} change={`${paid.length} facture(s) payée(s) au total`} icon={<Receipt />} />
      </div>
      <section className="panel table-panel">
        <div className="tabs" role="tablist">
          {tabs.map(t => (
            <button type="button" role="tab" aria-selected={filter === t.id} key={t.id}
              className={`tab ${filter === t.id ? "active" : ""}`} onClick={() => setFilter(t.id)}>
              {t.label} <span>{t.n}</span>
            </button>
          ))}
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>N°</th><th>CLIENT</th><th>ÉMISE</th><th>ÉCHÉANCE</th><th>MONTANT</th><th>STATUT</th><th></th></tr></thead>
            <tbody>
              {rows.map(i => (
                <tr key={i.id}>
                  <td><b>{i.number || "—"}</b></td>
                  <td>{clientName(i) || "—"}</td>
                  <td>{dmy(i.issued_at)}</td>
                  <td className={isOverdue(i) ? "overdue-date" : ""}>{dmy(i.due_at)}</td>
                  <td><b>{fmtMoney(i.amount, i.currency)}</b></td>
                  <td>
                    {i.status === "paid"
                      ? <span className="status qualified">Payée{i.paid_at ? ` le ${dmy(i.paid_at)}` : ""}</span>
                      : <span className={`status ${isOverdue(i) ? "lost" : "contacted"}`}>{isOverdue(i) ? "En retard" : "À payer"}</span>}
                  </td>
                  <td>
                    {i.status === "paid"
                      ? <button type="button" className="row-btn" onClick={() => onStatus(i.id, "unpaid")}>Marquer impayée</button>
                      : <button type="button" className="mini-btn" onClick={() => onStatus(i.id, "paid")}><Check size={12} /> Marquer payée</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <div className="empty">Aucune facture dans cette catégorie.</div>}
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Intégration Make (page Paramètres)
// ---------------------------------------------------------------------------
function CopyField({ label, value, secret = false }: { label: string; value: string; secret?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignoré */ }
  }
  return (
    <div className="copy-field">
      <span>{label}</span>
      <div><code className={secret ? "secret" : ""}>{value}</code>
        <button type="button" className="mini-btn" onClick={copy}><Copy size={12} /> {copied ? "Copié" : "Copier"}</button></div>
    </div>
  );
}

export function MakeIntegration({ endpoint, apiKey, info, newToken, busy, onGenerate, onRevoke, onLoad }: {
  endpoint: string; apiKey: string; info: IntegrationInfo; newToken: string | null; busy: boolean;
  onGenerate: () => void; onRevoke: () => void; onLoad: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { onLoad(); }, [onLoad]);
  const example = JSON.stringify({
    p_token: newToken ?? "VOTRE_CLE_VQ_…",
    p_type: "appointment",
    p_data: { title: "Urgence — Ana García", starts_at: "2026-11-20T10:00:00+01:00", urgent: true, contact_email: "ana@exemple.com", external_id: "id-unique-de-la-source" }
  }, null, 2);

  return (
    <section className="panel invite-panel make-panel">
      <div className="panel-head"><div><h3><Plug size={14} /> Intégration Make</h3>
        <p>Permet à un scénario Make d'ajouter ou de mettre à jour automatiquement prospects, entreprises, opportunités, rendez-vous et factures dans cette organisation. Les données apparaissent en direct.</p></div></div>

      {newToken && (
        <div className="callout warn"><KeyRound size={18} /><div>
          <p><b>Voici votre nouvelle clé. Copiez-la maintenant : elle ne sera plus jamais affichée.</b></p>
          <CopyField label="Clé d'intégration (p_token)" value={newToken} secret />
        </div></div>
      )}

      <div className="make-status">
        {info
          ? <p>Clé active se terminant par <code>…{info.token_hint}</code> · créée le {dmy(info.created_at)} · {info.last_used_at ? `dernier appel le ${new Date(info.last_used_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}` : "jamais utilisée"}</p>
          : <p className="muted">Aucune clé pour le moment.</p>}
        <div className="make-buttons">
          {!confirm && <button type="button" className="primary" disabled={busy} onClick={() => (info ? setConfirm(true) : onGenerate())}>
            <KeyRound size={14} /> {info ? "Générer une nouvelle clé" : "Générer une clé"}</button>}
          {confirm && (
            <>
              <span className="muted">L'ancienne clé cessera immédiatement de fonctionner dans Make.</span>
              <button type="button" className="primary danger" disabled={busy} onClick={() => { setConfirm(false); onGenerate(); }}>Confirmer</button>
              <button type="button" className="secondary" onClick={() => setConfirm(false)}>Annuler</button>
            </>
          )}
          {info && !confirm && <button type="button" className="secondary" disabled={busy} onClick={onRevoke}>Désactiver la clé</button>}
        </div>
      </div>

      <h4>Configuration du module « HTTP — Make a request » dans Make</h4>
      <CopyField label="URL (méthode POST)" value={endpoint} />
      <CopyField label="En-tête apikey" value={apiKey} />
      <CopyField label="En-tête Content-Type" value="application/json" />
      <p className="muted">Corps (Body type : Raw, JSON) — exemple :</p>
      <pre className="code-block">{example}</pre>
      <details className="make-help">
        <summary>Champs acceptés par type (p_type)</summary>
        <ul>
          <li><b>contact</b> : first_name, last_name (ou name), email, phone, company, source, external_id — dédoublonné par email</li>
          <li><b>company</b> : name, sector, website, email, phone, address — dédoublonné par nom</li>
          <li><b>opportunity</b> : title, amount, stage (nom de l'étape), company, contact_email, external_id</li>
          <li><b>appointment</b> : title, starts_at, ends_at, location, notes, urgent (true/false), status (scheduled/done/cancelled), contact_email, external_id</li>
          <li><b>invoice</b> : number, amount, currency, client_name, company, contact_email, issued_at, due_at, paid_at, status (paid/unpaid), external_id — dédoublonné par external_id puis par numéro</li>
        </ul>
        <p className="muted">Dates : 2026-11-20 ou 2026-11-20T14:30:00+01:00. Montants : 1500.50, 1500,50 ou 1.500,50. Renvoyer le même external_id met à jour l'élément au lieu d'en créer un nouveau.</p>
      </details>
      <div className="callout"><CircleHelp size={18} /><p>La clé ne donne accès qu'à cette organisation et uniquement pour ajouter ou mettre à jour des données : elle ne permet ni de lire ni de supprimer. Ne la partagez qu'avec votre scénario Make. Chaque appel apparaît dans le journal de la page Automatisations.</p></div>
    </section>
  );
}

