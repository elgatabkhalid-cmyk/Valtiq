import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  AlertTriangle, ArrowLeft, Bot, CalendarDays, Check, CheckCircle2, EyeOff, FileText, Inbox as InboxIcon, ListTodo, Paperclip, Target
} from "lucide-react";
import type { Appointment, ContactCategory, Contact, EmailDetail, EmailRow, EmailStatus, Mailbox, MessageType, Opportunity, TaskRow } from "../types";
import { attachmentUrl, errMsg, loadEmailDetail, logEmailAccess } from "../lib/api";
import { loc, t, tv } from "../i18n";
import { PageHeading } from "./Pages";
import type { Page } from "./Pages";

// Libellés (français = clé de traduction)
const STATUS: Record<EmailStatus, string> = {
  recu: "Reçu", en_analyse: "En analyse", classe: "Classé", a_verifier: "À vérifier", traite: "Traité", ignore: "Ignoré", erreur: "Erreur"
};
const LEVEL: Record<string, string> = { eleve: "Confiance élevée", moyen: "Confiance moyenne", faible: "Confiance faible" };
const NATURE: Record<string, string> = {
  humain: "Personne", automatique: "Message automatique", newsletter: "Newsletter", spam: "Spam", interne: "Interne", inconnu: "Inconnu"
};
const ACTION: Record<string, string> = {
  repondre: "Répondre", envoyer_devis: "Envoyer un devis", planifier_rdv: "Planifier un rendez-vous",
  transmettre_comptabilite: "Transmettre à la comptabilité", transmettre_rh: "Transmettre aux RH",
  transmettre_direction: "Transmettre à la direction", traiter_reclamation: "Traiter la réclamation",
  verifier_identite: "Vérifier l'identité", archiver: "Archiver", aucune: "Aucune action", verification_manuelle: "Vérification manuelle"
};
const POINTS: Record<string, string> = {
  identite_a_confirmer: "Identité du contact à confirmer",
  nouveau_contact_a_confirmer: "Nouveau contact créé par l'IA, à confirmer",
  nouvelle_adresse_a_confirmer: "Nouvelle adresse email à rattacher au contact",
  categorie_contact_provisoire: "Catégorie du contact provisoire",
  categorie_contact_divergente: "L'IA propose une autre catégorie pour ce contact",
  client_inconnu_a_confirmer: "Client inconnu à confirmer",
  expediteur_non_identifie: "Expéditeur non identifié",
  confiance_faible: "Confiance de l'IA faible",
  reponse_ia_illisible: "Réponse de l'IA illisible",
  reponse_ia_non_conforme: "Réponse de l'IA non conforme",
  categorie_inconnue: "Catégorie proposée inconnue",
  type_message_inconnu: "Type de message inconnu",
  action_ia_refusee: "Action proposée par l'IA refusée",
  contact_suppose_invalide: "Contact supposé introuvable",
  contenu_vide: "Email vide",
  pieces_jointes_non_importees: "Pièces jointes non importées",
  message_trop_court: "Message trop court : aucune action créée",
  routage_en_erreur: "Erreur lors de la création des actions"
};
const label = (map: Record<string, string>, code: string | null | undefined) => (code ? t(map[code] ?? code) : "—");

type Filter = "a_verifier" | "classe" | "ignore" | "erreur" | "all";
const inFilter = (e: EmailRow, f: Filter) =>
  f === "all" ? true
  : f === "a_verifier" ? e.statut_traitement === "a_verifier" || e.statut_traitement === "recu" || e.statut_traitement === "en_analyse"
  : f === "classe" ? e.statut_traitement === "classe" || e.statut_traitement === "traite"
  : e.statut_traitement === f;

export const needsReview = (e: EmailRow) => inFilter(e, "a_verifier") || e.statut_traitement === "erreur";

const when = (iso: string) => new Date(iso).toLocaleString(loc(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const size = (n: number | null) => (n === null ? ""
  : n < 1024 * 1024 ? t("{n} Ko", { n: Math.max(1, Math.round(n / 1024)) })
  : t("{n} Mo", { n: (n / 1024 / 1024).toLocaleString(loc(), { maximumFractionDigits: 1 }) }));

export type CorrectionInput = {
  emailId: string; typeCode: string | null; categoryCode: string | null; contactId: string | null; confirmIdentity: boolean; comment: string;
};

export function InboxPage({ emails, types, categories, mailboxes, contacts, tasks, appointments, opportunities, busy, onCorrect, onStatus, onNavigate }: {
  emails: EmailRow[]; types: MessageType[]; categories: ContactCategory[]; mailboxes: Mailbox[]; contacts: Contact[];
  tasks: TaskRow[]; appointments: Appointment[]; opportunities: Opportunity[]; busy: boolean;
  onCorrect: (v: CorrectionInput) => Promise<string | null>;
  onStatus: (id: string, s: EmailStatus) => void;
  onNavigate: (p: Page) => void;
}) {
  const [filter, setFilter] = useState<Filter>("a_verifier");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const rows = emails.filter(e => inFilter(e, filter));
  const selected = emails.find(e => e.id === selectedId) ?? null;
  const tabs: { id: Filter; label: string }[] = [
    { id: "a_verifier", label: "À vérifier" }, { id: "classe", label: "Classés" }, { id: "ignore", label: "Ignorés" },
    { id: "erreur", label: "Erreurs" }, { id: "all", label: "Tous" }
  ];
  const typeName = (id: string | null) => tv(types.find(x => x.id === id)?.libelle) || t("Non classé");

  return (
    <>
      <PageHeading eyebrow="MESSAGERIE" title="Boîte de réception"
        desc="Les emails reçus par l'automatisation, leur classement par l'IA et ce qui a été créé dans le CRM." />
      {mailboxes.length === 0 && emails.length === 0 ? (
        <section className="panel"><div className="empty">
          <InboxIcon size={24} aria-hidden="true" /><p>{t("Aucune boîte mail n'est encore connectée à cette organisation. La connexion se fait dans le scénario Make de l'automatisation des emails.")}</p>
        </div></section>
      ) : (
        <div className={`inbox ${selected ? "has-selection" : ""}`}>
          <section className="panel inbox-list">
            <div className="tabs" role="tablist">
              {tabs.map(tb => (
                <button type="button" role="tab" key={tb.id} aria-selected={filter === tb.id}
                  className={`tab ${filter === tb.id ? "active" : ""}`} onClick={() => setFilter(tb.id)}>
                  {t(tb.label)} <span>{emails.filter(e => inFilter(e, tb.id)).length}</span>
                </button>
              ))}
            </div>
            <ul className="mail-rows">
              {rows.map(e => (
                <li key={e.id}>
                  <button type="button" className={`mail-row ${selectedId === e.id ? "active" : ""} ${needsReview(e) ? "unread" : ""}`}
                    onClick={() => setSelectedId(e.id)}>
                    <div className="mail-row-top">
                      <b>{e.expediteur_nom || e.expediteur_normalise}</b>
                      <time>{when(e.recu_le)}</time>
                    </div>
                    <div className="mail-subject">{e.objet || t("(sans objet)")}</div>
                    <div className="mail-meta">
                      <span className="chip">{typeName(e.type_message_id)}</span>
                      {e.niveau_confiance && <span className={`level ${e.niveau_confiance}`}>{label(LEVEL, e.niveau_confiance)}</span>}
                      {e.nb_pieces_jointes > 0 && <Paperclip size={12} aria-label={t("Pièces jointes")} />}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            {rows.length === 0 && <div className="empty"><InboxIcon size={24} aria-hidden="true" />{t("Aucun email dans cette catégorie.")}</div>}
          </section>
          {selected ? (
            <EmailPanel key={selected.id} email={selected} types={types} categories={categories} contacts={contacts}
              tasks={tasks} appointments={appointments} opportunities={opportunities} busy={busy}
              onBack={() => setSelectedId(null)} onCorrect={onCorrect} onStatus={onStatus} onNavigate={onNavigate} />
          ) : (
            <section className="panel inbox-placeholder"><div className="empty"><InboxIcon size={24} aria-hidden="true" />{t("Sélectionnez un email pour voir le détail.")}</div></section>
          )}
        </div>
      )}
    </>
  );
}

function EmailPanel({ email, types, categories, contacts, tasks, appointments, opportunities, busy, onBack, onCorrect, onStatus, onNavigate }: {
  email: EmailRow; types: MessageType[]; categories: ContactCategory[]; contacts: Contact[];
  tasks: TaskRow[]; appointments: Appointment[]; opportunities: Opportunity[]; busy: boolean;
  onBack: () => void; onCorrect: (v: CorrectionInput) => Promise<string | null>;
  onStatus: (id: string, s: EmailStatus) => void; onNavigate: (p: Page) => void;
}) {
  const [detail, setDetail] = useState<EmailDetail | null>(null);
  const [loadError, setLoadError] = useState("");
  const contact = contacts.find(c => c.id === email.contact_id) ?? null;
  const currentType = types.find(x => x.id === email.type_message_id)?.code ?? "";
  const currentCat = categories.find(x => x.id === contact?.categorie_id)?.code ?? "";

  const [typeCode, setTypeCode] = useState(currentType);
  const [catCode, setCatCode] = useState(currentCat);
  const [contactId, setContactId] = useState(email.contact_id ?? "");
  const [confirmIdentity, setConfirmIdentity] = useState(false);
  const [comment, setComment] = useState("");
  const [formError, setFormError] = useState("");

  useEffect(() => {
    let cancelled = false;
    loadEmailDetail(email.id).then(d => { if (!cancelled) setDetail(d); }).catch(e => { if (!cancelled) setLoadError(errMsg(e)); });
    void logEmailAccess("email", email.id, "consultation").catch(() => undefined);
    return () => { cancelled = true; };
  }, [email.id]);

  const created = useMemo(() => {
    const c = detail?.created;
    if (!c) return [];
    const out: { icon: ReactNode; text: string; page: Page | null }[] = [];
    if (c.activite_id) out.push({ icon: <FileText size={14} />, text: t("Note ajoutée à l'historique du contact"), page: null });
    if (c.tache_id) {
      const tk = tasks.find(x => x.id === c.tache_id);
      out.push({ icon: <ListTodo size={14} />, text: t("Tâche : {title}", { title: tk?.title ?? "—" }), page: "tasks" });
    }
    if (c.rdv_id) {
      const a = appointments.find(x => x.id === c.rdv_id);
      out.push({ icon: <CalendarDays size={14} />, text: t("Rendez-vous : {title}", { title: a?.title ?? "—" }), page: "agenda" });
    }
    if (c.opportunite_id) {
      const o = opportunities.find(x => x.id === c.opportunite_id);
      out.push({ icon: <Target size={14} />, text: t("Opportunité : {title}", { title: o?.title ?? "—" }), page: "pipeline" });
    }
    return out;
  }, [detail, tasks, appointments, opportunities]);

  const identityPending = !!contact && contact.statut_identite !== undefined && contact.statut_identite !== "confirmee";
  const changed = typeCode !== currentType || catCode !== currentCat || contactId !== (email.contact_id ?? "") || confirmIdentity || comment.trim() !== "";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    const err = await onCorrect({
      emailId: email.id,
      typeCode: typeCode && typeCode !== currentType ? typeCode : null,
      categoryCode: catCode && catCode !== currentCat ? catCode : null,
      contactId: contactId && contactId !== (email.contact_id ?? "") ? contactId : null,
      confirmIdentity, comment
    });
    if (err) setFormError(err); else { setConfirmIdentity(false); setComment(""); }
  }

  return (
    <section className="panel mail-detail">
      <button type="button" className="text-btn mail-back" onClick={onBack}><ArrowLeft size={14} /> {t("Retour à la liste")}</button>
      <header className="mail-head">
        <div>
          <h2>{email.objet || t("(sans objet)")}</h2>
          <p>{email.expediteur_nom ? `${email.expediteur_nom} · ` : ""}{email.expediteur_normalise}</p>
          <p className="muted">{new Date(email.recu_le).toLocaleString(loc(), { dateStyle: "full", timeStyle: "short" })}</p>
        </div>
        <span className={`status ${email.statut_traitement === "erreur" ? "lost" : email.statut_traitement === "a_verifier" ? "contacted" : "qualified"}`}>
          {label(STATUS, email.statut_traitement)}
        </span>
      </header>

      <div className="ai-box">
        <div className="ai-box-head"><Bot size={15} /> <b>{t("Analyse de l'IA")}</b>
          {email.niveau_confiance && <span className={`level ${email.niveau_confiance}`}>
            {label(LEVEL, email.niveau_confiance)}{email.confiance !== null ? ` · ${Math.round(email.confiance * 100)} %` : ""}</span>}
        </div>
        {email.resume && <p>{email.resume}</p>}
        <dl className="facts">
          <dt>{t("Type de message")}</dt><dd>{tv(types.find(x => x.id === email.type_message_id)?.libelle) || t("Non classé")}</dd>
          <dt>{t("Expéditeur")}</dt><dd>{label(NATURE, email.nature_message)}</dd>
          <dt>{t("Action recommandée")}</dt><dd>{label(ACTION, email.action_recommandee)}</dd>
          <dt>{t("Contact")}</dt><dd>{contact ? `${contact.first_name} ${contact.last_name === "—" ? "" : contact.last_name}` : t("Non identifié")}
            {contact && currentCat ? ` · ${tv(categories.find(x => x.code === currentCat)?.libelle)}` : ""}</dd>
        </dl>
        {detail?.justification && <p className="muted">{t("Raison donnée par l'IA :")} {detail.justification}</p>}
      </div>

      {email.points_a_verifier.length > 0 && (
        <div className="check-list">
          <b><AlertTriangle size={14} /> {t("Points à vérifier")}</b>
          <ul>{email.points_a_verifier.map(p => <li key={p}>{label(POINTS, p)}</li>)}</ul>
        </div>
      )}
      {email.derniere_erreur && <div className="form-error">{t("Erreur : {error}", { error: email.derniere_erreur })}</div>}

      <div className="created">
        <b>{t("Créé dans le CRM")}</b>
        {detail === null && !loadError && <p className="muted">{t("Chargement…")}</p>}
        {detail !== null && created.length === 0 && <p className="muted">{t("Rien n'a été créé automatiquement pour cet email.")}</p>}
        <ul>
          {created.map((c, i) => (
            <li key={i}>{c.icon}<span>{c.text}</span>
              {c.page && <button type="button" className="text-btn" onClick={() => onNavigate(c.page!)}>{t("Voir")}</button>}</li>
          ))}
        </ul>
      </div>

      <details className="mail-body-wrap" open>
        <summary>{t("Contenu de l'email")}</summary>
        {loadError && <div className="form-error">{loadError}</div>}
        <pre className="mail-body">{detail?.corps_texte || email.extrait || t("(email vide)")}</pre>
        {detail && detail.pieces.length > 0 && (
          <ul className="attachments">
            {detail.pieces.map(p => (
              <li key={p.id}>
                <Paperclip size={13} /><span>{p.nom_fichier}</span><small>{size(p.taille_octets)}</small>
                {p.statut === "stockee"
                  ? <button type="button" className="mini-btn" onClick={() => {
                      attachmentUrl(p).then(u => window.open(u, "_blank", "noopener")).catch(e => setLoadError(errMsg(e)));
                    }}>{t("Ouvrir")}</button>
                  : <small className="muted">{p.statut === "rejetee" ? t("Refusée : {reason}", { reason: tv(p.motif_rejet) }) : t("Non stockée")}</small>}
              </li>
            ))}
          </ul>
        )}
      </details>

      <form className="correct-form" onSubmit={submit} noValidate>
        <b>{t("Corriger le classement")}</b>
        <div className="correct-grid">
          <label>{t("Type de message")}
            <select value={typeCode} onChange={e => setTypeCode(e.target.value)}>
              {!currentType && <option value="">{t("— Non classé —")}</option>}
              {types.map(x => <option key={x.id} value={x.code}>{tv(x.libelle)}</option>)}
            </select>
          </label>
          <label>{t("Contact")}
            <select value={contactId} onChange={e => setContactId(e.target.value)}>
              {!email.contact_id && <option value="">{t("— Non identifié —")}</option>}
              {contacts.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name === "—" ? "" : c.last_name}{c.email ? ` · ${c.email}` : ""}</option>)}
            </select>
          </label>
          <label>{t("Catégorie du contact")}
            <select value={catCode} onChange={e => setCatCode(e.target.value)} disabled={!contactId}>
              {!currentCat && <option value="">{t("— Aucune —")}</option>}
              {categories.map(x => <option key={x.id} value={x.code}>{tv(x.libelle)}</option>)}
            </select>
          </label>
          <label>{t("Commentaire (facultatif)")}
            <input value={comment} onChange={e => setComment(e.target.value)} />
          </label>
        </div>
        {(identityPending || email.points_a_verifier.some(p => p.includes("identite") || p.includes("contact_a_confirmer"))) && contactId && (
          <label className="check-row"><input type="checkbox" checked={confirmIdentity} onChange={e => setConfirmIdentity(e.target.checked)} />
            {t("Je confirme l'identité de ce contact")}</label>
        )}
        {formError && <div className="form-error" role="alert">{formError}</div>}
        <div className="mail-actions">
          <button type="submit" className="primary" disabled={busy || !changed}><Check size={14} /> {t("Enregistrer la correction")}</button>
          {email.statut_traitement !== "traite" && (
            <button type="button" className="secondary" disabled={busy} onClick={() => onStatus(email.id, "traite")}>
              <CheckCircle2 size={14} /> {t("Marquer comme traité")}</button>
          )}
          {email.statut_traitement !== "ignore" && (
            <button type="button" className="secondary" disabled={busy} onClick={() => onStatus(email.id, "ignore")}>
              <EyeOff size={14} /> {t("Ignorer")}</button>
          )}
        </div>
        <p className="muted">{t("Une correction est enregistrée dans l'historique et la catégorie corrigée ne sera plus modifiée par l'IA.")}</p>
      </form>
    </section>
  );
}
