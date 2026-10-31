// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: MIT
import { t } from '../i18n/index.js';

// About: version, copyright, licence with the source link, credits, trademark notice, and the "Made with <3 in Europe" chip.
const SOURCE_URL = 'https://github.com/lasse-tech/raidex';
const LICENSE_URL = 'https://opensource.org/license/mit';

const CREDITS = [
  [t('about.fonts'), 'Oxanium, Chakra Petch, JetBrains Mono (Fontsource) · SIL Open Font License 1.1'],
  [t('about.icons'), 'Material Design Icons · Apache-2.0'],
  [t('about.libraries'), 'React, React Router, Vite · MIT'],
  [t('about.gameData'), 'Blizzard Battle.net API'],
];

export default function About() {
  return (
    <div style={{ maxWidth: 720 }}>
      <h1 className="page-title" style={{ marginBottom: 20 }}>{t('about.title')}</h1>
      <div className="card card-pad about" style={{ lineHeight: 1.7 }}>
        <p className="about-name">Raidex</p>
        <p><span className="pill">{t('about.version', { v: __APP_VERSION__ })}</span></p>
        <p>
          © 2026 lasse tech, Lars Gossard · <a href="mailto:lars@lasse-tech.de">lars@lasse-tech.de</a><br />
          {t('about.license')}: <a href={LICENSE_URL} target="_blank" rel="noopener noreferrer">MIT</a> ·{' '}
          <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer">{t('about.source')}</a>
        </p>

        <p className="section-title" style={{ marginTop: 20 }}>{t('about.credits')}</p>
        {CREDITS.map(([k, v]) => (
          <p key={k} className="about-credit"><span className="muted">{k}</span> {v}</p>
        ))}
        <p className="muted" style={{ fontSize: 12.5, marginTop: 14 }}>
          {t('about.trademark')}
        </p>

        <p className="about-chip-row">
          <span className="about-chip">
            Made with
            {/* The heart drawn, not a glyph the brand fonts may lack */}
            <svg width="10" height="9" viewBox="0 0 10 9" aria-label="love" role="img">
              <path fill="#E5484D" d="M5,9 C5,9 0,5.5 0,2.75 C0,1.2 1.2,0 2.6,0 C3.6,0 4.5,0.6 5,1.4 C5.5,0.6 6.4,0 7.4,0 C8.8,0 10,1.2 10,2.75 C10,5.5 5,9 5,9 Z" />
            </svg>
            in Europe
          </span>
        </p>
      </div>
    </div>
  );
}
