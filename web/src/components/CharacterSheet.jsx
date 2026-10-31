// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { classColorByName, formatNumber, mplusTier, mplusColor, CLASS_NAMES, raiderIoUrl, wowProfileUrl, factionLabel } from '../lib/wow.js';
import { t } from '../i18n/index.js';

// Full-screen character sheet with the large character render (not the avatar).
export default function CharacterSheet({ realm, name, onClose }) {
  const [c, setC] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setC(null); setFailed(false);
    api.character(realm, name).then((d) => alive && setC(d)).catch(() => alive && setFailed(true));
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => { alive = false; window.removeEventListener('keydown', onKey); };
  }, [realm, name, onClose]);

  const color = c ? classColorByName(c.className) : 'var(--accent)';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal" style={{ maxWidth: 620, padding: 0, overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
        {!c && !failed && <div className="spinner" />}
        {failed && <div className="center-msg">{t('char.loadFailed')}</div>}
        {c && (
          <>
            <div style={{ position: 'relative', minHeight: 260, display: 'flex', alignItems: 'flex-end' }}>
              <div style={{
                position: 'absolute', inset: 0,
                background: c.images?.main ? `url(${c.images.main})` : `linear-gradient(135deg, ${color}, var(--surface-2))`,
                backgroundSize: 'cover', backgroundPosition: 'center 20%',
              }} />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(46,52,64,0.95) 5%, rgba(46,52,64,0.25) 60%, transparent)' }} />
              <button className="btn btn-ghost btn-sm" onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(0,0,0,0.35)', color: '#fff' }}>✕</button>
              <div style={{ position: 'relative', padding: 22, color: '#ECEFF4' }}>
                {c.title && <div style={{ opacity: 0.85, fontSize: 13 }}>{c.title}</div>}
                <h2 style={{ fontSize: 30, color }}>{c.name}</h2>
                <div style={{ opacity: 0.9, fontSize: 14 }}>
                  {t('char.level', { level: c.level })} {c.raceName} {CLASS_NAMES[c.classId] || c.className}{c.specName ? ` · ${c.specName}` : ''}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  {c.guild && <div className="pill">&lt;{c.guild}&gt; · {c.realm}</div>}
                  {raiderIoUrl(c) && (
                    <a className="rio-link" href={raiderIoUrl(c)} target="_blank" rel="noopener noreferrer">
                      <img src="https://www.google.com/s2/favicons?sz=32&domain=raider.io" alt="" width="14" height="14" /> Raider.io
                    </a>
                  )}
                  {wowProfileUrl(c) && (
                    <a className="rio-link" href={wowProfileUrl(c)} target="_blank" rel="noopener noreferrer"
                      style={{ borderColor: '#00AEFF', color: '#00AEFF' }}>
                      <img src="https://www.google.com/s2/favicons?sz=32&domain=worldofwarcraft.blizzard.com" alt="" width="14" height="14" /> {t('char.wowProfile')}
                    </a>
                  )}
                </div>
              </div>
            </div>

            <div className="card-pad">
              <div className="grid cols-3">
                <Stat label={t('char.itemLevel')} value={c.itemLevel ?? '—'} />
                <Stat label={t('char.mplusRating')} value={c.mythicRating ? formatNumber(c.mythicRating) : '—'} accent={c.mythicRating ? mplusColor(c.mythicRating, c.mythicRatingColor) : undefined} />
                <Stat label={t('char.achievementPoints')} value={formatNumber(c.achievementPoints)} accent="var(--yellow)" />
              </div>
              <div className="grid cols-2" style={{ marginTop: 14 }}>
                <Row k={t('char.class')} v={CLASS_NAMES[c.classId] || c.className} color={color}
                  icon={c.classIcon && <img className="dico" src={c.classIcon} alt="" />} />
                <Row k={t('char.spec')} v={c.specName || '—'}
                  icon={c.specIcon && <img className="dico" src={c.specIcon} alt="" />} />
                <Row k={t('char.race')} v={c.raceName || '—'} />
                <Row k={t('char.faction')} v={factionLabel(c.faction === 'HORDE' ? 'HORDE' : 'ALLIANCE')}
                  color={c.faction === 'HORDE' ? 'var(--red)' : 'var(--cyan)'} icon={<FactionEmblem faction={c.faction} />} />
                <Row k={t('char.realm')} v={c.realm} />
                <Row k={t('char.mplusTier')} v={mplusTier(c.mythicRating || 0).label} color={mplusColor(c.mythicRating, c.mythicRatingColor)}
                  icon={<span className="mplus-key" style={{ background: mplusColor(c.mythicRating, c.mythicRatingColor) }} />} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className="card stat">
      <div className="val" style={accent ? { color: accent } : undefined}>{value}</div>
      <div className="lbl">{label}</div>
    </div>
  );
}
function Row({ k, v, color, icon }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <span className="muted">{k}</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700, color: color || 'var(--text)' }}>{icon}{v}</span>
    </div>
  );
}

// Faction emblem as SVG (Alliance blue / Horde red).
export function FactionEmblem({ faction }) {
  const horde = faction === 'HORDE';
  const col = horde ? '#c9302c' : '#2f7fe0';
  return (
    <svg className="dico" viewBox="0 0 24 24" fill={col} stroke={col} strokeWidth="1.2" strokeLinejoin="round" style={{ padding: 1 }}>
      {horde
        ? <path d="M12 4c2.4 1.2 3 3.4 2.4 5.2C16 8.6 17.4 9.4 18 11c-1 .2-1.8.8-2.2 1.8.8 2.4-.3 4.6-3.8 6.7-3.5-2.1-4.6-4.3-3.8-6.7C7.8 11.8 7 11.2 6 11c.6-1.6 2-2.4 3.6-1.8C9 7.4 9.6 5.2 12 4z" />
        : <><path d="M12 3.5l7 3v5c0 4.6-3 7.6-7 9.2-4-1.6-7-4.6-7-9.2v-5z" fill="none" stroke={col} strokeWidth="1.7" /><path d="M12 8v7M9 11.5h6" /></>}
    </svg>
  );
}
