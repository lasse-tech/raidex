// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api.js';
import { formatNumber, formatDateTime, mplusColor, factionColor, factionLabel } from '../lib/wow.js';
import { StatTile, Spinner } from '../components/bits.jsx';
import { FactionEmblem } from '../components/CharacterSheet.jsx';
import { t } from '../i18n/index.js';

// Every guild on this instance, largest first — the operator's view of the
// numbers GET /api/stats hands to outside displays. It is where a desklet's
// "… n more" line lands, so it has to show what that line was hiding: the
// guilds beyond the display's own limit, and each one's M+ king.
//
// Operator only (isSuperadmin). The route is not even registered for anyone
// else, so a stray link falls through to the dashboard.
export default function Guilds() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);     // guild whose start request is in flight
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    try {
      setData(await api.guildOverview());
    } catch {
      setError(t('guilds.loadFailed'));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // A scan runs in the background of the request that started it, so the only
  // way to learn it has finished is to ask again. Poll while any guild carries
  // the flag - the operator's own scan as much as one started elsewhere - and
  // stop as soon as none does, which is also when lastScanAt is fresh.
  const scanning = data?.list?.some((g) => g.scanning) ?? false;
  useEffect(() => {
    if (!scanning) return undefined;
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [scanning, load]);

  async function startScan(guild) {
    setBusy(guild.id);
    setNotice(null);
    try {
      const res = await api.scanGuild(guild.id);
      setNotice(res.started
        ? t('guilds.scanStarted', { name: guild.name })
        : t('guilds.scanBusy', { name: guild.name }));
      await load();
    } catch (err) {
      setNotice(t('guilds.scanFailed', { name: guild.name, error: err.message }));
    } finally {
      setBusy(null);
    }
  }

  if (error) return <div className="card card-pad center-msg">{error}</div>;
  if (!data) return <Spinner />;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('guilds.title')}</h1>
          <div className="page-sub">
            {t('guilds.sub', { time: formatDateTime(data.generatedAt) })}
          </div>
        </div>
      </div>

      <div className="grid cols-3">
        <StatTile label={t('guilds.guilds')} value={formatNumber(data.guilds)} />
        <StatTile label={t('guilds.members')} value={formatNumber(data.members)} accent="var(--cyan)" />
        <StatTile label={t('guilds.scannedChars')} value={formatNumber(data.scanned)} accent="var(--yellow)" />
      </div>

      <div className="card table-wrap" style={{ marginTop: 18 }}>
        <table className="roster">
          <thead>
            <tr>
              <th>{t('guilds.guild')}</th>
              <th style={{ textAlign: 'right' }}>{t('guilds.members')}</th>
              <th style={{ textAlign: 'right' }}>{t('guilds.scanned')}</th>
              <th>{t('guilds.king')}</th>
              <th style={{ textAlign: 'right' }}>{t('guilds.achievementPoints')}</th>
              <th>{t('guilds.lastScan')}</th>
              <th style={{ textAlign: 'right' }}>{t('guilds.scan')}</th>
            </tr>
          </thead>
          <tbody>
            {data.list.map((g) => (
              <tr key={g.id}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <FactionEmblem faction={g.faction} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15.5 }}>{g.name}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {g.realm} · {g.region?.toUpperCase()}
                        {g.faction ? ' · ' : ''}
                        {g.faction && <span style={{ color: factionColor(g.faction) }}>{factionLabel(g.faction)}</span>}
                      </div>
                    </div>
                  </div>
                </td>
                {/* Never scanned means "not known", not "empty" — a 0 here would
                    read as a guild nobody is in. */}
                <td style={{ textAlign: 'right' }}>{g.members != null ? formatNumber(g.members) : '—'}</td>
                <td style={{ textAlign: 'right' }} className="muted">{formatNumber(g.scanned)}</td>
                <td>
                  {g.king ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 700 }}>{g.king.name}</span>
                      <span className="pill" style={{ borderColor: mplusColor(g.king.rating), color: mplusColor(g.king.rating) }}>
                        {g.king.rating}
                      </span>
                    </span>
                  ) : <span className="muted">—</span>}
                </td>
                <td style={{ textAlign: 'right' }} className="muted">
                  {g.achievementPoints != null ? formatNumber(g.achievementPoints) : '—'}
                </td>
                <td className="muted" style={{ fontSize: 12.5 }}>
                  {g.lastScanAt ? formatDateTime(g.lastScanAt) : t('common.never')}
                </td>
                {/* The scan ignores the daily TTL, so this is a real "now", not
                    a request the backend may quietly drop. It only refuses to
                    overlap a run already going. */}
                <td style={{ textAlign: 'right' }}>
                  <button
                    className="btn btn-sm btn-ghost"
                    disabled={g.scanning || busy === g.id}
                    onClick={() => startScan(g)}
                  >
                    {g.scanning ? t('guilds.running') : busy === g.id ? t('guilds.starting') : t('guilds.scanNow')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {notice && (
        <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>{notice}</p>
      )}

      <p className="muted" style={{ fontSize: 12.5, marginTop: 14 }}>
        {t('guilds.note')}
      </p>

      <p className="muted" style={{ fontSize: 12.5, marginTop: 14 }}>
        {t('guilds.statsBefore')} <code>GET /api/stats</code> {t('guilds.statsAfter')} <a href="/profile">{t('nav.profile')}</a>.
      </p>
    </>
  );
}
