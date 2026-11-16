// Datos legales del titular del servicio (empresa establecida en España).
// Sustituya cada valor que empieza por « [ » antes de cualquier uso comercial.
// Mientras quede alguno, las páginas legales muestran un aviso de « documento provisional ».
export const LEGAL = {
  productName: "VALTIQ",
  companyName: "[A COMPLETAR · razón social]",
  legalForm: "[A COMPLETAR · forma jurídica, p. ej. S.L.]",
  taxId: "[A COMPLETAR · NIF]",
  registration: "[A COMPLETAR · Registro Mercantil de …, tomo, folio, hoja]",
  address: "[A COMPLETAR · domicilio social]",
  contactEmail: "[A COMPLETAR · email de contacto]",
  aiProvider: "[A COMPLETAR · proveedor de IA usado para clasificar los correos]",
  /** Meses de conservación tras el fin del contrato (null = a completar). */
  retentionMonths: null as number | null,
  lastUpdate: "2026-11-16"
};

export const isPending = (v: string | number | null) => v === null || (typeof v === "string" && v.startsWith("["));
export const legalIncomplete = Object.values(LEGAL).some(isPending);
