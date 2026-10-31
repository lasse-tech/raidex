// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useMemo, useState, useRef } from 'react';
import { api } from '../lib/api.js';
import { classColor, CLASS_NAMES, formatNumber, mplusColor } from '../lib/wow.js';
import { Spinner } from '../components/bits.jsx';
import CharacterSheet from '../components/CharacterSheet.jsx';
import Dropdown from '../components/Dropdown.jsx';
import { t } from '../i18n/index.js';

// Blizzard's roster API only exposes the numeric rank, not the guild's custom
// rank names — so only the Guild Master (0) is known; the rest are "Rang N".
const rankLabel = (r) => (r === 0 ? t('role.gm') : t('roster.rank', { n: r }));

const PAGE_SIZE = 25;

export default function Roster() {
  const [data, setData] = useState(null);
  const [metric, setMetric] = useState('mythicRating'); // 'mythicRating' | 'achievementPoints'
  const [sort, setSort] = useState({ key: 'mythicRating', dir: -1 });
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState({ classId: '', race: '' });
  const [page, setPage] = useState(0);
  const [sheet, setSheet] = useState(null); // {realm, name}
  const [busyId, setBusyId] = useState(null);

  useEffect(() => { api.roster().then(setData).catch(() => setData({ members: [] })); }, []);

  async function toggleLead(m, e) {
    e.stopPropagation();
    if (m.isGM) return; // the GM is always a lead
    setBusyId(m.id);
    try {
      await api.setRaidlead({ realm: m.realm, name: m.name, on: !m.isRaidlead });
      setData((d) => ({ ...d, members: d.members.map((x) => (x.id === m.id ? { ...x, isRaidlead: !x.isRaidlead } : x)) }));
    } finally { setBusyId(null); }
  }

  async function toggleQuartermaster(m, e) {
    e.stopPropagation();
    setBusyId(m.id);
    try {
      await api.setQuartermaster({ realm: m.realm, name: m.name, on: !m.isQuartermaster });
      setData((d) => ({ ...d, members: d.members.map((x) => (x.id === m.id ? { ...x, isQuartermaster: !x.isQuartermaster } : x)) }));
    } finally { setBusyId(null); }
  }

  // Sorting by M+ or achievements hides the other column entirely.
  const pickMetric = (mk) => { setMetric(mk); setSort({ key: mk, dir: -1 }); };

  const options = useMemo(() => {
    const m = data?.members || [];
    return {
      classId: [...new Set(m.map((x) => x.classId).filter((x) => x != null))].sort((a, b) => (CLASS_NAMES[a] || '').localeCompare(CLASS_NAMES[b] || '')),
      race: [...new Set(m.map((x) => x.race).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    };
  }, [data]);

  const columns = [
    { key: 'name', label: t('roster.colChar'), num: false },
    { key: 'level', label: t('roster.colLevel'), num: true },
    { key: 'className', label: t('roster.colClass'), num: false },
    { key: 'itemLevel', label: t('roster.colIlvl'), num: true },
    { key: metric, label: metric === 'mythicRating' ? t('roster.colMplus') : t('roster.colAchievements'), num: true },
    { key: 'rank', label: t('roster.colRank'), num: false },
  ];

  const rows = useMemo(() => {
    if (!data) return [];
    let m = data.members;
    if (q) m = m.filter((x) => x.name.toLowerCase().includes(q.toLowerCase()));
    if (filters.classId !== '') m = m.filter((x) => x.classId === Number(filters.classId));
    if (filters.race !== '') m = m.filter((x) => x.race === filters.race);
    return [...m].sort((a, b) => {
      const av = a[sort.key] ?? (sort.key === 'name' || sort.key === 'className' ? '' : -1);
      const bv = b[sort.key] ?? (sort.key === 'name' || sort.key === 'className' ? '' : -1);
      if (typeof av === 'string') return av.localeCompare(bv) * sort.dir;
      return (av - bv) * sort.dir;
    });
  }, [data, sort, q, filters]);

  // Reset to page 1 whenever the result set changes.
  useEffect(() => { setPage(0); }, [q, filters, metric]);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages - 1);
  const pageRows = rows.slice(pageSafe * PAGE_SIZE, (pageSafe + 1) * PAGE_SIZE);
  // A–Z → first page with that initial (only useful when sorted by name).
  const letterPages = useMemo(() => {
    const map = {};
    rows.forEach((r, i) => {
      const L = (r.name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').charAt(0).toUpperCase();
      if (L >= 'A' && L <= 'Z' && map[L] === undefined) map[L] = Math.floor(i / PAGE_SIZE);
    });
    return map;
  }, [rows]);

  if (!data) return <Spinner />;

  const setColumn = (key, num) =>
    setSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: num ? -1 : 1 }));

  const anyFilter = filters.classId !== '' || filters.race !== '' || filters.rank !== '';

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {data.guild?.crestEmblemUrl ? (
              <span style={{ width: 40, height: 40, borderRadius: 10, background: data.guild.crestBg || 'var(--surface-2)', border: '1px solid var(--border)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <img src={data.guild.crestEmblemUrl} alt="" style={{ width: 30, height: 30 }} />
              </span>
            ) : data.guild?.crestBg ? (
              <span style={{ width: 26, height: 30, borderRadius: '6px 6px 10px 10px', background: data.guild.crestBg, border: `2px solid ${data.guild.crestEmblem || 'var(--border-strong)'}`, display: 'inline-block' }} />
            ) : null}
            {t('roster.title')}
          </h1>
          <div className="page-sub">
            {t('roster.members', { count: data.members.length })}{data.guild?.displayName ? ` · ${data.guild.displayName}` : ''}
            {data.guild?.achievementPoints ? ` · ${t('roster.points', { n: formatNumber(data.guild.achievementPoints) })}` : ''}
            {data.guild?.scanning ? ` · ${t('roster.scanning')}` : ''}
          </div>
        </div>
        <input className="input" style={{ maxWidth: 220 }} placeholder={t('roster.search')}
          value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="roster-toolbar">
        <div className="roster-filters">
          <Dropdown value={filters.classId} onChange={(v) => setFilters((f) => ({ ...f, classId: v }))}
            options={[{ value: '', label: t('roster.allClasses') }, ...options.classId.map((id) => ({ value: String(id), label: CLASS_NAMES[id] || t('roster.classN', { id }) }))]} />
          <Dropdown value={filters.race} onChange={(v) => setFilters((f) => ({ ...f, race: v }))}
            options={[{ value: '', label: t('roster.allRaces') }, ...options.race.map((r) => ({ value: r, label: r }))]} />
          {anyFilter && (
            <button className="btn btn-ghost btn-sm" onClick={() => setFilters({ classId: '', race: '' })}>{t('roster.reset')}</button>
          )}
        </div>
        <div className="metric-toggle">
          <span className="muted" style={{ fontSize: 12 }}>{t('roster.sort')}</span>
          <div className="metric-seg">
            {[['mythicRating', t('roster.mplus')], ['achievementPoints', t('roster.achievements')]].map(([k, lbl]) => (
              <button key={k} className={'metric-btn' + (metric === k ? ' on' : '')} onClick={() => pickMetric(k)}>{lbl}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="card table-wrap">
        <table className="roster">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key} className={col.num ? 'num' : ''} onClick={() => setColumn(col.key, col.num)}
                  style={col.num ? { textAlign: 'right' } : undefined}>
                  {col.label}{sort.key === col.key ? (sort.dir < 0 ? ' ↓' : ' ↑') : ''}
                </th>
              ))}
              {data.canManageRaidleads && <th style={{ textAlign: 'center' }}>{t('roster.raidlead')}</th>}
              {data.canManageQuartermasters && <th style={{ textAlign: 'center' }}>{t('roster.guides')}</th>}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((m) => {
              const color = classColor(m.classId);
              const mc = mplusColor(m.mythicRating, m.mythicRatingColor);
              return (
                <tr key={m.id} className="roster-row" onClick={() => setSheet({ realm: m.realm, name: m.name })}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {m.avatar
                        ? <img className="avatar" src={m.avatar} alt="" style={{ width: 48, height: 48, borderRadius: '50%', boxShadow: `0 0 0 2px ${color}` }} />
                        : <div className="avatar" style={{ width: 48, height: 48, borderRadius: '50%', background: color, opacity: 0.5, boxShadow: `0 0 0 2px ${color}` }} />}
                      <div>
                        <div style={{ fontWeight: 700, color, fontSize: 15.5, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          {m.name}
                          {m.isRaidlead && (
                            <span className="pill" style={{ borderColor: 'var(--yellow)', color: 'var(--yellow)', fontSize: 10 }}>
                              {m.isGM ? t('roster.gm') : t('roster.raidleadPill')}
                            </span>
                          )}
                          {m.isQuartermaster && (
                            <span className="pill" style={{ borderColor: 'var(--cyan)', color: 'var(--cyan)', fontSize: 10 }}>{t('roster.guidesPill')}</span>
                          )}
                          {data.canSeeAppUsers && m.hasApp && (
                            <span className="pill bnet-chip" title={t('roster.usesApp')}>
                              <img src="https://www.google.com/s2/favicons?sz=32&domain=battle.net" alt="" width="12" height="12" /> Battle.net
                            </span>
                          )}
                        </div>
                        {m.race && <div className="muted" style={{ fontSize: 11.5 }}>{m.race}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="num">{m.level}</td>
                  <td style={{ color }}>{CLASS_NAMES[m.classId] || m.className || '—'}</td>
                  <td className="num">{m.itemLevel ?? '—'}</td>
                  {metric === 'mythicRating' ? (
                    <td className="num" style={{ color: m.mythicRating ? mc : 'var(--text-muted)', fontWeight: 700 }}>
                      {m.mythicRating ? formatNumber(m.mythicRating) : '—'}
                    </td>
                  ) : (
                    <td className="num" style={{ fontWeight: 700 }}>{formatNumber(m.achievementPoints)}</td>
                  )}
                  <td><span className="rank-tag">{rankLabel(m.rank)}</span></td>
                  {data.canManageRaidleads && (
                    <td style={{ textAlign: 'center' }}>
                      <button
                        className={'lead-toggle' + (m.isRaidlead ? ' on' : '')}
                        title={m.isGM ? t('roster.gmAlwaysLead') : m.isRaidlead ? t('roster.removeLead') : t('roster.makeLead')}
                        disabled={m.isGM || busyId === m.id}
                        onClick={(e) => toggleLead(m, e)}>
                        {m.isRaidlead ? '★' : '☆'}
                      </button>
                    </td>
                  )}
                  {data.canManageQuartermasters && (
                    <td style={{ textAlign: 'center' }}>
                      <button
                        className={'lead-toggle guide-toggle' + (m.isQuartermaster ? ' on' : '')}
                        title={m.isQuartermaster ? t('roster.removeQm') : t('roster.makeQm')}
                        disabled={busyId === m.id}
                        onClick={(e) => toggleQuartermaster(m, e)}>
                        📖
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && sort.key === 'name' && Object.keys(letterPages).length > 1 && (
        <div className="alpha">
          <span className="al-label">{t('roster.jump')}</span>
          <div className="al-letters">
            {Object.keys(letterPages).sort().map((L) => (
              <button key={L} className="al-letter" onClick={() => setPage(letterPages[L])}>{L}</button>
            ))}
          </div>
        </div>
      )}
      {totalPages > 1 && (
        <div className="pager">
          <button className="btn btn-sm" disabled={pageSafe === 0} onClick={() => setPage(0)} title={t('roster.first')}>«</button>
          <button className="btn btn-sm" disabled={pageSafe === 0} onClick={() => setPage(pageSafe - 1)}>{t('roster.prev')}</button>
          <span className="muted" style={{ fontSize: 13, padding: '0 4px' }}>
            {t('roster.page', { page: pageSafe + 1, pages: totalPages, rows: rows.length })}
          </span>
          <button className="btn btn-sm" disabled={pageSafe >= totalPages - 1} onClick={() => setPage(pageSafe + 1)}>{t('roster.next')}</button>
          <button className="btn btn-sm" disabled={pageSafe >= totalPages - 1} onClick={() => setPage(totalPages - 1)} title={t('roster.last')}>»</button>
        </div>
      )}

      {sheet && <CharacterSheet realm={sheet.realm} name={sheet.name} onClose={() => setSheet(null)} />}
    </>
  );
}
