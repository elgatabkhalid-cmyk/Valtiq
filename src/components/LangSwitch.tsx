import { setLang, useLang } from "../i18n";
import type { Lang } from "../i18n";

export function LangSwitch({ className = "" }: { className?: string }) {
  const lang = useLang();
  const opts: { id: Lang; label: string; name: string }[] = [
    { id: "fr", label: "FR", name: "Français" },
    { id: "es", label: "ES", name: "Español" },
    { id: "en", label: "EN", name: "English" }
  ];
  return (
    <div className={`lang-switch ${className}`} role="group" aria-label="Langue / Idioma / Language">
      {opts.map(o => (
        <button type="button" key={o.id} title={o.name} aria-pressed={lang === o.id}
          className={lang === o.id ? "active" : ""} onClick={() => setLang(o.id)}>{o.label}</button>
      ))}
    </div>
  );
}
