import type { ReactNode } from "react";
import { LEGAL, legalIncomplete } from "../legal.config";
import { loc, t, useLang } from "../i18n";
import { LangSwitch } from "./LangSwitch";

export type LegalKind = "mentions" | "privacy";

const L = LEGAL;
const retention = () => {
  if (L.retentionMonths === null) return t("[A COMPLETAR · número de meses]");
  return t("{n} mois", { n: L.retentionMonths });
};

function Draft() {
  if (!legalIncomplete) return null;
  return (
    <div className="form-error" role="note">
      {t("Document provisoire : les informations entre crochets doivent être complétées, et le texte validé par un professionnel du droit, avant toute mise en service commerciale.")}
    </div>
  );
}

export function LegalPage({ kind }: { kind: LegalKind }) {
  const lang = useLang();
  const updated = new Date(L.lastUpdate + "T12:00:00").toLocaleDateString(loc(), { day: "numeric", month: "long", year: "numeric" });
  const pages: Record<string, { mentions: () => ReactNode; privacy: () => ReactNode }> = {
    es: { mentions: AvisoLegal, privacy: Privacidad },
    fr: { mentions: Mentions, privacy: Confidentialite },
    en: { mentions: LegalNotice, privacy: PrivacyPolicy }
  };
  const P = pages[lang] ?? pages.es;
  return (
    <div className="legal-screen">
      <article className="legal">
        <div className="legal-top">
          <a className="text-btn" href="#/">← {t("Retour à l'application")}</a>
          <LangSwitch />
        </div>
        <Draft />
        {kind === "mentions" ? P.mentions() : P.privacy()}
        <p className="muted">{t("Dernière mise à jour : {date}", { date: updated })}</p>
        <nav className="legal-links">
          <a href="#/mentions-legales">{t("Mentions légales")}</a> · <a href="#/confidentialite">{t("Politique de confidentialité")}</a>
        </nav>
      </article>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Español (España : LSSI-CE, RGPD, LOPDGDD)
// ---------------------------------------------------------------------------
function AvisoLegal() {
  return (
    <>
      <h1>Aviso legal</h1>
      <h2>Titular del servicio</h2>
      <p>
        En cumplimiento del artículo 10 de la Ley 34/2002, de servicios de la sociedad de la información (LSSI-CE),
        se informa de que {L.productName} es un servicio de {L.companyName}, {L.legalForm}, con NIF {L.taxId} y
        domicilio social en {L.address}. Inscrita en el {L.registration}.
      </p>
      <p>Contacto: {L.contactEmail}.</p>
      <h2>Alojamiento</h2>
      <p>
        La aplicación web está alojada por Netlify, Inc. Las cuentas y los datos del CRM se almacenan en Supabase, en
        una región de la Unión Europea (París). [A VERIFICAR: datos de contacto de los proveedores.]
      </p>
      <h2>Propiedad intelectual</h2>
      <p>
        La aplicación, su interfaz, sus textos y su código están protegidos. Queda prohibida su reproducción sin
        autorización. Los datos introducidos por los usuarios pertenecen a su organización.
      </p>
      <h2>Protección de datos</h2>
      <p>Consulte la <a href="#/confidentialite">política de privacidad</a>.</p>
    </>
  );
}

function Privacidad() {
  return (
    <>
      <h1>Política de privacidad</h1>
      <h2>1. Responsable del tratamiento</h2>
      <p>
        Para los datos de su cuenta (identificación, registros de seguridad), el responsable es {L.companyName}
        (NIF {L.taxId}, contacto: {L.contactEmail}).
      </p>
      <p>
        Para los datos de clientes, contactos y correos que su organización gestiona en el CRM, el responsable es su
        organización; {L.productName} actúa como encargado del tratamiento (artículo 28 del RGPD).
        [A COMPLETAR: contrato de encargo del tratamiento con cada cliente.]
      </p>
      <h2>2. Datos que tratamos</h2>
      <ul>
        <li>Cuenta: nombre, email, contraseña (guardada cifrada mediante hash), rol y organización.</li>
        <li>Datos del CRM: contactos, empresas, oportunidades, tareas, citas, facturas y actividad.</li>
        <li>Correos recibidos en los buzones conectados por su organización, con sus adjuntos.</li>
        <li>Registros técnicos: historial de automatizaciones y de acciones en el CRM.</li>
      </ul>
      <h2>3. Finalidades y base jurídica</h2>
      <ul>
        <li>Prestar el servicio y gestionar su cuenta: ejecución del contrato (art. 6.1.b RGPD).</li>
        <li>Clasificar los correos recibidos y proponer acciones en el CRM, siempre revisables por una persona: ejecución del contrato con su organización.</li>
        <li>Seguridad del servicio y prevención de abusos: interés legítimo (art. 6.1.f RGPD).</li>
        <li>Cumplimiento de obligaciones legales (art. 6.1.c RGPD).</li>
      </ul>
      <h2>4. Destinatarios</h2>
      <p>
        Los miembros de su organización, según su rol, y nuestros proveedores técnicos: Supabase (base de datos y
        autenticación, región UE), Netlify (alojamiento de la aplicación), Make (automatizaciones) y {L.aiProvider}
        (clasificación de correos). No vendemos datos. [A VERIFICAR: contratos de encargo y garantías de cada
        proveedor, incluidas las transferencias fuera del Espacio Económico Europeo.]
      </p>
      <h2>5. Conservación</h2>
      <p>
        Los datos se conservan mientras dure el contrato y después durante {retention()}. Los correos y adjuntos se
        eliminan automáticamente al terminar el plazo configurado por su organización. Un propietario o administrador
        puede eliminar un contacto en cualquier momento.
      </p>
      <h2>6. Sus derechos</h2>
      <p>
        Puede ejercer sus derechos de acceso, rectificación, supresión, limitación, oposición y portabilidad
        escribiendo a {L.contactEmail}. Un propietario o administrador puede exportar los datos de la organización desde
        Ajustes. Si considera que no se han respetado sus derechos, puede reclamar ante la Agencia Española de
        Protección de Datos (www.aepd.es).
      </p>
      <h2>7. Cookies y almacenamiento local</h2>
      <p>
        La aplicación no usa cookies publicitarias, herramientas de medición de audiencia ni fuentes de servicios de
        terceros. El navegador solo guarda la sesión y el idioma elegido, imprescindibles para el funcionamiento: no
        requieren consentimiento.
      </p>
      <h2>8. Seguridad</h2>
      <p>
        Las comunicaciones están cifradas (HTTPS). Los datos están separados por organización en la propia base de
        datos y el acceso depende del rol de cada usuario.
      </p>
      <h2>9. Cambios</h2>
      <p>Esta política puede cambiar; la fecha de la última actualización figura al final de la página.</p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Français
// ---------------------------------------------------------------------------
function Mentions() {
  return (
    <>
      <h1>Mentions légales</h1>
      <h2>Éditeur du service</h2>
      <p>
        {L.productName} est un service de {L.companyName}, {L.legalForm}, société de droit espagnol, NIF {L.taxId},
        dont le siège social est situé {L.address}. Immatriculation : {L.registration}.
      </p>
      <p>Contact : {L.contactEmail}.</p>
      <h2>Hébergement</h2>
      <p>
        L'application web est hébergée par Netlify, Inc. Les comptes et les données du CRM sont stockés par Supabase
        dans une région de l'Union européenne (Paris). [À VÉRIFIER : coordonnées des hébergeurs.]
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

function Confidentialite() {
  return (
    <>
      <h1>Politique de confidentialité</h1>
      <h2>1. Responsable du traitement</h2>
      <p>
        Pour les données de votre compte (identifiants, journaux de sécurité), le responsable de traitement est{" "}
        {L.companyName} (NIF {L.taxId}, contact : {L.contactEmail}).
      </p>
      <p>
        Pour les données de clients, de contacts et d'emails que votre organisation gère dans le CRM, c'est votre
        organisation qui est responsable de traitement ; {L.productName} agit comme sous-traitant (article 28 du RGPD).
        [À COMPLÉTER : contrat de sous-traitance à signer avec chaque client.]
      </p>
      <h2>2. Données traitées</h2>
      <ul>
        <li>Compte : nom, adresse email, mot de passe (conservé sous forme hachée), rôle et organisation.</li>
        <li>Données du CRM : contacts, entreprises, opportunités, tâches, rendez-vous, factures et activité.</li>
        <li>Emails reçus dans les boîtes connectées par votre organisation, avec leurs pièces jointes.</li>
        <li>Journal technique : historique des automatisations et des actions du CRM.</li>
      </ul>
      <h2>3. Finalités et base légale</h2>
      <ul>
        <li>Fournir le service et gérer votre compte : exécution du contrat (article 6.1.b).</li>
        <li>Classer les emails reçus et proposer des actions dans le CRM, toujours vérifiables par une personne : exécution du contrat avec votre organisation.</li>
        <li>Sécuriser le service et prévenir les abus : intérêt légitime (article 6.1.f).</li>
        <li>Respecter nos obligations légales (article 6.1.c).</li>
      </ul>
      <h2>4. Destinataires</h2>
      <p>
        Les membres de votre organisation, selon leur rôle, et nos prestataires techniques : Supabase (base de données
        et authentification, région UE), Netlify (hébergement), Make (automatisations) et {L.aiProvider}
        (classification des emails). Nous ne vendons aucune donnée. [À VÉRIFIER : contrats et garanties de chaque
        prestataire, y compris en cas de transfert hors de l'Espace économique européen.]
      </p>
      <h2>5. Durée de conservation</h2>
      <p>
        Les données sont conservées pendant la durée du contrat, puis pendant {retention()}. Les emails et pièces jointes
        sont supprimés automatiquement à la fin de la durée fixée par votre organisation. Un propriétaire ou
        administrateur peut supprimer un contact à tout moment.
      </p>
      <h2>6. Vos droits</h2>
      <p>
        Vous disposez des droits d'accès, de rectification, d'effacement, de limitation, d'opposition et de
        portabilité : écrivez à {L.contactEmail}. Un propriétaire ou administrateur peut exporter les données de
        l'organisation depuis Paramètres. Vous pouvez introduire une réclamation auprès de l'autorité espagnole (AEPD,
        www.aepd.es) ou de l'autorité de votre pays, par exemple la CNIL (www.cnil.fr).
      </p>
      <h2>7. Cookies et stockage local</h2>
      <p>
        L'application n'utilise ni cookie publicitaire, ni outil de mesure d'audience, ni police chargée depuis un
        service tiers. Le navigateur conserve uniquement la session et la langue choisie, strictement nécessaires :
        aucun consentement n'est requis.
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

// ---------------------------------------------------------------------------
// English
// ---------------------------------------------------------------------------
function LegalNotice() {
  return (
    <>
      <h1>Legal notice</h1>
      <h2>Service provider</h2>
      <p>
        {L.productName} is a service of {L.companyName}, {L.legalForm}, a company incorporated in Spain, tax ID (NIF)
        {" "}{L.taxId}, registered office at {L.address}. Registration: {L.registration}.
      </p>
      <p>Contact: {L.contactEmail}.</p>
      <h2>Hosting</h2>
      <p>
        The web application is hosted by Netlify, Inc. Accounts and CRM data are stored by Supabase in a European Union
        region (Paris). [TO VERIFY: hosting providers' contact details.]
      </p>
      <h2>Intellectual property</h2>
      <p>
        The application, its interface, texts and code are protected. Unauthorised reproduction is prohibited. Data
        entered by users remains the property of their organisation.
      </p>
      <h2>Personal data</h2>
      <p>See the <a href="#/confidentialite">privacy policy</a>.</p>
    </>
  );
}

function PrivacyPolicy() {
  return (
    <>
      <h1>Privacy policy</h1>
      <h2>1. Data controller</h2>
      <p>
        For your account data (login details, security logs), the controller is {L.companyName} (tax ID {L.taxId},
        contact: {L.contactEmail}).
      </p>
      <p>
        For the customer, contact and email data your organisation manages in the CRM, your organisation is the
        controller; {L.productName} acts as a processor (Article 28 GDPR). [TO COMPLETE: data processing agreement
        with each customer.]
      </p>
      <h2>2. Data we process</h2>
      <ul>
        <li>Account: name, email address, password (stored as a hash), role and organisation.</li>
        <li>CRM data: contacts, companies, opportunities, tasks, appointments, invoices and activity.</li>
        <li>Emails received in the mailboxes your organisation connects, with their attachments.</li>
        <li>Technical logs: history of automations and CRM actions.</li>
      </ul>
      <h2>3. Purposes and legal basis</h2>
      <ul>
        <li>Providing the service and managing your account: performance of a contract (Art. 6(1)(b)).</li>
        <li>Classifying incoming emails and suggesting CRM actions, always open to human review: performance of the contract with your organisation.</li>
        <li>Securing the service and preventing abuse: legitimate interest (Art. 6(1)(f)).</li>
        <li>Complying with legal obligations (Art. 6(1)(c)).</li>
      </ul>
      <h2>4. Recipients</h2>
      <p>
        Members of your organisation, according to their role, and our technical providers: Supabase (database and
        authentication, EU region), Netlify (hosting), Make (automations) and {L.aiProvider} (email classification).
        We never sell data. [TO VERIFY: agreements and safeguards for each provider, including transfers outside the
        European Economic Area.]
      </p>
      <h2>5. Retention</h2>
      <p>
        Data is kept for the duration of the contract and then for {retention()}. Emails and attachments are deleted
        automatically at the end of the period set by your organisation. An owner or administrator can delete a contact
        at any time.
      </p>
      <h2>6. Your rights</h2>
      <p>
        You have the rights of access, rectification, erasure, restriction, objection and portability: write to
        {" "}{L.contactEmail}. An owner or administrator can export the organisation's data from Settings. You can lodge a
        complaint with the Spanish Data Protection Agency (AEPD, www.aepd.es) or with the authority of your country.
      </p>
      <h2>7. Cookies and local storage</h2>
      <p>
        The application uses no advertising cookies, no audience measurement and no fonts loaded from third parties.
        Your browser only stores the login session and your chosen language, which are strictly necessary: no consent
        is required.
      </p>
      <h2>8. Security</h2>
      <p>
        Connections are encrypted (HTTPS). Data is separated by organisation within the database, and access depends on
        each user's role.
      </p>
      <h2>9. Changes</h2>
      <p>This policy may change; the date of the last update is shown at the bottom of the page.</p>
    </>
  );
}

