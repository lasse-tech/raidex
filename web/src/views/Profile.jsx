// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: MIT
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useMe } from '../lib/store.jsx';
import { classColorByName, formatNumber, formatDateTime, mplusTier, mplusColor, CLASS_NAMES, raiderIoUrl, wowProfileUrl, factionLabel } from '../lib/wow.js';
import { StatTile, Spinner } from '../components/bits.jsx';
import { FactionEmblem } from '../components/CharacterSheet.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import Dropdown from '../components/Dropdown.jsx';
import { LOCALE_DEFAULT, LOCALE_OPTIONS, resolveLocale, systemLocale } from '../lib/locale.js';
import { api, API } from '../lib/api.js';
import { t } from '../i18n/index.js';

export default function Profile() {
  const { me } = useMe();
  const c = me.activeCharacter;
  const color = c ? classColorByName(c.className) : 'var(--accent)';

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('profile.title')}</h1>
          <div className="page-sub">{me.user.battletag} · {me.user.isGM ? t('role.gm') : me.user.isAdmin ? t('role.raidlead') : t('profile.guildMember')}</div>
        </div>
      </div>

      {!c ? (
        <div className="card card-pad center-msg">
          {t('profile.noChar')}<br />
          <Link className="btn btn-primary" style={{ marginTop: 16 }} to="/characters">{t('profile.pickChar')}</Link>
        </div>
      ) : (
        <>
          <div className="hero" style={{ marginBottom: 18 }}>
            <div className="hero-bg" style={{ backgroundImage: c.images?.inset ? `url(${c.images.inset})` : c.images?.main ? `url(${c.images.main})` : `linear-gradient(135deg, ${color}, var(--surface-2))` }} />
            <div className="hero-scrim" />
            <div className="hero-body">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                {c.images?.avatar && <img className="avatar" src={c.images.avatar} alt="" style={{ width: 80, height: 80, borderRadius: 16, border: `2px solid ${color}` }} />}
                <div>
                  <h2 style={{ fontSize: 28, color, lineHeight: 1.15 }}>{c.title || c.name}</h2>
                  <div style={{ opacity: 0.9, fontSize: 14, marginTop: 4 }}>
                    {t('char.level', { level: c.level })} {c.raceName} {CLASS_NAMES[classIdOf(c)] || c.className}
                    {c.specName ? ` · ${c.specName}` : ''} · {c.realm}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                    {c.guild && <div className="pill">&lt;{c.guild}&gt;</div>}
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
            </div>
          </div>

          <div className="grid cols-3">
            <StatTile label={t('char.itemLevel')} value={c.itemLevel ?? '—'} />
            <StatTile label={t('char.mplusRating')} value={c.mythicRating ? formatNumber(c.mythicRating) : '—'}
              accent={c.mythicRating ? mplusColor(c.mythicRating, c.mythicRatingColor) : undefined} />
            <StatTile label={t('char.achievementPoints')} value={formatNumber(c.achievementPoints)} accent="var(--yellow)" />
          </div>

          <div className="card card-pad" style={{ marginTop: 18 }}>
            <div className="section-title">{t('char.details')}</div>
            <div className="grid cols-2">
              <Detail k={t('char.class')} v={CLASS_NAMES[classIdOf(c)] || c.className} color={color}
                icon={c.classIcon && <img className="dico" src={c.classIcon} alt="" />} />
              <Detail k={t('char.spec')} v={c.specName || '—'}
                icon={c.specIcon && <img className="dico" src={c.specIcon} alt="" />} />
              <Detail k={t('char.race')} v={c.raceName || '—'} />
              <Detail k={t('char.faction')} v={factionLabel(c.faction === 'HORDE' ? 'HORDE' : 'ALLIANCE')}
                color={c.faction === 'HORDE' ? 'var(--red)' : 'var(--cyan)'} icon={<FactionEmblem faction={c.faction} />} />
              <Detail k={t('char.realm')} v={c.realm} />
              <Detail k={t('char.mplusTier')} v={mplusTier(c.mythicRating || 0).label} color={mplusColor(c.mythicRating, c.mythicRatingColor)}
                icon={<span className="mplus-key" style={{ background: mplusColor(c.mythicRating, c.mythicRatingColor) }} />} />
            </div>
          </div>
        </>
      )}

      <LocaleSetting />

      {me.user.isSuperadmin && <StatsTokens />}
    </>
  );
}

// Date and time format. This has to be a stored preference: a browser only ever
// exposes its own UI language, never the host's format settings, so a Linux box
// with LANG=en_US and LC_TIME=de_DE reports en-US and would render 9/3/2026.
function LocaleSetting() {
  const { me, refresh } = useMe();
  const pref = me.user.locale || LOCALE_DEFAULT;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const change = async (value) => {
    if (value === pref) return;
    setBusy(true); setError(null);
    try {
      await api.setLocale(value);
      await refresh();
    } catch { setError(t('profile.formatSaveFailed')); }
    finally { setBusy(false); }
  };

  const sample = Date.now();
  const resolved = resolveLocale(pref);

  return (
    <div className="card card-pad" style={{ marginTop: 18 }}>
      <div className="section-title">{t('profile.dateTime')}</div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 0, marginBottom: 14 }}>
        {t('profile.formatHint')}
      </p>

      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>{t('profile.format')}</label>
          <Dropdown value={pref} onChange={change} disabled={busy}
            options={LOCALE_OPTIONS.map((o) => ({
              value: o.value,
              label: o.value === 'system' ? `${o.label} (${systemLocale()})` : o.label,
            }))} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>{t('profile.sample')}</label>
          <div className="input" style={{ display: 'flex', alignItems: 'center' }}>
            {new Intl.DateTimeFormat(resolved, {
              weekday: 'short', day: '2-digit', month: 'short',
              year: 'numeric', hour: '2-digit', minute: '2-digit',
            }).format(sample)}
          </div>
        </div>
      </div>

      {error && <div style={{ fontSize: 12.5, marginTop: 10, color: 'var(--red)' }}>{error}</div>}
    </div>
  );
}

// Keys for GET /api/stats — the read-only figures an outside display (the
// Cinnamon desklet, a dashboard) asks for. Only the operator BattleTag from the
// configuration sees this; the endpoint spans every guild, so it is not a GM's
// to hand out. A token is shown once, here, and is a SHA-256 on the server
// afterwards: there is no way to read it back, only to generate another.
function StatsTokens() {
  const [state, setState] = useState(null);   // null = loading; { tokens, configured }
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState(null);   // the plain token, shown once
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const load = () => api.statsTokens().then(setState).catch(() => setState({ tokens: [], configured: false }));
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!label.trim()) return;
    setBusy(true); setError(null); setCopied(false);
    try {
      const r = await api.createStatsToken(label.trim());
      setFresh(r.token);
      setLabel('');
      await load();
    } catch { setError(t('profile.tokenFailed')); }
    finally { setBusy(false); }
  };

  const remove = async (id) => {
    await api.deleteStatsToken(id);
    setConfirm(null);
    await load();
  };

  // clipboard.writeText needs a secure context; the app is served over HTTPS,
  // but a browser can still refuse it, so the token stays selectable on screen.
  const copy = async () => {
    try { await navigator.clipboard.writeText(fresh); setCopied(true); }
    catch { setError(t('profile.copyFailed')); }
  };

  if (state === null) return <div className="card card-pad" style={{ marginTop: 18 }}><Spinner /></div>;

  return (
    <div className="card card-pad" style={{ marginTop: 18 }}>
      <div className="section-title">{t('profile.tokens')}</div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 0, marginBottom: 14 }}>
        {t('profile.tokensHintBefore')} <code>GET {API}/stats</code>: {t('profile.tokensHintAfter')}
      </p>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input className="input" style={{ flex: 1, minWidth: 220 }} maxLength={120}
          placeholder={t('profile.tokenLabel')}
          value={label} onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && create()} />
        <button className="btn btn-primary btn-sm" onClick={create} disabled={busy || !label.trim()}>
          {busy ? '…' : t('profile.createToken')}
        </button>
      </div>

      {fresh && (
        <div style={{ marginTop: 14, padding: 12, border: '1px solid var(--cyan)', borderRadius: 8 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
            {t('profile.onceVisible')}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <code style={{ fontFamily: 'var(--font-mono)', fontSize: 13, wordBreak: 'break-all', flex: 1, minWidth: 220 }}>
              {fresh}
            </code>
            <button className="btn btn-sm" onClick={copy}>{copied ? t('profile.copied') : t('profile.copy')}</button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setFresh(null); setCopied(false); }}>{t('profile.done')}</button>
          </div>
        </div>
      )}

      {error && <div style={{ fontSize: 12.5, marginTop: 8, color: 'var(--red)' }}>{error}</div>}

      {state.configured && (
        <div className="muted" style={{ fontSize: 12, marginTop: 14 }}>
          {t('profile.fixedTokenBefore')} <code>stats_token</code> (<code>config.php</code>) {t('profile.fixedTokenAfter')}
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        {state.tokens.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>{t('profile.noTokens')}</div>
        ) : state.tokens.map((tok) => (
          <div key={tok.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
            padding: '10px 0', borderTop: '1px solid var(--border)' }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontWeight: 700 }}>{tok.label}</div>
              <div className="muted" style={{ fontSize: 12 }}>
                <span style={{ fontFamily: 'var(--font-mono)' }}>{tok.prefix}…</span>
                {' · '}{t('profile.created', { time: formatDateTime(tok.createdAt) })}
                {' · '}{tok.lastUsedAt ? t('profile.lastUsed', { time: formatDateTime(tok.lastUsedAt) }) : t('profile.neverUsed')}
              </div>
            </div>
            <button className="btn btn-danger btn-sm" onClick={() => setConfirm(tok)}>{t('profile.revoke')}</button>
          </div>
        ))}
      </div>

      {confirm && (
        <ConfirmDialog title={t('profile.revokeTitle')} confirmLabel={t('profile.revoke')}
          message={t('profile.revokeMsg', { label: confirm.label })}
          onConfirm={() => remove(confirm.id)} onClose={() => setConfirm(null)} />
      )}
    </div>
  );
}

function Detail({ k, v, color, icon }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <span className="muted">{k}</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700, color: color || 'var(--text)' }}>{icon}{v}</span>
    </div>
  );
}

function classIdOf(c) {
  return c.classId;
}
