// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: MIT
import { t } from '../i18n/index.js';
// Legal notice. The German statutes were renamed: the TMG was replaced by the
// DDG in 2024, and § 55 RStV by § 18 MStV in 2020 — the citations below follow
// the current names.
export default function Impressum() {
  return (
    <div style={{ maxWidth: 720 }}>
      <h1 className="page-title" style={{ marginBottom: 20 }}>{t('legal.impressum')}</h1>
      <div className="card card-pad" lang="de" style={{ lineHeight: 1.7 }}>
        <p className="section-title">Angaben gemäß § 5 DDG</p>
        <p>
          Lars Gossard<br />
          incūdex · Marke lasse tech<br />
          Schleifmühlstraße 22<br />
          91456 Diespeck<br />
          Deutschland
        </p>

        <p className="section-title" style={{ marginTop: 20 }}>Kontakt</p>
        <p>
          E-Mail: <a href="mailto:lars@lasse-tech.de">lars@lasse-tech.de</a><br />
          Telefon: +49 1523 3504688<br />
          Web: <a href="https://www.lasse-tech.de" target="_blank" rel="noopener noreferrer">www.lasse-tech.de</a>
        </p>

        <p className="section-title" style={{ marginTop: 20 }}>Verantwortlich für den Inhalt (§ 18 Abs. 2 MStV)</p>
        <p>Lars Gossard, Anschrift wie oben</p>

        <p className="section-title" style={{ marginTop: 20 }}>Haftungshinweis</p>
        <p className="muted" style={{ fontSize: 13.5 }}>
          Raidex ist ein inoffizielles Fan-Projekt und steht in keiner Verbindung zu Blizzard Entertainment.
          World of Warcraft und Battle.net sind Marken von Blizzard Entertainment, Inc. Charakter- und
          Gildendaten werden über die offizielle Blizzard-API bezogen.
        </p>
      </div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 14 }}>
        © 2026 lasse tech, Lars Gossard
      </p>
    </div>
  );
}
