import { useEffect, useState } from "react";
import App from "./App";
import { LegalPage } from "./components/LegalPages";
import { useLang } from "./i18n";

function route(): "mentions" | "privacy" | null {
  const h = window.location.hash;
  if (h === "#/mentions-legales") return "mentions";
  if (h === "#/confidentialite") return "privacy";
  return null;
}

export default function Root() {
  useLang(); // re-rend toute l'application quand la langue change
  const [r, setR] = useState(route());
  useEffect(() => {
    const f = () => { setR(route()); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  return r ? <LegalPage kind={r} /> : <App />;
}
