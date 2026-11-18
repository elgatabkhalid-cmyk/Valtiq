// Formatage partagé (dates et montants), dans la langue choisie par l'utilisateur.
import { loc } from "../i18n";

/** Date locale au format AAAA-MM-JJ (sans conversion UTC). */
export function isoDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Montant avec devise. `decimals` = nombre maximal de décimales (0 pour les totaux arrondis). */
export function money(n: number, currency = "EUR", decimals = 2): string {
  try { return new Intl.NumberFormat(loc(), { style: "currency", currency, maximumFractionDigits: decimals }).format(n); }
  catch { return `${n.toFixed(decimals)} ${currency}`; }
}
