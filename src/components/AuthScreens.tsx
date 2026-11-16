import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { supabase } from "../lib/supabase";
import { errMsg } from "../lib/api";
import { getLang, t } from "../i18n";
import { LangSwitch } from "./LangSwitch";

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="brand auth-brand">
          <div className="brand-symbol">V</div>
          <div><b>VALTIQ</b><small>CRM PLATFORM</small></div>
          <LangSwitch className="auth-lang" />
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfigMissing() {
  return (
    <Shell>
      <h1>{t("Configuration requise")}</h1>
      <p className="muted">
        {t("Les variables VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY sont absentes ou invalides. Renseignez le fichier .env, puis relancez npm run dev.")}
      </p>
    </Shell>
  );
}

export function Loading({ text }: { text?: string }) {
  return <Shell><p className="muted" role="status">{text ?? t("Chargement…")}</p></Shell>;
}

export function AuthScreen() {
  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setError(""); setInfo("");
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError(t("Adresse email invalide.")); return; }
    if (mode === "reset") {
      setBusy(true);
      try {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/` });
        if (err) throw err;
        // Même message que le compte existe ou non : on ne révèle pas quels emails sont inscrits
        setInfo(t("Si un compte existe avec cet email, vous allez recevoir un lien pour choisir un nouveau mot de passe. Pensez à vérifier vos spams."));
      } catch (e) {
        setError(errMsg(e));
      } finally {
        setBusy(false);
      }
      return;
    }
    if (password.length < 8) { setError(t("Le mot de passe doit contenir au moins 8 caractères.")); return; }
    if (mode === "signup" && !fullName.trim()) { setError(t("Indiquez votre nom.")); return; }
    if (mode === "signup" && !consent) { setError(t("Vous devez accepter la politique de confidentialité.")); return; }
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (err) throw err;
      } else {
        const { data, error: err } = await supabase.auth.signUp({
          email: email.trim(), password, options: { data: { full_name: fullName.trim(), privacy_accepted_at: new Date().toISOString(), lang: getLang() } }
        });
        if (err) throw err;
        if (!data.session) {
          setInfo(t("Compte créé. Un email de confirmation vous a été envoyé : cliquez sur le lien, puis connectez-vous."));
          setMode("signin");
        }
      }
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <h1>{mode === "signin" ? t("Connexion") : mode === "signup" ? t("Créer un compte") : t("Mot de passe oublié")}</h1>
      <p className="muted">
        {mode === "signin" ? t("Accédez à votre espace commercial.")
          : mode === "signup" ? t("Créez votre compte, puis votre organisation.")
          : t("Indiquez l'email de votre compte : nous vous enverrons un lien pour choisir un nouveau mot de passe.")}
      </p>
      <form onSubmit={submit} noValidate>
        {mode === "signup" && (
          <label>{t("Nom complet")}
            <input value={fullName} onChange={e => setFullName(e.target.value)} autoComplete="name" />
          </label>
        )}
        <label>Email
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
        </label>
        {mode !== "reset" && (
          <label>{t("Mot de passe")}
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              autoComplete={mode === "signin" ? "current-password" : "new-password"} />
          </label>
        )}
        {mode === "signin" && (
          <button type="button" className="text-btn forgot-link" onClick={() => { setMode("reset"); setError(""); setInfo(""); }}>
            {t("Mot de passe oublié ?")}
          </button>
        )}
        {mode === "signup" && (
          <label className="check-row">
            <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
            <span>{t("J'ai lu et j'accepte la")} <a href="#/confidentialite" target="_blank" rel="noreferrer">{t("politique de confidentialité")}</a>.</span>
          </label>
        )}
        {error && <div className="form-error" role="alert">{error}</div>}
        {info && <div className="form-info" role="status">{info}</div>}
        <button type="submit" className="primary full" disabled={busy}>
          {busy ? t("Patientez…") : mode === "signin" ? t("Se connecter") : mode === "signup" ? t("Créer mon compte") : t("Envoyer le lien")}
        </button>
      </form>
      <button type="button" className="text-btn auth-switch"
        onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); setInfo(""); }}>
        {mode === "signin" ? t("Pas encore de compte ? Créer un compte") : mode === "signup" ? t("Déjà un compte ? Se connecter") : t("Retour à la connexion")}
      </button>
      <p className="auth-legal muted"><a href="#/mentions-legales">{t("Mentions légales")}</a> · <a href="#/confidentialite">{t("Confidentialité")}</a></p>
    </Shell>
  );
}

/** Écran affiché après un clic sur le lien « mot de passe oublié » reçu par email. */
export function NewPasswordScreen({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setError("");
    if (password.length < 8) { setError(t("Le mot de passe doit contenir au moins 8 caractères.")); return; }
    if (password !== confirm) { setError(t("Les deux mots de passe ne sont pas identiques.")); return; }
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw err;
      onDone();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <h1>{t("Nouveau mot de passe")}</h1>
      <p className="muted">{t("Choisissez le nouveau mot de passe de votre compte (8 caractères minimum).")}</p>
      <form onSubmit={submit} noValidate>
        <label>{t("Nouveau mot de passe")}
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" />
        </label>
        <label>{t("Confirmez le mot de passe")}
          <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" />
        </label>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button type="submit" className="primary full" disabled={busy}>{busy ? t("Patientez…") : t("Enregistrer le mot de passe")}</button>
      </form>
    </Shell>
  );
}

export function Onboarding({ onCreate, onSignOut }: { onCreate: (name: string) => Promise<void>; onSignOut: () => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) { setError(t("Indiquez le nom de votre entreprise.")); return; }
    setBusy(true);
    try { await onCreate(name.trim()); }
    catch (err) { setError(errMsg(err)); }
    finally { setBusy(false); }
  }

  return (
    <Shell>
      <h1>{t("Créez votre organisation")}</h1>
      <p className="muted">{t("C'est l'espace de travail de votre entreprise : vos prospects, votre pipeline et votre équipe.")}</p>
      <form onSubmit={submit} noValidate>
        <label>{t("Nom de l'entreprise")}
          <input value={name} onChange={e => setName(e.target.value)} placeholder={t("Ex. Atelier Martin")} />
        </label>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button type="submit" className="primary full" disabled={busy}>{busy ? t("Création…") : t("Créer l'organisation")}</button>
      </form>
      <button type="button" className="text-btn auth-switch" onClick={onSignOut}>{t("Se déconnecter")}</button>
    </Shell>
  );
}
