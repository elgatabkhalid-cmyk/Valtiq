// Écran affiché si une erreur inattendue fait planter l'affichage (au lieu d'une page blanche).
import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { t } from "../i18n";

type State = { failed: boolean };

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Visible dans la console du navigateur pour le diagnostic ; aucune donnée n'est envoyée à l'extérieur.
    console.error("VALTIQ — erreur d'affichage", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="crash" role="alert">
        <div className="crash-box">
          <h1>{t("Une erreur inattendue s'est produite")}</h1>
          <p>{t("Vos données sont en sécurité. Rechargez la page pour continuer ; si le problème revient, contactez votre administrateur.")}</p>
          <button type="button" className="primary" onClick={() => window.location.reload()}>{t("Recharger la page")}</button>
        </div>
      </div>
    );
  }
}
