import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { X } from "lucide-react";
import { t, tv } from "../i18n";
import { isoDay } from "../lib/format";
import type {
  AppointmentInput, Company, Contact, DealInput, InvoiceInput, InvoiceStatus, LeadInput, Stage, TaskInput, TaskPriority
} from "../types";

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label={t("Fermer")} onClick={onClose}><X /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

type Submit<T> = (v: T) => Promise<string | null>;
/** Bouton de validation : « Créer… » en création, « Enregistrer » en modification. */
const submitLabel = (editing: boolean, create: string) => (editing ? t("Enregistrer les modifications") : t(create));

const LEAD_SOURCES = ["Prospection", "Site web", "Recommandation", "Réseaux sociaux", "Salon / événement", "Autre"];

export function LeadForm({ companies, busy, initial, onSubmit }: {
  companies: Company[]; busy: boolean; initial?: LeadInput; onSubmit: Submit<LeadInput>;
}) {
  const [firstName, setFirstName] = useState(initial?.firstName ?? "");
  const [lastName, setLastName] = useState(initial?.lastName ?? "");
  const [company, setCompany] = useState(initial?.company ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [source, setSource] = useState(initial?.source ?? "Prospection");
  // Source venant de Make ou d'un email : conservée dans la liste
  const sources = LEAD_SOURCES.includes(source) ? LEAD_SOURCES : [source, ...LEAD_SOURCES];
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!firstName.trim() || !lastName.trim()) { setError(t("Prénom et nom sont obligatoires.")); return; }
    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) { setError(t("Adresse email invalide.")); return; }
    const err = await onSubmit({ firstName, lastName, company, email, phone, source });
    if (err) setError(err);
  }

  return (
    <form onSubmit={submit} noValidate>
      <label>{t("Prénom")}<input value={firstName} onChange={e => setFirstName(e.target.value)} /></label>
      <label>{t("Nom")}<input value={lastName} onChange={e => setLastName(e.target.value)} /></label>
      <label>{t("Entreprise")}
        <input list="company-list" value={company} onChange={e => setCompany(e.target.value)} placeholder={t("Ex. Atelier Martin")} />
        <datalist id="company-list">{companies.map(c => <option key={c.id} value={c.name} />)}</datalist>
      </label>
      <label>{t("Email")}<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="contact@entreprise.fr" /></label>
      <label>{t("Téléphone")}<input value={phone} onChange={e => setPhone(e.target.value)} /></label>
      <label>{t("Source")}
        <select value={source} onChange={e => setSource(e.target.value)}>
          {sources.map(s => <option key={s} value={s}>{tv(s)}</option>)}
        </select>
      </label>
      {error && <div className="form-error" role="alert">{error}</div>}
      <button type="submit" className="primary full" disabled={busy}>{submitLabel(!!initial, "Créer le prospect")}</button>
    </form>
  );
}

export function DealForm({ companies, contacts, stages, busy, initial, onSubmit }: {
  companies: Company[]; contacts: Contact[]; stages: Stage[]; busy: boolean; initial?: DealInput; onSubmit: Submit<DealInput>;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [companyId, setCompanyId] = useState(initial?.companyId ?? "");
  const [contactId, setContactId] = useState(initial?.contactId ?? "");
  const [stageId, setStageId] = useState(initial?.stageId ?? stages[0]?.id ?? "");
  const [error, setError] = useState("");
  const shownContacts = companyId ? contacts.filter(c => c.company_id === companyId) : contacts;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!title.trim()) { setError(t("Le titre est obligatoire.")); return; }
    const n = amount.trim() === "" ? 0 : Number(amount.replace(",", "."));
    if (!Number.isFinite(n) || n < 0) { setError(t("Montant invalide.")); return; }
    const err = await onSubmit({ title, amount: n, companyId: companyId || null, contactId: contactId || null, stageId: stageId || null });
    if (err) setError(err);
  }

  return (
    <form onSubmit={submit} noValidate>
      <label>{t("Titre de l'opportunité")}<input value={title} onChange={e => setTitle(e.target.value)} placeholder={t("Ex. Mise en place du CRM")} /></label>
      <label>{t("Montant (€)")}<input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" /></label>
      <label>{t("Entreprise")}
        <select value={companyId} onChange={e => { setCompanyId(e.target.value); setContactId(""); }}>
          <option value="">{t("— Aucune —")}</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label>{t("Contact")}
        <select value={contactId} onChange={e => setContactId(e.target.value)}>
          <option value="">{t("— Aucun —")}</option>
          {shownContacts.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
        </select>
      </label>
      <label>{t("Étape")}
        <select value={stageId} onChange={e => setStageId(e.target.value)}>
          {stages.map(s => <option key={s.id} value={s.id}>{tv(s.name)}</option>)}
        </select>
      </label>
      {error && <div className="form-error" role="alert">{error}</div>}
      <button type="submit" className="primary full" disabled={busy}>{submitLabel(!!initial, "Créer l'opportunité")}</button>
    </form>
  );
}

function tomorrow() {
  const d = new Date(); d.setDate(d.getDate() + 1);
  return isoDay(d);
}

export function TaskForm({ contacts, busy, initial, onSubmit }: {
  contacts: Contact[]; busy: boolean; initial?: TaskInput; onSubmit: Submit<TaskInput>;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [dueDate, setDueDate] = useState(initial ? initial.dueDate : tomorrow());
  const [priority, setPriority] = useState<TaskPriority>(initial?.priority ?? "normal");
  const [contactId, setContactId] = useState(initial?.contactId ?? "");
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!title.trim()) { setError(t("Le titre est obligatoire.")); return; }
    const err = await onSubmit({ title, dueDate, priority, contactId: contactId || null });
    if (err) setError(err);
  }

  return (
    <form onSubmit={submit} noValidate>
      <label>{t("Tâche")}<input value={title} onChange={e => setTitle(e.target.value)} placeholder={t("Ex. Rappeler Thomas Martin")} /></label>
      <label>{t("Échéance")}<input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></label>
      <label>{t("Priorité")}
        <select value={priority} onChange={e => setPriority(e.target.value as TaskPriority)}>
          <option value="low">{t("Basse")}</option><option value="normal">{t("Normale")}</option><option value="high">{t("Haute")}</option>
        </select>
      </label>
      <label>{t("Contact lié")}
        <select value={contactId} onChange={e => setContactId(e.target.value)}>
          <option value="">{t("— Aucun —")}</option>
          {contacts.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
        </select>
      </label>
      {error && <div className="form-error" role="alert">{error}</div>}
      <button type="submit" className="primary full" disabled={busy}>{submitLabel(!!initial, "Créer la tâche")}</button>
    </form>
  );
}

export function AppointmentForm({ contacts, busy, defaultDate, initial, onSubmit }: {
  contacts: Contact[]; busy: boolean; defaultDate?: string; initial?: AppointmentInput; onSubmit: Submit<AppointmentInput>;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [date, setDate] = useState(initial?.date ?? defaultDate ?? isoDay(new Date()));
  const [start, setStart] = useState(initial?.start ?? "09:00");
  const [end, setEnd] = useState(initial ? initial.end : "09:30");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [urgent, setUrgent] = useState(initial?.urgent ?? false);
  const [contactId, setContactId] = useState(initial?.contactId ?? "");
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!title.trim()) { setError(t("Le titre est obligatoire.")); return; }
    if (!date || !start) { setError(t("La date et l'heure de début sont obligatoires.")); return; }
    if (end && end < start) { setError(t("L'heure de fin doit être après l'heure de début.")); return; }
    const err = await onSubmit({ title, date, start, end, location, notes, urgent, contactId: contactId || null });
    if (err) setError(err);
  }

  return (
    <form onSubmit={submit} noValidate>
      <label>{t("Objet")}<input value={title} onChange={e => setTitle(e.target.value)} placeholder={t("Ex. Consultation — Ana García")} /></label>
      <label>{t("Date")}<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
      <div className="form-row">
        <label>{t("Début")}<input type="time" value={start} onChange={e => setStart(e.target.value)} /></label>
        <label>{t("Fin")}<input type="time" value={end} onChange={e => setEnd(e.target.value)} /></label>
      </div>
      <label>{t("Lieu")}<input value={location} onChange={e => setLocation(e.target.value)} placeholder={t("Cabinet, visio, adresse…")} /></label>
      <label>{t("Contact lié")}
        <select value={contactId} onChange={e => setContactId(e.target.value)}>
          <option value="">{t("— Aucun —")}</option>
          {contacts.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
        </select>
      </label>
      <label>{t("Notes")}<input value={notes} onChange={e => setNotes(e.target.value)} /></label>
      <label className="check-row"><input type="checkbox" checked={urgent} onChange={e => setUrgent(e.target.checked)} /> {t("Rendez-vous urgent")}</label>
      {error && <div className="form-error" role="alert">{error}</div>}
      <button type="submit" className="primary full" disabled={busy}>{submitLabel(!!initial, "Créer le rendez-vous")}</button>
    </form>
  );
}

export function InvoiceForm({ companies, busy, initial, onSubmit }: {
  companies: Company[]; busy: boolean; initial?: InvoiceInput; onSubmit: Submit<InvoiceInput>;
}) {
  const in30 = new Date(); in30.setDate(in30.getDate() + 30);
  const [number, setNumber] = useState(initial?.number ?? "");
  const [clientName, setClientName] = useState(initial?.clientName ?? "");
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [issuedAt, setIssuedAt] = useState(initial ? initial.issuedAt : isoDay(new Date()));
  const [dueAt, setDueAt] = useState(initial ? initial.dueAt : isoDay(in30));
  const [status, setStatus] = useState<InvoiceStatus>(initial?.status ?? "unpaid");
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const n = Number(amount.replace(/\s/g, "").replace(",", "."));
    if (!clientName.trim()) { setError(t("Le client est obligatoire.")); return; }
    if (!amount.trim() || !Number.isFinite(n) || n < 0) { setError(t("Montant invalide.")); return; }
    const err = await onSubmit({ number, clientName, amount: n, issuedAt, dueAt, status });
    if (err) setError(err);
  }

  return (
    <form onSubmit={submit} noValidate>
      <label>{t("Numéro")}<input value={number} onChange={e => setNumber(e.target.value)} placeholder={t("Ex. F-2026-001")} /></label>
      <label>{t("Client")}
        <input list="invoice-company-list" value={clientName} onChange={e => setClientName(e.target.value)} />
        <datalist id="invoice-company-list">{companies.map(c => <option key={c.id} value={c.name} />)}</datalist>
      </label>
      <label>{t("Montant (€)")}<input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00" /></label>
      <div className="form-row">
        <label>{t("Émise le")}<input type="date" value={issuedAt} onChange={e => setIssuedAt(e.target.value)} /></label>
        <label>{t("Échéance")}<input type="date" value={dueAt} onChange={e => setDueAt(e.target.value)} /></label>
      </div>
      <label>{t("Statut")}
        <select value={status} onChange={e => setStatus(e.target.value as InvoiceStatus)}>
          <option value="unpaid">{t("À payer")}</option><option value="paid">{t("Payée")}</option>
        </select>
      </label>
      {error && <div className="form-error" role="alert">{error}</div>}
      <button type="submit" className="primary full" disabled={busy}>{submitLabel(!!initial, "Créer la facture")}</button>
    </form>
  );
}
