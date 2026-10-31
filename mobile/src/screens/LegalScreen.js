// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: AGPL-3.0-or-later
import { ScrollView, View, Text } from 'react-native';
import { useTheme } from '../theme.js';
import { SectionTitle, BottomSheet } from '../ui.js';
import { t as tr } from '../i18n/index.js';

// Privacy text checked against the code: fonts are bundled (@expo-google-fonts),
// guide favicons come from google.com/s2/favicons (CalendarScreen), push goes
// through APNs/FCM (api/push.php), images from Blizzard's render servers.

const IMPRESSUM = [
  ['Angaben gemäß § 5 DDG', 'Lars Gossard\nincūdex · Marke lasse tech\nSchleifmühlstraße 22\n91456 Diespeck\nDeutschland'],
  ['Kontakt', 'E-Mail: lars@lasse-tech.de\nTelefon: +49 1523 3504688\nWeb: www.lasse-tech.de'],
  ['Verantwortlich für den Inhalt (§ 18 Abs. 2 MStV)', 'Lars Gossard, Anschrift wie oben'],
  ['Haftungshinweis', 'Raidex ist ein inoffizielles Fan-Projekt und steht in keiner Verbindung zu Blizzard Entertainment. World of Warcraft und Battle.net sind Marken von Blizzard Entertainment, Inc.'],
];
const DATENSCHUTZ = [
  ['Verantwortlicher', 'Lars Gossard, incūdex (Marke lasse tech), Schleifmühlstraße 22, 91456 Diespeck\nE-Mail: lars@lasse-tech.de'],
  ['Welche Daten wir verarbeiten', '• BattleTag + Konto-Kennung beim Battle.net-Login\n• Öffentliche WoW-Charakter- & Gildendaten (Blizzard-API)\n• Von dir erstellte Raidtermine & Anmeldungen\n• Technisch notwendige Sitzungskennung, im sicheren Speicher des Geräts abgelegt\n• Wenn du Benachrichtigungen erlaubst: das Geräte-Token für Push-Nachrichten und die Sprache des Geräts'],
  ['Zwecke & Rechtsgrundlage', 'Betrieb der Gilden-App. Art. 6 Abs. 1 lit. b DSGVO (Nutzung) bzw. lit. f (berechtigtes Interesse).'],
  ['Empfänger / Drittanbieter', '• Blizzard Entertainment: Battle.net-Login, Spieldaten-API; Charakter- und Dungeonbilder werden von Blizzard-Servern geladen (deine IP-Adresse geht dabei an Blizzard).\n• Google Ireland Ltd.: kleine Website-Symbole in den Guides werden über den Favicon-Dienst von Google geladen (deine IP-Adresse geht dabei an Google).\n• Push-Nachrichten, nur wenn du sie erlaubst: Titel und Text gehen von unserem Server an Apple Push Notification service (Apple Inc.) bzw. Firebase Cloud Messaging (Google Ireland Ltd.), die sie an dein Gerät zustellen.\n• Discord: nur wenn deine Gilde einen Webhook hinterlegt hat; Raid-Ankündigungen sendet unser Server, ohne deine IP-Adresse.\n• Hosting bei IONOS SE auf einem Server in Deutschland.\nSchriftarten sind in der App enthalten und werden nicht nachgeladen.'],
  ['Speicherdauer', 'Sitzungen bis 30 Tage. Konto-/Charakterdaten bis zur Kontolöschung. Geräte-Token, bis der Push-Dienst es als ungültig meldet, spätestens bis zur Kontolöschung.'],
  ['Deine Rechte', 'Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit, Widerspruch, Beschwerde bei einer Aufsichtsbehörde. Kontakt: lars@lasse-tech.de.'],
];

export default function LegalModal({ type, onClose }) {
  const t = useTheme();
  const data = type === 'impressum' ? IMPRESSUM : DATENSCHUTZ;
  // The legal text itself stays German and authoritative; only the title follows the UI language.
  const title = type === 'impressum' ? tr('legal.imprint') : tr('legal.privacy');
  return (
    <BottomSheet onClose={onClose}>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 34 }}>
        <Text style={{ color: t.text, fontFamily: t.display, fontSize: 20, letterSpacing: 0.5, marginBottom: 14 }}>{title.toUpperCase()}</Text>
        {data.map(([h, body]) => (
          <View key={h} style={{ marginBottom: 18 }}>
            <SectionTitle>{h}</SectionTitle>
            <Text style={{ color: t.textDim, fontFamily: t.body, fontSize: 14, lineHeight: 22 }}>{body}</Text>
          </View>
        ))}
      </ScrollView>
    </BottomSheet>
  );
}
