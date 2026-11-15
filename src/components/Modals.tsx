import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { X } from "lucide-react";
import type { Company, Contact, Stage, TaskPriority } from "../types";

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
          <button type="button" className="icon-btn" aria-label="Fermer" onClick={onClose}><X /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

type Submit<T> = (v: T) => Promise<string | null>;

export function LeadForm({ companies, busy, onSubmit }: {
  companies: Company[]; busy: boolean;
  onSubmit: Submit<{ firstName: string; lastName: string; company: string; email: string; phone: string; source: string }>;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState("Prospection");
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!firstName.trim() || !lastName.trim()) { setError("Prénom et nom sont obligatoires."); return; }
    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) { setError("Adresse email invalide."); return; }
    const err = await onSubmit({ firstName, lastName, company, email, phone, source });
    if (err) setError(err);
  }

  return (
    <form onSubmit={submit} noValidate>
      <label>Prénom<input value={firstName} onChange={e => setFirstName(e.target.value)} /></label>
      <label>Nom<input value={lastName} onChange={e => setLastName(e.target.value)} /></label>
      <label>Entreprise
        <input list="company-list" value={company} onChange={e => setCompany(e.target.value)} placeholder="Ex. Atelier Martin" />
        <datalist id="company-list">{companies.map(c => <option key={c.id} value={c.name} />)}</datalist>
      </label>
      <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="contact@entreprise.fr" /></label>
      <label>Téléphone<input value={phone} onChange={e => setPhone(e.target.value)} /></label>
      <label>Source
        <select value={source} onChange={e => setSource(e.target.value)}>
          {["Prospection", "Site web", "Recommandation", "Réseaux sociaux", "Salon / événement", "Autre"].map(s => <option key={s}>{s}</option>)}
        </select>
      </label>
      {error && <div className="form-error" role="alert">{error}</div>}
      <button type="submit" className="primary full" disabled={busy}>Créer le prospect</button>
    </form>
  );
}

export function DealForm({ companies, contacts, stages, busy, onSubmit }: {
  companies: Company[]; contacts: Contact[]; stages: Stage[]; busy: boolean;
  onSubmit: Submit<{ title: string; amount: number; companyId: string | null; contactId: string | null; stageId: string | null }>;
}) {
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [contactId, setContactId] = useState("");
  const [stageId, setStageId] = useState(stages[0]?.id ?? "");
  const [error, setError] = useState("");
  const shownContacts = companyId ? contacts.filter(c => c.company_id === companyId) : contacts;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!title.trim()) { setError("Le titre est obligatoire."); return; }
    const n = amount.trim() === "" ? 0 : Number(amount.replace(",", "."));
    if (!Number.isFinite(n) || n < 0) { setError("Montant invalide."); return; }
    const err = await onSubmit({ title, amount: n, companyId: companyId || null, contactId: contactId || null, stageId: stageId || null });
    if (err) setError(err);
  }

  return (
    <form onSubmit={submit} noValidate>
      <label>Titre de l'opportunité<input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex. Mise en place du CRM" /></label>
      <label>Montant (€)<input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" /></label>
      <label>Entreprise
        <select value={companyId} onChange={e => { setCompanyId(e.target.value); setContactId(""); }}>
          <option value="">— Aucune —</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label>Contact
        <select value={contactId} onChange={e => setContactId(e.target.value)}>
          <option value="">— Aucun —</option>
          {shownContacts.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
        </select>
      </label>
      <label>Étape
        <select value={stageId} onChange={e => setStageId(e.target.value)}>
          {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      {error && <div className="form-error" role="alert">{error}</div>}
      <button type="submit" className="primary full" disabled={busy}>Créer l'opportunité</button>
    </form>
  );
}

function tomorrow() {
  const d = new Date(); d.setDate(d.getDate() + 1);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function TaskForm({ contacts, busy, onSubmit }: {
  contacts: Contact[]; busy: boolean;
  onSubmit: Submit<{ title: string; dueDate: string; priority: TaskPriority; contactId: string | null }>;
}) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(tomorrow());
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [contactId, setContactId] = useState("");
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!title.trim()) { setError("Le titre est obligatoire."); return; }
    const err = await onSubmit({ title, dueDate, priority, contactId: contactId || null });
    if (err) setError(err);
  }

  return (
    <form onSubmit={submit} noValidate>
      <label>Tâche<input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex. Rappeler Thomas Martin" /></label>
      <label>Échéance<input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></label>
      <label>Priorité
        <select value={priority} onChange={e => setPriority(e.target.value as TaskPriority)}>
          <option value="low">Basse</option><option value="normal">Normale</option><option value="high">Haute</option>
        </select>
      </label>
      <label>Contact lié
        <select value={contactId} onChange={e => setContactId(e.target.value)}>
          <option value="">— Aucun —</option>
          {contacts.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
        </select>
      </label>
      {error && <div className="form-error" role="alert">{error}</div>}
      <button type="submit" className="primary full" disabled={busy}>Créer la tâche</button>
    </form>
  );
}
