// Traduction FR / ES.
// Les textes sont écrits en français dans le code et servent de clé ; ES contient leur traduction espagnole.
// Variables : t("{n} contact(s)", { n: 3 }).
import { useSyncExternalStore } from "react";
import { ES } from "./i18n.es";

export type Lang = "fr" | "es";
const STORAGE_KEY = "valtiq-lang";

function detect(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "fr" || saved === "es") return saved;
  } catch { /* stockage indisponible */ }
  const nav = typeof navigator !== "undefined" ? navigator.language.toLowerCase() : "";
  return nav.startsWith("fr") ? "fr" : "es";
}

let current: Lang = detect();
const listeners = new Set<() => void>();
if (typeof document !== "undefined") document.documentElement.lang = current;

export function getLang(): Lang { return current; }

export function setLang(lang: Lang) {
  if (lang === current) return;
  current = lang;
  try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* ignoré */ }
  document.documentElement.lang = lang;
  listeners.forEach(f => f());
}

export function useLang(): Lang {
  return useSyncExternalStore(
    cb => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => current
  );
}

/** Locale pour les dates et montants. */
export function loc(): string { return current === "es" ? "es-ES" : "fr-FR"; }

export function t(fr: string, vars?: Record<string, string | number>): string {
  let s = current === "es" ? (ES[fr] ?? fr) : fr;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** Traduit une valeur venant de la base si elle est connue (noms d'étapes, sources…), sinon la renvoie telle quelle. */
export function tv(value: string | null | undefined): string {
  if (!value) return "";
  return current === "es" ? (ES[value] ?? value) : value;
}
