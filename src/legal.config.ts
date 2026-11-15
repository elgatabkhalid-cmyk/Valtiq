// Informations légales de l'éditeur. Remplacez chaque valeur « [À COMPLÉTER … ] » avant toute mise en service
// commerciale. Tant qu'une valeur contient « [À COMPLÉTER », les pages légales affichent un bandeau « provisoire ».
export const LEGAL = {
  productName: "VALTIQ",
  companyName: "[À COMPLÉTER : dénomination sociale]",
  legalForm: "[À COMPLÉTER : forme juridique, ex. SAS]",
  shareCapital: "[À COMPLÉTER : capital social]",
  address: "[À COMPLÉTER : adresse du siège social]",
  registration: "[À COMPLÉTER : numéro SIREN / RCS]",
  publicationDirector: "[À COMPLÉTER : nom du directeur de la publication]",
  contactEmail: "[À COMPLÉTER : adresse email de contact]",
  accountRetention: "[À COMPLÉTER : durée de conservation après la fin du contrat, ex. 12 mois]",
  lastUpdate: "15 novembre 2026 (version provisoire)"
};

export const legalIncomplete = Object.values(LEGAL).some(v => v.includes("[À COMPLÉTER"));
