// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: MIT
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useMe } from '../lib/store.jsx';
import {
  DIFFICULTIES, formatDateTime, countdown, classColorByName, formatNumber, mplusColor, factionColor, factionLabel,
} from '../lib/wow.js';
import { RoleCounts, Spinner } from '../components/bits.jsx';
import Modal from '../components/Modal.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { FactionEmblem } from '../components/CharacterSheet.jsx';
import { t, LANGS } from '../i18n/index.js';

export default function Dashboard() {
  const { me } = useMe();
  const [data, setData] = useState(null);
  const [editWidget, setEditWidget] = useState(null);
  const [addingWidget, setAddingWidget] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [guildInfoOpen, setGuildInfoOpen] = useState(false);
  const isAdmin = me.user.isAdmin;
  const active = me.activeCharacter;

  // In edit mode, load hidden system cards too (withHidden).
  const load = (withHidden = editMode) => api.dashboard(withHidden).then(setData);
  useEffect(() => { load(false); }, []);
  const toggleEdit = () => { const next = !editMode; setEditMode(next); load(next); };
  if (!data) return <Spinner />;

  const hour = new Date().getHours();
  const greet = t(hour < 5 ? 'dashboard.night' : hour < 11 ? 'dashboard.morning' : hour < 18 ? 'dashboard.day' : 'dashboard.evening');

  return (
    <>
      {me.demoMode && (
        <div className="demo-note">
          {t('dashboard.demoNote')}
        </div>
      )}

      <div className="page-head">
        <div>
          <h1 className="page-title">{greet}{active ? ', ' : ''}
            {active && <span style={{ color: classColorByName(active.className) }}>{active.name}</span>}</h1>
          <div className="page-sub">
            {me.activeGuild
              ? t('dashboard.welcomeBack', { guild: me.activeGuild.displayName, realm: me.activeGuild.realmName })
              : t('dashboard.welcome')}
          </div>
        </div>
      </div>

      {/* Guild header row (crest + name + realm · faction), crest → guild info */}
      {data.guild && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <button type="button" className="crest-btn" onClick={() => setGuildInfoOpen(true)} title={t('dashboard.showGuildInfo')}>
            {data.guild.crestEmblemUrl ? (
              <span style={{ width: 48, height: 48, borderRadius: 12, background: data.guild.crestBg || 'var(--surface-2)', border: '1px solid var(--border)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <img src={data.guild.crestEmblemUrl} alt="" style={{ width: 36, height: 36 }} />
              </span>
            ) : data.guild.crestBg ? (
              <span style={{ width: 40, height: 46, borderRadius: '8px 8px 12px 12px', background: data.guild.crestBg, border: `2px solid ${data.guild.crestEmblem || 'var(--border-strong)'}`, flexShrink: 0 }} />
            ) : (
              <span style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--cyan)', flexShrink: 0 }}>{data.guild.displayName?.charAt(0)}</span>
            )}
          </button>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18 }}>{data.guild.displayName}</div>
            <div style={{ fontSize: 13.5, color: factionColor(data.guild.faction), display: 'flex', alignItems: 'center', gap: 6 }}>
              <FactionEmblem faction={data.guild.faction} />{data.guild.realmName} · {factionLabel(data.guild.faction)}</div>
          </div>
        </div>
      )}

      {/* Guild stat boxes (guild, not character), centred */}
      {data.guild && (
        <div className="grid cols-3 stat-center" style={{ marginBottom: 18 }}>
          {data.mplusKing ? (
            <Link className="card stat stat-link" to="/characters" style={{ textAlign: 'center' }}
              title={t('dashboard.king', { name: data.mplusKing.name })}>
              <div className="val" style={{ color: mplusColor(data.bestMplus, data.mplusKing.color) }}>
                {data.bestMplus ? formatNumber(data.bestMplus) : '—'}</div>
              <div className="lbl">{t('dashboard.bestMplus')}</div>
              <div className="king-sub"><KingCrown />{data.mplusKing.name}</div>
            </Link>
          ) : (
            <div className="card stat">
              <div className="val" style={{ color: 'var(--violet)' }}>{data.bestMplus ? formatNumber(data.bestMplus) : '—'}</div>
              <div className="lbl">{t('dashboard.bestMplus')}</div>
            </div>
          )}
          <QuickStat label={t('dashboard.achievementPoints')} value={formatNumber(data.guild.achievementPoints ?? 0)} accent="var(--yellow)" />
          <QuickStat label={t('dashboard.membersScanned')} value={formatNumber(data.scannedChars ?? 0)} accent="var(--cyan)" />
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: '1.5fr 1fr', alignItems: 'start' }}>
        {/* Next raid */}
        <div>
          <div className="section-title">{t('dashboard.nextRaid')}</div>
          {data.nextRaid ? <NextRaid raid={data.nextRaid} /> : (
            <div className="card card-pad center-msg">{t('dashboard.noRaid')} <Link to="/calendar">{t('dashboard.toCalendar')}</Link></div>
          )}
        </div>

        {/* Weekly reset */}
        <div>
          <div className="section-title">{t('dashboard.weeklyReset')}</div>
          <div className="card card-pad" style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--cyan)" strokeWidth="1.8" strokeLinecap="round"
              strokeLinejoin="round" style={{ width: 38, height: 38, flexShrink: 0 }}>
              <path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1" /><path d="M20.5 3.5V9h-5.5" /><path d="M12 7.5V12l3 1.8" />
            </svg>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green)', fontFamily: 'var(--font-display)' }}>{countdown(data.weeklyResetAt)}</div>
              <div className="muted" style={{ fontSize: 13 }}>{formatDateTime(data.weeklyResetAt)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Info widgets */}
      <div className="section-title" style={{ marginTop: 26, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {t('dashboard.news')}
        {isAdmin && (
          <span style={{ display: 'flex', gap: 8 }}>
            {editMode && (
              <button className="btn btn-ghost btn-sm" onClick={() => setAddingWidget(true)}>{t('dashboard.addCard')}</button>
            )}
            <button className={`btn btn-sm ${editMode ? 'btn-primary' : 'btn-ghost'}`} onClick={toggleEdit} title={t('dashboard.editCards')}>
              {editMode ? t('dashboard.done') : t('dashboard.edit')}
            </button>
          </span>
        )}
      </div>
      <NewsBoard data={data} editMode={editMode} reload={() => load()} onEditWidget={setEditWidget} />

      {editWidget && (
        <WidgetForm widget={editWidget} onClose={() => setEditWidget(null)}
          onSaved={() => { setEditWidget(null); load(); }} />
      )}
      {addingWidget && (
        <WidgetForm widget={null} onClose={() => setAddingWidget(false)}
          onSaved={() => { setAddingWidget(false); load(); }} />
      )}
      {guildInfoOpen && data.guild && (
        <GuildInfoModal guild={data.guild} scannedChars={data.scannedChars} onClose={() => setGuildInfoOpen(false)}
          onLang={(lang) => setData((d) => ({ ...d, guild: { ...d.guild, lang } }))} />
      )}
    </>
  );
}

function GuildInfoModal({ guild, scannedChars, onClose, onLang }) {
  const { me } = useMe();
  return (
    <Modal title={guild.displayName} onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        {guild.crestEmblemUrl && (
          <span style={{ width: 56, height: 56, borderRadius: 12, background: guild.crestBg || 'var(--surface-2)', border: '1px solid var(--border)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <img src={guild.crestEmblemUrl} alt="" style={{ width: 40, height: 40 }} />
          </span>
        )}
        <div>
          <div className="muted" style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{guild.realmName} · {guild.region?.toUpperCase()}</div>
          <div style={{ color: factionColor(guild.faction), fontWeight: 700 }}>{factionLabel(guild.faction)}</div>
        </div>
      </div>
      <div className="grid cols-3 stat-center">
        {[[t('guild.members'), guild.memberCount], [t('guild.achievementPoints'), guild.achievementPoints], [t('guild.scanned'), guild.scannedChars ?? scannedChars]].map(([l, v]) => (
          <div key={l} className="card card-pad" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{v != null ? formatNumber(v) : '—'}</div>
            <div className="muted" style={{ fontSize: 12 }}>{l}</div>
          </div>
        ))}
      </div>
      {me.user.isGM && <GuildLangSettings guild={guild} onLang={onLang} />}
      {me.user.isGM && <DiscordSettings />}
    </Modal>
  );
}

// GM section: the language of Discord messages, the raid card and demo raids.
function GuildLangSettings({ guild, onLang }) {
  const [lang, setLang] = useState(guild.lang || 'en');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { ok, text }
  const change = async (next) => {
    const prev = lang;
    setLang(next); setBusy(true); setMsg(null);
    try { await api.setGuildLang(next); onLang(next); setMsg({ ok: true, text: t('dashboard.saved') }); }
    catch { setLang(prev); setMsg({ ok: false, text: t('dashboard.guildLangFailed') }); }
    finally { setBusy(false); }
  };
  return (
    <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
      <label className="section-title" htmlFor="guild-lang" style={{ display: 'block', marginBottom: 6 }}>{t('dashboard.guildLang')}</label>
      <select id="guild-lang" className="input" style={{ width: 'auto', minWidth: 180 }} value={lang} disabled={busy}
        onChange={(e) => change(e.target.value)}>
        {LANGS.map((l) => <option key={l} value={l}>{t(`language.${l}`)}</option>)}
      </select>
      {msg && <div style={{ fontSize: 12.5, marginTop: 8, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.text}</div>}
    </div>
  );
}

// GM section: the guild's Discord webhook, and a test message.
function DiscordSettings() {
  const [url, setUrl] = useState(null); // null = loading
  const [busy, setBusy] = useState('');  // '' | 'save' | 'test'
  const [msg, setMsg] = useState(null);  // { ok, text }
  useEffect(() => {
    let alive = true;
    api.guildDiscord().then((r) => alive && setUrl(r.webhookUrl || '')).catch(() => alive && setUrl(''));
    return () => { alive = false; };
  }, []);
  const save = async () => {
    setBusy('save'); setMsg(null);
    try { await api.setGuildDiscord(url.trim()); setMsg({ ok: true, text: url.trim() ? t('dashboard.saved') : t('dashboard.notificationsOff') }); }
    catch { setMsg({ ok: false, text: t('dashboard.invalidWebhook') }); }
    finally { setBusy(''); }
  };
  const test = async () => {
    setBusy('test'); setMsg(null);
    try { await api.testGuildDiscord(); setMsg({ ok: true, text: t('dashboard.testSent') }); }
    catch { setMsg({ ok: false, text: t('dashboard.testFailed') }); }
    finally { setBusy(''); }
  };
  if (url === null) return <div style={{ marginTop: 18 }}><Spinner /></div>;
  return (
    <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
      <div className="section-title" style={{ marginBottom: 6 }}>{t('dashboard.discord')}</div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 0, marginBottom: 10 }}>
        {t('dashboard.discordHint')}
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input className="input" style={{ flex: 1, minWidth: 220 }} placeholder="https://discord.com/api/webhooks/…"
          value={url} onChange={(e) => setUrl(e.target.value)} />
        <button className="btn btn-primary btn-sm" onClick={save} disabled={busy === 'save'}>{busy === 'save' ? '…' : t('dashboard.save')}</button>
        <button className="btn btn-sm" onClick={test} disabled={busy === 'test' || !url.trim()}>{busy === 'test' ? '…' : t('dashboard.test')}</button>
      </div>
      {msg && <div style={{ fontSize: 12.5, marginTop: 8, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.text}</div>}
    </div>
  );
}

function QuickStat({ label, value, accent }) {
  return (
    <div className="card stat">
      <div className="val" style={accent ? { color: accent } : undefined}>{value}</div>
      <div className="lbl">{label}</div>
    </div>
  );
}

// Hand-drawn crown (no 👑 emoji).
function KingCrown() {
  return (
    <svg viewBox="0 0 24 24" fill="var(--yellow)" style={{ width: 13, height: 13, verticalAlign: -2, marginRight: 4 }}>
      <path d="M5 18 L3 6.5 L8 10.5 L12 4.5 L16 10.5 L21 6.5 L19 18 Z" />
      <rect x="5" y="18.4" width="14" height="2.2" rx="1" />
    </svg>
  );
}

// Rudimentary Markdown and link detection.
function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function renderWidgetHtml(raw, markdown) {
  let s = String(raw ?? '');
  const tok = [];
  const stash = (html) => { tok.push(html); return `${tok.length - 1}`; };
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, txt, u) =>
    stash(`<a href="${escapeHtml(u)}" target="_blank" rel="noopener">${escapeHtml(txt)}</a>`));
  s = s.replace(/https?:\/\/[^\s<]+/g, (m) => {
    const u = m.replace(/[.,;:)!?]+$/, '');
    return stash(`<a href="${escapeHtml(u)}" target="_blank" rel="noopener">${escapeHtml(u)}</a>`);
  });
  let out = escapeHtml(s);
  if (markdown) {
    out = out.split('\n').map((ln) => {
      let mm;
      if ((mm = ln.match(/^\s*#{1,3}\s+(.*)$/))) return `<b class="md-h">${mm[1]}</b>`;
      if ((mm = ln.match(/^\s*[-*]\s+(.*)$/))) return `<span class="md-li">• ${mm[1]}</span>`;
      return ln;
    }).join('\n');
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  }
  return out.replace(/(\d+)/g, (m, i) => tok[Number(i)] ?? '');
}

// Group cards (system + topics) into rows/columns by the stored layout.
function buildRows(events = [], widgets = []) {
  const cards = [
    ...events.map((e) => ({ ...e, sys: true })),
    ...widgets.map((w) => ({ ...w, sys: false })),
  ];
  const byRow = new Map();
  cards.forEach((c) => { const r = c.sort ?? 0; if (!byRow.has(r)) byRow.set(r, []); byRow.get(r).push(c); });
  return [...byRow.keys()].sort((a, b) => a - b)
    .map((k) => byRow.get(k).sort((a, b) => (a.col ?? 0) - (b.col ?? 0)).slice(0, 3));
}
const rowsSig = (rows) => rows.map((r) => r.map((c) => c.key).join(',')).join('|');

// Recomputed while dragging, from the cursor position.
// All cards live in ONE flex container (breaks via .news-break), so the dragged
// DOM node survives a row change → dragend fires → save.
function reorder(rows, container, x, y, dragKey) {
  let pos = null;
  rows.forEach((row, ri) => row.forEach((c, ci) => { if (c.key === dragKey) pos = { ri, ci }; }));
  if (!pos) return null;
  const drag = rows[pos.ri][pos.ci];
  const cardRect = {};
  container.querySelectorAll('.widget-card[data-key]').forEach((el) => {
    cardRect[el.getAttribute('data-key')] = el.getBoundingClientRect();
  });
  const rc = rows.map((row) => {
    const rects = row.map((c) => cardRect[c.key]).filter(Boolean);
    if (rects.length !== row.length) return null;
    return { top: Math.min(...rects.map((r) => r.top)), bottom: Math.max(...rects.map((r) => r.bottom)) };
  });
  if (!rc.length || rc.some((r) => !r)) return null;
  const stripped = rows.map((row) => row.filter((c) => c.key !== dragKey)).filter((row) => row.length);
  const rowKey = (ri) => { const c = rows[ri].find((cc) => cc.key !== dragKey); return c ? c.key : null; };
  const commit = (out) => (rowsSig(out) === rowsSig(rows) ? null : out);
  const newRowBefore = (anchorKey) => {
    const idx = stripped.findIndex((row) => row.some((c) => c.key === anchorKey));
    if (idx < 0) return null;
    const out = stripped.slice(); out.splice(idx, 0, [drag]); return commit(out);
  };
  const NR = 15;
  if (y < rc[0].top + NR) { const rk = rowKey(0); return rk === null ? null : newRowBefore(rk); }
  if (y > rc[rc.length - 1].bottom - NR) { const out = stripped.slice(); out.push([drag]); return commit(out); }
  for (let i = 0; i < rc.length - 1; i++) {
    const mid = (rc[i].bottom + rc[i + 1].top) / 2;
    if (Math.abs(y - mid) <= NR) { const rk = rowKey(i + 1); return rk === null ? null : newRowBefore(rk); }
  }
  let ti = rc.length - 1;
  for (let k = 0; k < rc.length; k++) {
    const bt = k === rc.length - 1 ? Infinity : (rc[k].bottom + rc[k + 1].top) / 2;
    if (y < bt) { ti = k; break; }
  }
  const inRow = rows[ti].some((c) => c.key === dragKey);
  const others = rows[ti].filter((c) => c.key !== dragKey);
  if (!inRow && others.length >= 3) return null;
  let ref = null; let after = false;
  for (const c of rows[ti]) {
    if (c.key === dragKey) continue;
    const cr = cardRect[c.key];
    if (x < cr.left + cr.width / 2) { ref = c.key; after = false; break; }
    ref = c.key; after = true;
  }
  const out = stripped.slice();
  if (ref === null) {
    const rk = rowKey(ti); if (rk === null) return null;
    const idx = out.findIndex((r) => r.some((c) => c.key === rk));
    out[idx] = [...out[idx], drag];
  } else {
    const idx = out.findIndex((r) => r.some((c) => c.key === ref));
    const ci = out[idx].findIndex((c) => c.key === ref);
    const nr = [...out[idx]]; nr.splice(after ? ci + 1 : ci, 0, drag); out[idx] = nr;
  }
  return commit(out);
}

function NewsBoard({ data, editMode, reload, onEditWidget }) {
  const [rows, setRows] = useState(() => buildRows(data.events, data.widgets));
  const [dragKey, setDragKey] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const rowsRef = useRef(rows);
  const listRef = useRef(null);
  const setBoth = (r) => { rowsRef.current = r; setRows(r); };
  useEffect(() => { setBoth(buildRows(data.events, data.widgets)); }, [data.events, data.widgets]);

  const layoutOf = (rs) => {
    const out = [];
    rs.forEach((row, ri) => row.forEach((c, ci) => out.push({ key: c.key, row: ri, col: ci, sys: c.sys })));
    return out;
  };
  const onDragStart = (e, c) => {
    if (!editMode) return;
    setDragKey(c.key);
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', c.key); } catch { /* noop */ }
  };
  const onDragOver = (e) => {
    if (!dragKey || !listRef.current) return;
    e.preventDefault();
    const next = reorder(rowsRef.current, listRef.current, e.clientX, e.clientY, dragKey);
    if (next) setBoth(next);
  };
  const onDragEnd = async () => {
    if (!dragKey) return;
    setDragKey(null);
    try { await api.saveLayout(layoutOf(rowsRef.current)); } finally { reload(); }
  };
  const toggleHidden = async (c) => {
    await api.saveLayout(layoutOf(rowsRef.current));   // pin the position, then the visibility
    await api.setSystemVisibility(c.key, !c.hidden);
    reload();
  };
  const del = (c) => setConfirmDel(c);

  const card = (c) => (
    <div
      key={c.key}
      data-key={c.key}
      data-sys={c.sys ? '1' : '0'}
      draggable={editMode}
      onDragStart={(e) => onDragStart(e, c)}
      onDragEnd={onDragEnd}
      className={`card widget-card${c.sys ? ' sys' : ''}${c.hidden ? ' hidden-card' : ''}${dragKey === c.key ? ' dragging' : ''}`}
    >
      <div className="accent-bar" style={{ background: c.accent || (c.sys ? 'var(--cyan)' : 'var(--accent)') }} />
      <div className="wico">{c.icon || '📌'}</div>
      <div style={{ minWidth: 0 }}>
        <div className="wtitle">
          {c.title}
          {c.computed && <span className="muted" style={{ fontSize: 10, marginLeft: 6, fontFamily: 'var(--font-mono)' }}>{t('dashboard.computed')}</span>}
        </div>
        <div className="wbody md-body" style={{ whiteSpace: 'pre-wrap' }}
          dangerouslySetInnerHTML={{ __html: renderWidgetHtml(c.body, c.markdown) }} />
      </div>
      {editMode ? (
        <span className="news-tools">
          <span className="drag-handle" title={t('dashboard.dragToMove')}>⠿</span>
          {c.sys ? (
            <button className="btn btn-ghost btn-sm" title={c.hidden ? t('dashboard.show') : t('dashboard.hide')} onClick={() => toggleHidden(c)}>
              {c.hidden ? '👁' : '🙈'}
            </button>
          ) : (
            <>
              <button className="btn btn-ghost btn-sm" title={t('dashboard.editCard')} onClick={() => onEditWidget(c)}>✎</button>
              <button className="btn btn-ghost btn-sm" title={t('dashboard.deleteCard')} onClick={() => del(c)} style={{ color: 'var(--red)' }}>×</button>
            </>
          )}
        </span>
      ) : (!c.sys && (
        <button className="btn btn-ghost btn-sm edit-fab" onClick={() => onEditWidget(c)}>✎</button>
      ))}
    </div>
  );

  return (
    <>
      <div ref={listRef} className={`news-list${editMode ? ' editing' : ''}`}
        onDragOver={onDragOver} onDrop={(e) => e.preventDefault()}>
        {rows.flatMap((row, ri) => {
          const items = ri > 0 ? [<div key={`break-${ri}`} className="news-break" aria-hidden="true" />] : [];
          row.forEach((c) => items.push(card(c)));
          return items;
        })}
      </div>
      {editMode && (
        <div className="news-hint">{t('dashboard.editHint')}</div>
      )}
      {confirmDel && (
        <ConfirmDialog title={t('dashboard.deleteTitle')}
          message={t('dashboard.deleteMsg', { title: confirmDel.title })}
          confirmLabel={t('common.delete')}
          onConfirm={async () => { await api.deleteWidget(confirmDel.key); setConfirmDel(null); reload(); }}
          onClose={() => setConfirmDel(null)} />
      )}
    </>
  );
}

function NextRaid({ raid }) {
  const diff = DIFFICULTIES[raid.difficulty];
  const color = diff?.color || 'var(--accent)';
  return (
    <div className="card raid-card">
      <div className="cover" style={raid.image
        ? { backgroundImage: `linear-gradient(110deg, rgba(16,23,48,0.42), rgba(16,23,48,0.82)), url('${raid.image}')`, backgroundSize: 'cover', backgroundPosition: 'center' }
        : { background: `linear-gradient(135deg, ${color}, var(--surface-3))` }}>
        {!raid.image && <div style={{ position: 'absolute', right: 16, top: 6, fontSize: 60, opacity: 0.3 }}>⚔️</div>}
        <div className="scrim" />
        {diff && <span className="diff role-badge" style={{ background: color }}>{diff.label}</span>}
        <div className="when">{formatDateTime(raid.starts_at)} · {countdown(raid.starts_at, raid.duration_min)}</div>
      </div>
      <div className="rc-body">
        <h3 style={{ fontSize: 20 }}>{raid.title}</h3>
        {raid.description && <p className="muted" style={{ fontSize: 13.5, margin: 0 }}>{raid.description}</p>}
        <RoleCounts counts={raid.counts} />
        <Link className="btn btn-primary" to="/calendar" style={{ marginTop: 'auto' }}>
          {raid.mySignup ? t('dashboard.viewSignup') : t('dashboard.signUpNow')} →
        </Link>
      </div>
    </div>
  );
}

function WidgetForm({ widget, onClose, onSaved }) {
  const isNew = !widget;
  const [f, setF] = useState({
    title: widget?.title || '', body: widget?.body || '', icon: widget?.icon || '📣',
    accent: widget?.accent || '#22E6FF', markdown: !!widget?.markdown,
  });
  const [mono, setMono] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save() {
    if (!f.title.trim()) return;
    setBusy(true);
    const key = widget?.key || `w-${Math.random().toString(36).slice(2, 9)}`;
    try { await api.saveWidget(key, f); onSaved(); }
    finally { setBusy(false); }
  }

  return (
    <Modal title={isNew ? t('dashboard.newCard') : t('dashboard.editInfo')} onClose={onClose}>
      <div className="row">
        <div className="field" style={{ maxWidth: 130 }}>
          <label>{t('dashboard.icon')}</label>
          <input className="input" value={f.icon} onChange={set('icon')} maxLength={8} placeholder="📣" />
        </div>
        <div className="field">
          <label>{t('dashboard.accent')}</label>
          <input className="input" type="color" value={f.accent} onChange={set('accent')} style={{ height: 42, padding: 4 }} />
        </div>
      </div>
      <div className="field">
        <label>{t('dashboard.cardTitle')}</label>
        <input className="input" value={f.title} onChange={set('title')} placeholder={t('dashboard.heading')} />
      </div>
      <div className="field">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <label style={{ margin: 0 }}>{t('dashboard.text')}</label>
          <label className="mono-toggle" title={t('dashboard.monoTitle')}>
            <input type="checkbox" checked={mono} onChange={(e) => setMono(e.target.checked)} /> {t('dashboard.mono')}
          </label>
        </div>
        <textarea className={`textarea${mono ? ' mono-edit' : ''}`} rows={5} value={f.body} onChange={set('body')}
          placeholder={t('dashboard.bodyPlaceholder')} />
      </div>
      <label className="md-toggle">
        <input type="checkbox" checked={f.markdown} onChange={(e) => setF({ ...f, markdown: e.target.checked })} />
        <span>{t('dashboard.markdown')}</span>
      </label>
      <div className="md-help">{t('dashboard.markdownHelp')} · <a href="https://www.markdownguide.org/cheat-sheet/" target="_blank" rel="noopener">{t('dashboard.cheatSheet')}</a></div>
      <button className="btn btn-primary" style={{ width: '100%', marginTop: 12 }} onClick={save} disabled={busy}>{t('dashboard.save')}</button>
    </Modal>
  );
}
