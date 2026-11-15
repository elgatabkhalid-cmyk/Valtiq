import { LEGAL, legalIncomplete } from "../legal.config";

export type LegalKind = "mentions" | "privacy";

function Draft() {
  if (!legalIncomplete) return null;
  return (
    <div className="form-error" role="note">
      Document provisoire : les informations entre crochets doivent être complétées, et le texte validé par un
      professionnel du droit, avant toute mise en service commerciale.
    </div>
  );
}

export function LegalPage({ kind }: { kind: LegalKind }) {
  return (
    <div className="legal-screen">
      <article className="legal">
        <a className="text-btn" href="#/">← Retour à l'application</a>
        <Draft />
        {kind === "mentions" ? <Mentions /> : <Privacy />}
        <p className="muted">Dernière mise à jour : {LEGAL.lastUpdate}</p>
        <nav className="legal-links">
          <a href="#/mentions-legales">Mentions légales</a> · <a href="#/confidentialite">Politique de confidentialité</a>
        </nav>
      </article>
    </div>
  );
}

function Mentions() {
  return (
    <>
      <h1>Mentions légales</h1>
      <h2>Éditeur du service</h2>
      <p>
        {LEGAL.productName} est édité par {LEGAL.companyName}, {LEGAL.legalForm} au capital de {LEGAL.shareCapital},
        dont le siège social est situé {LEGAL.address}. Immatriculation : {LEGAL.registration}.
      </p>
      <p>Directeur de la publication : {LEGAL.publicationDirector}.</p>
      <p>Contact : {LEGAL.contactEmail}.</p>
      <h2>Hébergement</h2>
      <p>
        L'application web est hébergée par Netlify, Inc. Les données (comptes et données du CRM) sont stockées par
        Supabase dans une région située dans l'Union européenne (Paris). [À VÉRIFIER : adresses postales des
        hébergeurs à reproduire ici.]
      </p>
      <h2>Propriété intellectuelle</h2>
      <p>
        L'application, son interface, ses textes et son code sont protégés. Toute reproduction non autorisée est
        interdite. Les données saisies par les utilisateurs restent la propriété de leur organisation.
      </p>
      <h2>Données personnelles</h2>
      <p>Voir la <a href="#/confidentialite">politique de confidentialité</a>.</p>
    </>
  );
}

function Privacy() {
  return (
    <>
      <h1>Politique de confidentialité</h1>
      <h2>1. Qui est responsable de vos données ?</h2>
      <p>
        Pour les données de votre compte (identifiants, journaux de sécurité), le responsable de traitement est{" "}
        {LEGAL.companyName} (contact : {LEGAL.contactEmail}).
      </p>
      <p>
        Pour les données de prospects et de clients que votre organisation saisit dans le CRM, c'est votre organisation
        qui est responsable de traitement ; {LEGAL.productName} agit alors comme sous-traitant (article 28 du RGPD).
        [À COMPLÉTER : contrat de sous-traitance à signer avec chaque client.]
      </p>
      <h2>2. Quelles données traitons-nous ?</h2>
      <ul>
        <li>Compte : nom, adresse email, mot de passe (conservé sous forme hachée), rôle et organisation.</li>
        <li>Données du CRM saisies par votre organisation : contacts, entreprises, opportunités, tâches, activités.</li>
        <li>Journal technique : historique des automatisations et des actions du CRM.</li>
      </ul>
      <h2>3. Pourquoi, et sur quelle base légale ?</h2>
      <ul>
        <li>Fournir le service et gérer votre compte : exécution du contrat (article 6.1.b).</li>
        <li>Sécuriser le service et prévenir les abus : intérêt légitime (article 6.1.f).</li>
        <li>Respecter nos obligations légales (article 6.1.c).</li>
      </ul>
      <h2>4. Qui reçoit les données ?</h2>
      <p>
        Les membres de votre organisation, selon leur rôle, et nos prestataires techniques : Supabase (base de données
        et authentification, région Union européenne) et Netlify (hébergement de l'application). Nous ne vendons
        aucune donnée. [À VÉRIFIER : contrats de sous-traitance et garanties applicables à chaque prestataire, y
        compris en cas de transfert hors Union européenne.]
      </p>
      <h2>5. Combien de temps ?</h2>
      <p>
        Les données du compte et du CRM sont conservées pendant la durée du contrat, puis pendant {LEGAL.accountRetention}.
        Un propriétaire ou administrateur peut supprimer un contact à tout moment depuis l'application.
      </p>
      <h2>6. Vos droits</h2>
      <p>
        Vous disposez des droits d'accès, de rectification, d'effacement, de limitation, d'opposition et de
        portabilité. Un propriétaire ou administrateur peut exporter les données de l'organisation (format JSON) depuis
        Paramètres. Pour toute demande : {LEGAL.contactEmail}. Vous pouvez aussi introduire une réclamation auprès de
        la CNIL (www.cnil.fr).
      </p>
      <h2>7. Cookies et stockage local</h2>
      <p>
        L'application n'utilise ni cookie publicitaire, ni outil de mesure d'audience, ni police chargée depuis un
        service tiers. Votre navigateur conserve uniquement la session de connexion, strictement nécessaire au
        fonctionnement du service : aucun consentement n'est requis pour ce stockage.
      </p>
      <h2>8. Sécurité</h2>
      <p>
        Les échanges sont chiffrés (HTTPS). Les données sont cloisonnées par organisation au niveau de la base de
        données et les accès dépendent du rôle de chaque utilisateur.
      </p>
      <h2>9. Modifications</h2>
      <p>Cette politique peut évoluer ; la date de dernière mise à jour figure en bas de page.</p>
    </>
  );
}
