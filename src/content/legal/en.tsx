import type { LegalContent } from "./types";

// TODO(legal): completar los datos del titular antes de abrir al público y revisar con asesoría legal.
// La versión en español es la que prevalece en caso de discrepancia.
const OWNER = "[TODO: owner's name or company name]";
const OWNER_ID = "[TODO: tax ID (NIF/CIF)]";
const OWNER_ADDRESS = "[TODO: address]";
const CONTACT_EMAIL = "[TODO: contact email]";

const en: LegalContent = {
  lastUpdated: "2026-11-07",
  privacy: (
    <>
      <p>
        This policy explains what personal data wine-app processes, why, and what your rights are,
        under the General Data Protection Regulation (GDPR) and Spanish Organic Law 3/2018 (LOPDGDD).
        The Spanish version prevails in case of discrepancy.
      </p>
      <h2>Data controller</h2>
      <ul>
        <li>Owner: {OWNER}</li>
        <li>Tax ID: {OWNER_ID}</li>
        <li>Address: {OWNER_ADDRESS}</li>
        <li>Contact: {CONTACT_EMAIL}</li>
      </ul>
      <h2>What data we process</h2>
      <ul>
        <li>Account data: email and password (stored hashed, never in plain text).</li>
        <li>Your statement that you are over 18, on entry and at sign-up. We don&apos;t ask for your date of birth.</li>
        <li>Preferences: language, theme and any wine preferences you choose to share.</li>
        <li>Personal content: favourites, notes, lists, tasting journal and cellar.</li>
        <li>Minimal technical data needed to keep the service secure (for example, access logs).</li>
      </ul>
      <h2>Why, and on what legal basis</h2>
      <ul>
        <li>Providing the service and managing your account: performance of a contract (Art. 6.1.b GDPR).</li>
        <li>Keeping the service secure and preventing abuse: legitimate interest (Art. 6.1.f GDPR).</li>
        <li>Complying with legal obligations, such as restricting access by minors: legal obligation (Art. 6.1.c GDPR).</li>
      </ul>
      <p>We don&apos;t sell your data or use it for personalised advertising.</p>
      <h2>How long we keep it</h2>
      <p>
        We keep your data while your account is active. If you delete it, we erase your personal data,
        except for anything we are legally required to keep, for the required period.
      </p>
      <h2>Processors</h2>
      <ul>
        <li>Supabase (database and authentication), with data hosted in the European Union.</li>
        <li>
          Vercel (web hosting). It may process technical data outside the European Economic Area under
          appropriate safeguards (European Commission standard contractual clauses).
        </li>
      </ul>
      <h2>Your rights</h2>
      <p>
        You can exercise your rights of access, rectification, erasure, objection, restriction and
        portability by writing to {CONTACT_EMAIL}. You will also be able to export and delete your
        account from your settings. If you think we haven&apos;t handled your request properly, you can
        complain to the Spanish Data Protection Agency (
        <a href="https://www.aepd.es" rel="noopener noreferrer">aepd.es</a>).
      </p>
      <h2>Minors</h2>
      <p>wine-app is intended exclusively for people aged 18 and over.</p>
    </>
  ),
  cookies: (
    <>
      <p>
        wine-app only uses technical cookies, which are essential for the site to work or to remember
        choices you make. We don&apos;t use analytics, advertising or third-party cookies. Under Article
        22.2 of Spanish Law 34/2002 (LSSI) and the Spanish Data Protection Agency&apos;s guidance, they
        don&apos;t require your consent, but we let you know about them.
      </p>
      <h2>Cookies we use</h2>
      <table>
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Purpose</th>
            <th scope="col">Duration</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>sb-…-auth-token</code></td>
            <td>Keeping you securely signed in (Supabase).</td>
            <td>Until you sign out or the session expires</td>
          </tr>
          <tr>
            <td><code>age_ok</code></td>
            <td>Remembering that you confirmed you are over 18.</td>
            <td>1 year</td>
          </tr>
          <tr>
            <td><code>NEXT_LOCALE</code></td>
            <td>Remembering the language you chose.</td>
            <td>1 year</td>
          </tr>
          <tr>
            <td><code>theme</code></td>
            <td>Remembering your theme (light, dark or system).</td>
            <td>1 year</td>
          </tr>
        </tbody>
      </table>
      <p>All of them are first-party cookies and are not used to track you on other websites.</p>
      <h2>How to remove them</h2>
      <p>
        You can delete or block cookies in your browser settings. If you block technical cookies, you
        may not be able to sign in, or the site may ask for your age on every visit.
      </p>
      <p>If we ever use other kinds of cookies, we will ask for your permission first and update this policy.</p>
    </>
  ),
  legalNotice: (
    <>
      <h2>Owner details</h2>
      <p>
        In accordance with Article 10 of Spanish Law 34/2002 on information society services and
        electronic commerce (LSSI), this website belongs to:
      </p>
      <ul>
        <li>Owner: {OWNER}</li>
        <li>Tax ID: {OWNER_ID}</li>
        <li>Address: {OWNER_ADDRESS}</li>
        <li>Email: {CONTACT_EMAIL}</li>
        <li>[TODO: company registration details, if applicable]</li>
      </ul>
      <h2>Purpose</h2>
      <p>
        wine-app is an information service for discovering Spanish wines and wineries. It doesn&apos;t
        sell wine or handle bookings or payments: links to shops and wineries lead to third-party sites.
      </p>
      <h2>Terms of use</h2>
      <p>
        Access is restricted to people aged 18 and over. During the private phase, sign-up is by
        invitation only. You agree to use the service lawfully and not to try to access other
        people&apos;s data.
      </p>
      <h2>Prices and product information</h2>
      <p>
        Prices, availability and wine and winery details come from public sources and may be out of
        date. The valid price is always the one shown by the shop at the time of purchase.
      </p>
      <h2>Intellectual property</h2>
      <p>
        The design and code of wine-app belong to its owner. Trademarks, trade names and images of
        wines, wineries and shops belong to their respective owners and are shown for information only.
      </p>
      <h2>Liability and links</h2>
      <p>
        We are not responsible for the content of linked third-party websites. If you spot an incorrect
        link or detail, write to us at {CONTACT_EMAIL}.
      </p>
      <h2>Responsible drinking</h2>
      <p>Enjoy wine responsibly. The sale and consumption of alcohol by anyone under 18 is prohibited.</p>
      <h2>Governing law</h2>
      <p>These terms are governed by Spanish law.</p>
    </>
  ),
};

export default en;
