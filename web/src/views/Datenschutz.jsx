// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: MIT
import { t } from '../i18n/index.js';
// Privacy policy, written against what the app actually does. Two things are
// easy to get wrong here and were verified against the code rather than
// assumed: the fonts are self-hosted (web/src/fonts), and
// six places render favicons through google.com/s2/favicons, which sends the
// visitor's IP to Google on every page that shows them.
//
// Push: browsers deliver through their vendor's push service (api/push.php,
// Web Push via VAPID); the app through APNs and FCM.
//
// The Raidex Keys section is written against api/keys.php, api/blizzard.php and
// the tables in db_schema_statements() -- keystones, account_characters,
// key_routes, key_connects -- not against what the app's own pages promise.
// Every retention figure here has a line of code behind it: the connect TTL,
// the weekly reset a keystone expires at, and the cache lifetimes in api/.cache.
// The app's own requests: raidex-keys desktop/src.
export default function Datenschutz() {
  const Section = ({ title, children }) => (
    <div style={{ marginTop: 22 }}>
      <p className="section-title">{title}</p>
      <div style={{ lineHeight: 1.7 }}>{children}</div>
    </div>
  );
  return (
    <div style={{ maxWidth: 720 }}>
      <h1 className="page-title" style={{ marginBottom: 20 }}>{t('legal.privacy')}</h1>
      <div className="card card-pad" lang="de">
        <Section title="Verantwortlicher">
          <p>
            Lars Gossard, incūdex (Marke lasse tech), Schleifmühlstraße 22, 91456 Diespeck<br />
            E-Mail: <a href="mailto:lars@lasse-tech.de">lars@lasse-tech.de</a>
          </p>
        </Section>

        <Section title="Welche Daten wir verarbeiten">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>Beim Login über Battle.net: deine <b>BattleTag</b> und eine Konto-Kennung (OAuth-„sub").</li>
            <li>Öffentliche <b>WoW-Charakter- und Gildendaten</b> (Name, Klasse, Stufe, Erfolge, M+-Rating, Gilde, Fraktion), abgerufen über die offizielle Blizzard-API.</li>
            <li>Von dir erstellte Inhalte: Raidtermine und Anmeldungen.</li>
            <li>Ein technisch notwendiges <b>Sitzungs-Cookie</b>, um dich eingeloggt zu halten.</li>
            <li>Wenn du Benachrichtigungen erlaubst: das <b>Push-Abonnement</b> deines Browsers (Adresse beim Push-Dienst des Browserherstellers und die zugehörigen Schlüssel) bzw. das <b>Geräte-Token</b> der App, dazu die Sprache des Geräts für den Text der Benachrichtigung.</li>
            <li>Wenn du die Desktop-App <b>Raidex Keys</b> mit deinem Konto verbindest: die Daten aus dem nächsten Abschnitt.</li>
          </ul>
        </Section>

        <Section title="Raidex Keys (Desktop-App)">
          <p>Die Desktop-App gibt wie Raidex selbst incūdex unter der Marke lasse tech heraus, auch im Microsoft Store. Verantwortlicher ist der oben genannte.</p>
          <p>Raidex Keys liest auf deinem Rechner die Datei, die unser WoW-Addon beim Ausloggen schreibt. Ohne Verbindung zu einem Raidex-Konto bleibt davon alles auf deinem Rechner. Verbindest du die App mit deinem Konto, überträgt sie an unseren Server:</p>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            <li><b>Beim Verbinden:</b> einen Gerätecode der App, den wir nur als Hash speichern, den achtstelligen Code, den du auf unserer Website bestätigst, und deine <b>IP-Adresse</b> als Bremse gegen massenhaftes Anfragen. Nach deiner Bestätigung holt sich die App eine eigene Sitzung — dieselbe Art Sitzung wie im Browser. Dein Battle.net-Passwort bekommt die App nie zu sehen.</li>
            <li><b>Keystones deiner eigenen Charaktere:</b> Name und Realm, Dungeon und Stufe des Keys, M+-Wertung und der Zeitpunkt, zu dem das Addon das gesehen hat. Als deine nehmen wir nur Charaktere an, die zu deinem Battle.net-Konto gehören.</li>
            <li><b>Keystones von Gildenmitgliedern</b>, die dein Addon im Spiel gehört hat — dieselben Angaben, dazu, wer sie gemeldet hat. Angenommen werden sie nur für Charaktere aus dem Roster einer Gilde, in der du selbst bist.</li>
            <li><b>Die Charakterliste deines Battle.net-Kontos</b> — nur Name und Realm in Kleinschreibung, abgerufen über die Blizzard-API. Sie dient allein der Prüfung, welche gemeldeten Keys wirklich deine sind.</li>
            <li><b>Gespeicherte MDT-Routen:</b> der Austausch-String, den du in der App einfügst, dazu Dungeon, Name der Route, Anzahl der Pulls, gegnerische Kräfte und ob die Route nur dir oder deiner Gilde gehört. Routen aus deinem Spiel gehen nicht von selbst mit. Ein MDT-String enthält außerdem Name, Realm und Klasse des Charakters, der die Route exportiert hat. Die App entfernt diese Angaben vor dem Speichern; ältere Versionen haben sie mitgeschickt.</li>
            <li><b>Für den Gruppenplaner:</b> Name und Realm des Mitglieds, dessen Läufe gewogen werden sollen. Unser Server holt dazu dessen öffentliche Profildaten bei Blizzard — beste Läufe der laufenden Saison, Spezialisierung, Rolle, Gegenstandsstufe — und legt sie kurz in einem Zwischenspeicher ab.</li>
          </ul>
          <p>Unabhängig von einem Raidex-Konto baut die App selbst diese Verbindungen auf:</p>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            <li><b>Versionsprüfung:</b> Bei jedem Start fragt die App auf raidex.app, ob es eine neuere Version gibt, und bei GitHub (GitHub, Inc., ein Unternehmen von Microsoft), ob es ein neueres Addon gibt. Dabei gehen nur deine IP-Adresse und die Kennung der App mit, keine Konto- oder Spieldaten.</li>
            <li><b>Bilder:</b> Bilder der Dungeons und Raids lädt die App von Blizzards Servern und legt sie auf deinem Rechner ab. Dabei erhält Blizzard deine IP-Adresse.</li>
            <li><b>Links</b> zu Wowhead, Raider.IO, CurseForge oder dieser Website öffnet die App in deinem Browser; dort gelten die Datenschutzerklärungen der jeweiligen Seiten.</li>
          </ul>
          <p>Die Gildentafel zeigt ausschließlich Charaktere aus dem Roster deiner aktiven Gilde; Keys anderer Gilden bekommst du nicht zu sehen und deine nicht sie. Eine gespeicherte Route sieht nur ihr Besitzer oder, wenn er sie teilt, die Gilde, die dabei aktiv war — jederzeit von ihm umstellbar oder löschbar. Die Profildaten des Gruppenplaners geben wir nur für deine eigenen Charaktere und für Mitglieder deiner Gilden heraus.</p>
          <p>Meldet sich die App ab, löschen wir ihre Sitzung. Routen kannst du in der App einzeln löschen; für alles Weitere genügt eine Nachricht an <a href="mailto:lars@lasse-tech.de">lars@lasse-tech.de</a>. Welche Dateien die App auf deinem Rechner liest und schreibt, steht auf <a href="https://raidex.app/keys/daten/">Raidex Keys — deine Daten</a>.</p>
        </Section>

        <Section title="Zwecke & Rechtsgrundlage">
          <p>Die Verarbeitung dient dem Betrieb der Gilden-App (Roster, Raidkalender, Profil). Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Vertrag/Nutzung) bzw. lit. f (berechtigtes Interesse am Betrieb).</p>
        </Section>

        <Section title="Empfänger / Drittanbieter">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><b>Blizzard Entertainment</b> — Battle.net-Login und Spieldaten-API. Beim Login wirst du auf Battle.net weitergeleitet; zusätzlich gilt deren Datenschutzerklärung. Charakterbilder werden von Blizzard-Servern geladen. Für Raidex Keys fragt unser Server dort zusätzlich die Charakterliste deines Kontos und die öffentlichen Profildaten angefragter Charaktere ab; diese Abfragen stellt der Server, deine IP-Adresse geht dabei nicht mit.</li>
            <li><b>Google Ireland Ltd.</b> — kleine Website-Symbole (Favicon-Dienst) werden von Google-Servern geladen. Dabei wird deine IP-Adresse an Google übertragen. Die Schriftarten liefert unser eigener Server aus.</li>
            <li><b>Push-Dienste</b> — nur wenn du Benachrichtigungen erlaubst: Unser Server übergibt Titel und Text einer Benachrichtigung an den Push-Dienst deines Browsers (bei Chrome und Edge Google bzw. Microsoft, bei Firefox Mozilla, bei Safari Apple) bzw. in der App an Apple Push Notification service (Apple Inc.) oder Firebase Cloud Messaging (Google Ireland Ltd.). Der Dienst stellt sie an dein Gerät zu.</li>
            <li><b>Microsoft</b> — nur wenn du Raidex Keys aus dem Microsoft Store installierst: Für Installation und Updates gilt die Datenschutzerklärung von Microsoft.</li>
            <li><b>IONOS SE</b> — das Hosting erfolgt auf einem Server in Deutschland.</li>
            <li><b>Discord</b> — nur wenn deine Gilde einen Webhook hinterlegt hat: Raid-Ankündigungen werden dann von unserem Server an Discord gesendet. Deine IP-Adresse wird dabei nicht übermittelt.</li>
          </ul>
        </Section>

        <Section title="Speicherdauer">
          <p>Sitzungs-Cookies bis zu 30 Tage. Konto- und Charakterdaten werden gespeichert, solange du die App nutzt; auf Anfrage löschen wir dein Konto. Ein Push-Abonnement oder Geräte-Token löschen wir, sobald der Push-Dienst es als ungültig meldet, spätestens mit deinem Konto.</p>
          <p style={{ marginBottom: 0 }}>Für Raidex Keys im Einzelnen: Ein Verbindungscode verfällt nach 10 Minuten und wird gelöscht, sobald die App ihn abgeholt hat, spätestens beim nächsten Aufräumen. Die Sitzung der App läuft wie die im Browser nach 30 Tagen ab. Ein gemeldeter Keystone gilt bis zum wöchentlichen Reset nach der Beobachtung; danach liefern wir ihn nicht mehr aus, und die Zeile bleibt nur so lange stehen, bis die nächste Meldung desselben Charakters sie überschreibt. Meldungen, die älter als acht Tage sind, nehmen wir gar nicht erst an. Die Charakterliste deines Battle.net-Kontos wird bei jedem Abruf ersetzt, frühestens 24 Stunden nach dem letzten. Routen bleiben, bis du sie löschst. Die von Blizzard geholten Profildaten liegen in einem Zwischenspeicher auf dem Server: Mythic+-Profile 10 Minuten, die laufende Saison 6 Stunden, die Symbole der Spezialisierungen 30 Tage.</p>
        </Section>

        <Section title="Deine Rechte">
          <p>Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerspruch sowie ein Beschwerderecht bei einer Aufsichtsbehörde. Kontakt: <a href="mailto:lars@lasse-tech.de">lars@lasse-tech.de</a>.</p>
        </Section>
      </div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 14 }}>
        © 2026 lasse tech, Lars Gossard
      </p>
    </div>
  );
}
