// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { useMe } from '../lib/store.jsx';
import {
  DIFFICULTIES, ROLES, classColorByName, formatDateTime, formatClock, countdown,
} from '../lib/wow.js';
import { activeLocale } from '../lib/locale.js';
import { RoleCounts, RoleIcon } from '../components/bits.jsx';
import Modal from '../components/Modal.jsx';
import { Spinner } from '../components/bits.jsx';
import Dropdown from '../components/Dropdown.jsx';
import DateTimeField, { TimeField } from '../components/DateTimeField.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { t, lang } from '../i18n/index.js';

// Self-contained cover art: a difficulty-tinted gradient with an emblem.
function cover(raid) {
  const d = DIFFICULTIES[raid.difficulty] || DIFFICULTIES.normal;
  const emblem = raid.difficulty === 'mplus' ? '🗝️' : raid.instance?.toLowerCase().includes('omega') ? '⚙️' : '🐉';
  return { color: d.color, emblem };
}

// Group an instance list into [{ expansion, items }] for one <optgroup> per WoW
// expansion. Expansions newest-first (journal id rises with release date), the
// instances within each sorted alphabetically.
function byExpansion(list) {
  const groups = [];
  const idx = {};
  for (const it of list || []) {
    const key = it.expansion || t('calendar.other');
    if (idx[key] === undefined) { idx[key] = groups.length; groups.push({ expansion: key, expansionId: it.expansionId ?? 0, items: [] }); }
    groups[idx[key]].items.push(it);
  }
  for (const g of groups) g.items.sort((a, b) => (a.name || '').localeCompare(b.name || '', lang));
  groups.sort((a, b) => (b.expansionId ?? 0) - (a.expansionId ?? 0));
  return groups;
}

// Typeable picker (combobox): filters from 2 characters, otherwise the full list
// grouped by expansion. Instances are deduplicated by id (the same instance shows
// up e.g. under its expansion AND under "current season").
function InstanceCombobox({ instances, value, onSelect, placeholder }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const boxRef = useRef(null);

  const groups = useMemo(() => {
    if (!instances) return [];
    const seen = new Set();
    const gs = byExpansion(instances).map((g) => ({
      expansion: g.expansion,
      items: g.items.filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true))),
    }));
    const q = query.trim().toLowerCase();
    if (q.length < 2) return gs.filter((g) => g.items.length);
    return gs
      .map((g) => ({ ...g, items: g.items.filter((i) => (i.name || '').toLowerCase().includes(q)) }))
      .filter((g) => g.items.length);
  }, [instances, query]);

  useEffect(() => {
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const pick = (name) => { onSelect(name); setOpen(false); setQuery(''); };

  return (
    <div className="combobox" ref={boxRef}>
      <input
        className="input" value={open ? query : (value || '')}
        placeholder={value || placeholder || t('calendar.search')} disabled={!instances}
        onFocus={() => { setOpen(true); setQuery(''); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
      />
      {open && instances && (
        <div className="combobox-pop">
          {!groups.length && <div className="combobox-empty">{t('calendar.noMatch')}</div>}
          {groups.map((g) => (
            <div key={g.expansion}>
              <div className="combobox-group">{g.expansion}</div>
              {g.items.map((i) => (
                <button
                  type="button" key={i.id}
                  className={`combobox-item${i.name === value ? ' sel' : ''}`}
                  onMouseDown={(e) => { e.preventDefault(); pick(i.name); }}
                >{i.name}</button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const toLocalInput = (ms) => {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
};
// Local time as "HH:MM" (for the end field).
const toTimeInput = (ms) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
// Duration in minutes from start (ms) + end ("HH:MM"), past midnight allowed.
const durationFromEnd = (startMs, hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  if (!m) return 120;
  const s = new Date(startMs);
  let d = (Number(m[1]) * 60 + Number(m[2])) - (s.getHours() * 60 + s.getMinutes());
  d = ((d % 1440) + 1440) % 1440;
  return d === 0 ? 120 : d;
};

export default function Calendar() {
  const { me } = useMe();
  const isAdmin = me.user.isAdmin;
  const [raids, setRaids] = useState(null);
  const [editing, setEditing] = useState(null); // raid object or {} for new
  const [signupFor, setSignupFor] = useState(null);
  const [deletingRaid, setDeletingRaid] = useState(null);
  const [guidesBy, setGuidesBy] = useState({}); // instance -> { guides, canManage }
  const [scope, setScope] = useState('upcoming'); // 'upcoming' | 'past'

  const load = () => api.raids(scope).then(setRaids);
  useEffect(() => { setRaids(null); load(); }, [scope]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadGuides = (instance) => {
    if (!instance) return;
    api.guides(instance).then((res) => setGuidesBy((prev) => ({ ...prev, [instance]: res }))).catch(() => {});
  };
  useEffect(() => {
    if (!raids) return;
    [...new Set(raids.map((r) => r.instance).filter(Boolean))].forEach((inst) => { if (!guidesBy[inst]) loadGuides(inst); });
  }, [raids]); // eslint-disable-line react-hooks/exhaustive-deps

  // A share link (/r/…) lands on /calendar#raid-<id>: scroll there and flash
  // the card once the raids are loaded.
  useEffect(() => {
    if (!raids) return;
    const m = window.location.hash.match(/^#raid-(\d+)$/);
    if (!m) return;
    const el = document.getElementById(`raid-${m[1]}`);
    // A share link can point at a raid that has already happened. It is not in
    // the upcoming list, so switch to the archive once and look again there.
    if (!el) {
      if (scope === 'upcoming' && raids.every((r) => String(r.id) !== m[1])) setScope('past');
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('raid-flash');
    const timer = setTimeout(() => el.classList.remove('raid-flash'), 2400);
    return () => clearTimeout(timer);
  }, [raids]);

  if (!raids) return <Spinner />;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('calendar.title')}</h1>
          <div className="page-sub">{t('calendar.sub')}</div>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({})}>{t('calendar.newRaid')}</button>
      </div>

      {!me.activeCharacter && (
        <div className="demo-note">{t('calendar.noActiveChar')}</div>
      )}

      <div className="scope-tabs">
        <button className={`scope-tab${scope === 'upcoming' ? ' sel' : ''}`}
          onClick={() => setScope('upcoming')}>{t('calendar.upcoming')}</button>
        <button className={`scope-tab${scope === 'past' ? ' sel' : ''}`}
          onClick={() => setScope('past')}>{t('calendar.past')}</button>
      </div>

      {raids.length === 0 && (
        <div className="card card-pad center-msg">
          {scope === 'past' ? t('calendar.noPast') : t('calendar.noUpcoming')}
        </div>
      )}

      {/* One raid per row: each is a pair of panels (raid | roster), which needs
          the full content width — see .raid-pair in styles.css. */}
      <div className="grid">
        {raids.map((raid) => (
          <RaidCard key={raid.id} raid={raid}
            guidesData={guidesBy[raid.instance]}
            onGuidesChanged={() => loadGuides(raid.instance)}
            onSignup={() => setSignupFor(raid)}
            onUpdated={(updated) => setRaids((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))}
            onEdit={() => setEditing(raid)}
            onDelete={() => setDeletingRaid(raid)} />
        ))}
      </div>

      {editing && (
        <RaidForm raid={editing} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }} />
      )}
      {signupFor && (
        <SignupModal raid={signupFor} onClose={() => setSignupFor(null)}
          onChange={(updated) => {
            setRaids((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
            setSignupFor(updated);
          }} />
      )}
      {deletingRaid && (
        <ConfirmDialog title={t('calendar.deleteTitle')}
          message={t('calendar.deleteMsg', { title: deletingRaid.title })}
          confirmLabel={t('common.delete')}
          onConfirm={async () => { await api.deleteRaid(deletingRaid.id); setDeletingRaid(null); load(); }}
          onClose={() => setDeletingRaid(null)} />
      )}
    </>
  );
}

const SITE_DOMAIN = { wowhead: 'wowhead.com', method: 'method.gg', buffed: 'buffed.de' };
const siteIcon = (site) => (SITE_DOMAIN[site] ? `https://www.google.com/s2/favicons?sz=64&domain=${SITE_DOMAIN[site]}` : null);

// Guides grouped by whoever added them, so a link someone in the guild curated
// carries their name and role instead of hiding among the automatic ones. The
// generated Wowhead/Method links have no author and stay in one group at the
// end, credited to the product itself; that heading only appears when there is
// a named group to tell it from, since a lone heading over the usual list would
// be noise.
//
// The role comes off the first guide of each author: the API derives it per row
// from the same account, so every row of a group carries the same one.
function groupGuides(guides, locale, product) {
  const byPerson = new Map();
  const standard = [];
  for (const gd of guides) {
    if (gd.global) { standard.push(gd); continue; }
    const who = gd.createdBy || 'Mitglied';
    if (!byPerson.has(who)) byPerson.set(who, []);
    byPerson.get(who).push(gd);
  }
  // char_display_name() falls back to "Mitglied" for an account with no main
  // set, which reads wrong as a name — and that group belongs after the named
  // ones rather than alphabetically among them.
  const ANON = 'Mitglied';
  const groups = [...byPerson.entries()]
    .sort((a, b) => (a[0] === ANON) - (b[0] === ANON) || a[0].localeCompare(b[0], locale))
    .map(([who, items]) => ({
      name: who === ANON ? t('calendar.aMember') : who,
      role: guideRole(items[0]),
      items,
    }));
  // The generated links are Raidex's own contribution, so they get the same
  // "By X" shape as a person — minus a role chip, since the app holds none.
  // Still only labelled when a named group exists to tell it from.
  if (standard.length) groups.push({ name: groups.length ? product : null, items: standard });
  return groups;
}

// Same wording and colour coding the raid card uses for its creator. Returns
// null when the author holds none of the three roles any more.
function guideRole(gd) {
  if (gd.createdByGM) return { cls: 'gm', label: t('role.gm') };
  if (gd.createdByLead) return { cls: 'lead', label: t('role.raidlead') };
  if (gd.createdByQM) return { cls: 'qm', label: t('calendar.qm') };
  return null;
}

function GuideChip({ gd, canManage, onDelete }) {
  const icon = gd.iconUrl || siteIcon(gd.site);
  return (
    <a className="guide-chip" href={gd.url} target="_blank" rel="noopener noreferrer">
      {icon ? <img src={icon} alt="" width="16" height="16" onError={(e) => { e.currentTarget.style.display = 'none'; }} /> : <span className="guide-ico">🔗</span>}
      <span>{gd.title}{gd.lang ? ` · ${gd.lang.toUpperCase()}` : ''}</span>
      {!gd.global && canManage && (
        <button className="guide-del" title={t('calendar.remove')} onClick={(e) => { e.preventDefault(); onDelete(); }}>×</button>
      )}
    </a>
  );
}

function GuidesPanel({ instance, data, onChanged }) {
  const { me } = useMe();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: '', url: '' });
  const [busy, setBusy] = useState(false);
  if (!instance) return null;
  const guides = data?.guides || [];
  const canManage = !!data?.canManage;

  const add = async () => {
    if (!form.url) return;
    setBusy(true);
    try { await api.addGuide({ instance, site: 'custom', title: form.title || t('calendar.guides'), url: form.url }); setForm({ title: '', url: '' }); setAdding(false); onChanged(); }
    finally { setBusy(false); }
  };
  const del = async (id) => { await api.deleteGuide(id); onChanged(); };

  const groups = groupGuides(guides, activeLocale(), me?.product || 'Raidex');

  return (
    <div className="guides">
      <div className="guides-head">
        <span className="section-title" style={{ margin: 0 }}>{t('calendar.guides')}</span>
        {canManage && <button className="btn btn-ghost btn-sm" onClick={() => setAdding((a) => !a)}>{adding ? t('common.cancel') : t('calendar.addGuide')}</button>}
      </div>
      {groups.map((grp) => (
        <div className="guide-group" key={grp.name || 'all'}>
          {grp.name && (
            <div className="guide-group-label">
              {t('calendar.by')} <b>{grp.name}</b>
              {grp.role && <span className={`rolechip sm ${grp.role.cls}`}>{grp.role.label}</span>}
            </div>
          )}
          <div className="guide-chips">
            {grp.items.map((gd, i) => (
              <GuideChip key={gd.id || 'g' + i} gd={gd} canManage={canManage} onDelete={() => del(gd.id)} />
            ))}
          </div>
        </div>
      ))}
      {adding && (
        <div className="guide-add">
          <input className="input" placeholder={t('calendar.guideTitle')} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <input className="input" placeholder="https://…" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
          <button className="btn btn-primary btn-sm" onClick={add} disabled={busy || !form.url}>{t('calendar.add')}</button>
        </div>
      )}
    </div>
  );
}

// Share dialog: mints a fresh, unique link on open (one key per share) so Discord
// and co. always unfurl anew, no stale embed cache.
function ShareDialog({ raid, onClose }) {
  const [url, setUrl] = useState(null);
  const [err, setErr] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef(null);
  useEffect(() => {
    let alive = true;
    api.createShareLink(raid.id)
      .then((res) => alive && setUrl(`${window.location.origin}${import.meta.env.BASE_URL}r/${res.token}`))
      .catch(() => alive && setErr(true));
    return () => { alive = false; };
  }, [raid.id]);
  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      inputRef.current?.select();
      document.execCommand?.('copy'); // fallback without Clipboard API permission
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <Modal title={t('calendar.share')} onClose={onClose}>
      <p className="muted" style={{ fontSize: 13, marginTop: 0, marginBottom: 12 }}>
        {t('calendar.shareHint')}
      </p>
      {err ? (
        <div className="muted" style={{ fontSize: 13 }}>{t('calendar.shareFailed')}</div>
      ) : !url ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 12 }}><Spinner /></div>
      ) : (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input ref={inputRef} className="input" readOnly value={url} style={{ flex: 1 }}
            onFocus={(e) => e.target.select()} />
          <button className="btn btn-primary" style={{ whiteSpace: 'nowrap' }} onClick={copy}>
            {copied ? t('calendar.copied') : t('calendar.copy')}
          </button>
        </div>
      )}
    </Modal>
  );
}

// The signed-up characters, in a panel of their own beside the raid card.
// It always renders, empty roster included: an absent panel would let the raid
// card stretch across the full row and make every card in the list a different
// width.
function RosterPanel({ raid, roster, bench, onRemove, onSignup, onEdit, onDelete, onShare }) {
  const total = roster.length + bench.reduce((n, g) => n + g.alts.length, 0);
  return (
    <div className="card raid-roster">
      <div className="section-title" style={{ margin: 0 }}>
        {t('calendar.lineup')} ({roster.length}{raid.max_size > 0 ? `/${raid.max_size}` : ''})
      </div>

      {total === 0 && <div className="roster-empty">{t('calendar.nobody')}</div>}

      <div className="roster-scroll">
        {roster.map((s) => (
          <div key={s.id} className="signup-row">
            <span className="dot" style={{ background: ROLES[s.role]?.color }} />
            <RoleIcon role={s.role} size={18} />
            <span style={{ fontWeight: 700, color: classColorByName(s.className) }}>{s.name || t('calendar.unknown')}</span>
            <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>
              {s.status === 'tentative' ? t('calendar.tentative') : ROLES[s.role]?.label}
            </span>
          </div>
        ))}

        {bench.length > 0 && (
          <div style={{ marginTop: roster.length ? 12 : 0 }}>
            <div className="section-title" style={{ marginBottom: 6 }}>{t('calendar.bench')}</div>
            {bench.map((g) => (
              <div key={g.userId} className="bench-group">
                <div className="bench-main">{g.mainName}</div>
                {g.alts.map((a) => (
                  <div key={a.id} className="signup-row bench-alt">
                    <span className="bench-branch">└</span>
                    <RoleIcon role={a.role} size={16} />
                    <span style={{ fontWeight: 700, color: classColorByName(a.className) }}>{a.name}</span>
                    <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>
                      {a.status === 'tentative' ? t('calendar.tentative') : ROLES[a.role]?.label}
                    </span>
                    {(a.mine || raid.canManage) && (
                      <button className="guide-del" title={t('calendar.removeAlt')} onClick={() => onRemove(a.id)}>×</button>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Signing up and managing the raid belong with the roster they change.
          Stacked rather than in one row: at the panel's ~440px of content width
          a label like "Angemeldet: Quartiermeister · ändern" alone needs about
          312px, leaving too little for the three buttons beside it. */}
      <div className="roster-actions">
        <button className={'btn ' + (raid.mySignup ? '' : 'btn-primary')} onClick={onSignup}>
          {raid.mySignup ? t('calendar.signedUp', { role: ROLES[raid.mySignup.role]?.label }) : t('calendar.signUp')}
        </button>
        <div className="roster-actions-row">
          <button className="btn btn-sm" title={t('calendar.shareTitle')} onClick={onShare}>
            {t('calendar.shareBtn')}
          </button>
          {raid.canManage && <button className="btn btn-sm" title={t('calendar.editRaid')} onClick={onEdit}>✎</button>}
          {raid.canManage && <button className="btn btn-sm btn-danger" title={t('calendar.deleteTitle')} onClick={onDelete}>🗑</button>}
        </div>
      </div>
    </div>
  );
}

function RaidCard({ raid, onSignup, onUpdated, onEdit, onDelete, guidesData, onGuidesChanged }) {
  const { color, emblem } = cover(raid);
  const diff = DIFFICULTIES[raid.difficulty];
  // Sorted here rather than in SQL: the ordering has to hold regardless of the
  // database's collation, which differs between the environments and would put
  // Á and Ü behind Z under a C collation. localeCompare('de') also treats
  // accented names the way a German reader expects — Éscóbar between Cosimo
  // and Fiona, not at the end.
  const roster = (raid.roster || [])
    .filter((s) => s.status !== 'absent')
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', lang));
  const bench = raid.bench || [];
  const [showShare, setShowShare] = useState(false);
  const removeSignup = async (signupId) => onUpdated(await api.removeSignup(raid.id, signupId));

  return (
    <>
    <div className="raid-pair" id={`raid-${raid.id}`}>
    <div className="card raid-card">
      <div className="cover" style={raid.image
        ? { backgroundImage: `linear-gradient(110deg, rgba(16,23,48,0.42), rgba(16,23,48,0.82)), url('${raid.image}')`, backgroundSize: 'cover', backgroundPosition: 'center' }
        : { background: `linear-gradient(135deg, ${color}, var(--surface-3))` }}>
        {!raid.image && <div style={{ position: 'absolute', right: 14, top: 8, fontSize: 54, opacity: 0.35 }}>{emblem}</div>}
        <div className="scrim" />
        {diff && <span className="diff role-badge" style={{ background: color }}>{diff.label}</span>}
        <div className="when">{formatDateTime(raid.starts_at)} · {countdown(raid.starts_at, raid.duration_min)}</div>
      </div>

      <div className="rc-body">
        <div>
          <h3 style={{ fontSize: 18 }}>{raid.title}</h3>
          {raid.instance && (
            <div className="muted" style={{ fontSize: 13 }}>
              {raid.instance} · {t('calendar.until', { time: formatClock(raid.starts_at + raid.duration_min * 60000) })}
            </div>
          )}
          {raid.createdByName && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <span className="muted" style={{ fontSize: 13 }}>{t('calendar.invitedBy')} <b style={{ color: 'var(--text)' }}>{raid.createdByName}</b></span>
              <span className={`rolechip ${raid.createdByGM ? 'gm' : raid.createdByLead ? 'lead' : raid.createdByQM ? 'qm' : ''}`}>
                {raid.createdByGM ? t('role.gm') : raid.createdByLead ? t('role.raidlead') : raid.createdByQM ? t('calendar.qm') : t('calendar.member')}
              </span>
            </div>
          )}
        </div>
        {raid.description && <p style={{ fontSize: 13.5, color: 'var(--text-dim)', margin: 0 }}>{raid.description}</p>}

        <RoleCounts counts={raid.counts} />

        <GuidesPanel instance={raid.instance} data={guidesData} onChanged={onGuidesChanged} />

      </div>
    </div>

    <RosterPanel raid={raid} roster={roster} bench={bench} onRemove={removeSignup}
      onSignup={onSignup} onEdit={onEdit} onDelete={onDelete} onShare={() => setShowShare(true)} />
    </div>
    {showShare && <ShareDialog raid={raid} onClose={() => setShowShare(false)} />}
    </>
  );
}

function SignupModal({ raid, onClose, onChange }) {
  const { me } = useMe();
  const [chars, setChars] = useState(null);
  const [mode, setMode] = useState('main'); // 'main' (line-up) | 'alt' (bench)
  const [charId, setCharId] = useState(
    raid.mySignup?.realm && raid.mySignup?.name
      ? `${raid.mySignup.realm}:${raid.mySignup.name.toLowerCase()}`
      : me.activeCharacter?.id || '',
  );
  const [role, setRole] = useState(raid.mySignup?.role || 'dps');
  const [status, setStatus] = useState(raid.mySignup?.status || 'confirmed');
  const [note, setNote] = useState(raid.mySignup?.note || '');
  const [busy, setBusy] = useState(false);
  const myAlts = raid.myAlts || [];

  useEffect(() => {
    let alive = true;
    api.characters()
      .then((list) => {
        if (!alive) return;
        setChars(list);
        setCharId((cur) => cur || me.activeCharacter?.id || list[0]?.id || '');
      })
      .catch(() => alive && setChars([]));
    return () => { alive = false; };
  }, []);

  const picked = chars?.find((c) => c.id === charId);
  const isAlt = mode === 'alt';

  async function save() {
    setBusy(true);
    try {
      const updated = await api.signup(raid.id, {
        role, status, note, charId, isAlt,
        charName: picked?.name, charRealm: picked?.realmSlug, charClass: picked?.className,
      });
      onChange(updated);
      if (!isAlt) onClose(); // adding a Twink keeps the dialog open for more
    } finally { setBusy(false); }
  }
  async function withdraw() {
    setBusy(true);
    try { onChange(await api.withdraw(raid.id)); onClose(); }
    finally { setBusy(false); }
  }
  async function removeAlt(id) {
    setBusy(true);
    try { onChange(await api.removeSignup(raid.id, id)); }
    finally { setBusy(false); }
  }

  return (
    <Modal title={t('calendar.signupTitle', { title: raid.title })} onClose={onClose}>
      <div className="seg" style={{ marginBottom: 14 }}>
        <button className={!isAlt ? 'on' : ''} onClick={() => setMode('main')}>{t('calendar.modeMain')}</button>
        <button className={isAlt ? 'on' : ''} onClick={() => setMode('alt')}>{t('calendar.modeAlt')}</button>
      </div>

      <div className="field">
        <label>{t('calendar.character')}</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="dot" style={{ width: 12, height: 12, background: picked ? classColorByName(picked.className) : 'var(--surface-3)' }} />
          <Dropdown value={charId} onChange={setCharId} disabled={!chars}
            placeholder={!chars ? t('calendar.loading') : t('calendar.noChar')}
            options={[...(chars || [])].sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({
              value: c.id, label: t('calendar.charOption', { name: c.name, cls: c.className, level: c.level }),
            }))} />
        </div>
        <span className="muted" style={{ fontSize: 12 }}>
          {isAlt ? t('calendar.altHint') : t('calendar.mainHint')}
        </span>
      </div>
      <div className="field">
        <label>{t('calendar.role')}</label>
        <div className="seg">
          {Object.entries(ROLES).map(([key, r]) => (
            <button key={key} className={role === key ? 'on' : ''}
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, ...(role === key ? { background: r.color } : {}) }}
              onClick={() => setRole(key)}>
              <RoleIcon role={key} size={20} />{r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>{t('calendar.status')}</label>
        <Dropdown value={status} onChange={setStatus} options={[
          { value: 'confirmed', label: t('calendar.confirmed') },
          { value: 'tentative', label: t('calendar.tentative') },
          { value: 'absent', label: t('calendar.absent') },
        ]} />
      </div>

      <div className="field">
        <label>{t('calendar.note')}</label>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)}
          placeholder={t('calendar.notePlaceholder')} />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={save} disabled={busy || !charId}>
          {isAlt ? t('calendar.addAlt') : raid.mySignup ? t('calendar.update') : t('calendar.signUp')}
        </button>
        {!isAlt && raid.mySignup && <button className="btn btn-danger" onClick={withdraw} disabled={busy}>{t('calendar.withdraw')}</button>}
      </div>

      {myAlts.length > 0 && (
        <div className="field" style={{ marginTop: 16 }}>
          <label>{t('calendar.yourAlts')}</label>
          {myAlts.map((a) => (
            <div key={a.id} className="signup-row">
              <span style={{ fontSize: 13 }}>{ROLES[a.role]?.icon}</span>
              <span style={{ fontWeight: 700, color: classColorByName(a.className) }}>{a.name}</span>
              <button className="guide-del" style={{ marginLeft: 'auto' }} title={t('calendar.remove')} onClick={() => removeAlt(a.id)} disabled={busy}>×</button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function RaidForm({ raid, onClose, onSaved }) {
  const isNew = !raid.id;
  const startDefault = raid.starts_at || Date.now() + 2 * 86400000;
  const [f, setF] = useState({
    title: raid.title || '',
    instance: raid.instance || '',
    difficulty: raid.difficulty || 'heroic',
    starts_at: toLocalInput(startDefault),
    ende: toTimeInput(startDefault + (raid.duration_min || 120) * 60000),
    min_size: raid.min_size ?? 10,
    max_size: raid.max_size ?? 20,
    description: raid.description || '',
  });
  // Raid vs. Dungeon — switches the instance dropdown between the two lists.
  const [kind, setKind] = useState(raid.difficulty === 'mplus' ? 'dungeon' : 'raid');
  const [instancesBy, setInstancesBy] = useState({ raid: null, dungeon: null });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const instances = instancesBy[kind];
  const fallbackDiffs = kind === 'dungeon' ? ['normal', 'heroic', 'mythic', 'mplus'] : ['lfr', 'normal', 'heroic', 'mythic'];

  useEffect(() => {
    Promise.all([api.raidInstances(), api.dungeonInstances()])
      .then(([raids, dungeons]) => {
        setInstancesBy({ raid: raids, dungeon: dungeons });
        if (raid.instance) {
          // For an existing entry, open on the toggle whose list holds its instance.
          const inD = dungeons.some((i) => i.name === raid.instance);
          const inR = raids.some((i) => i.name === raid.instance);
          if (inD && !inR) setKind('dungeon'); else if (inR) setKind('raid');
        } else {
          // Default a new entry to the newest instance of the active kind.
          const list = raid.difficulty === 'mplus' ? dungeons : raids;
          setF((prev) => (prev.instance ? prev : { ...prev, instance: list[0]?.name || '' }));
        }
      })
      .catch(() => setInstancesBy({ raid: [], dungeon: [] }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Difficulties available for the chosen instance (fallback to the full set).
  const chosen = instances?.find((i) => i.name === f.instance);
  const availDiffs = chosen?.difficulties?.length ? chosen.difficulties : fallbackDiffs;
  const onInstance = (e) => {
    const name = e.target.value;
    const inst = instances?.find((i) => i.name === name);
    const diffs = inst?.difficulties?.length ? inst.difficulties : fallbackDiffs;
    setF((prev) => ({ ...prev, instance: name, difficulty: diffs.includes(prev.difficulty) ? prev.difficulty : diffs[diffs.length - 1] }));
  };
  const switchKind = (k) => {
    if (k === kind) return;
    setKind(k);
    const first = (instancesBy[k] || [])[0];
    const diffs = first?.difficulties?.length ? first.difficulties : (k === 'dungeon' ? ['normal', 'heroic', 'mythic', 'mplus'] : ['lfr', 'normal', 'heroic', 'mythic']);
    setF((prev) => ({ ...prev, instance: first?.name || '', difficulty: diffs.includes(prev.difficulty) ? prev.difficulty : diffs[diffs.length - 1] }));
  };

  async function submit() {
    setBusy(true);
    try {
      const startMs = new Date(f.starts_at).getTime();
      const payload = {
        title: f.title, instance: f.instance, difficulty: f.difficulty,
        starts_at: startMs,
        duration_min: durationFromEnd(startMs, f.ende),
        min_size: Math.max(1, Number(f.min_size) || 10),
        max_size: Math.max(0, Number(f.max_size) || 0),
        description: f.description,
      };
      if (isNew) await api.createRaid(payload);
      else await api.updateRaid(raid.id, payload);
      onSaved();
    } finally { setBusy(false); }
  }

  return (
    <Modal title={isNew ? t('calendar.newRaidTitle') : t('calendar.editRaid')} onClose={onClose}>
      <div className="field">
        <label>{t('dashboard.cardTitle')}</label>
        <input className="input" value={f.title} onChange={set('title')} placeholder={t('calendar.raidTitlePlaceholder')} />
      </div>
      <div className="field">
        <label>{t('calendar.type')}</label>
        <div className="seg">
          <button className={kind === 'raid' ? 'on' : ''} onClick={() => switchKind('raid')}>{t('calendar.raid')}</button>
          <button className={kind === 'dungeon' ? 'on' : ''} onClick={() => switchKind('dungeon')}>{t('calendar.dungeon')}</button>
        </div>
      </div>
      <div className="row">
        <div className="field">
          <label>{kind === 'dungeon' ? t('calendar.dungeon') : t('calendar.raid')}</label>
          <InstanceCombobox
            instances={instances} value={f.instance}
            placeholder={kind === 'dungeon' ? t('calendar.searchDungeon') : t('calendar.searchRaid')}
            onSelect={(name) => onInstance({ target: { value: name } })}
          />
        </div>
        <div className="field">
          <label>{t('calendar.difficulty')}</label>
          <Dropdown value={f.difficulty} onChange={(v) => setF((prev) => ({ ...prev, difficulty: v }))}
            options={availDiffs.map((k) => ({ value: k, label: DIFFICULTIES[k]?.label || k }))} />
        </div>
      </div>
      <div className="row">
        <div className="field">
          <label>{t('calendar.start')}</label>
          <DateTimeField value={f.starts_at} onChange={(v) => setF((prev) => ({ ...prev, starts_at: v }))} />
        </div>
        <div className="field">
          <label>{t('calendar.end')}</label>
          <TimeField value={f.ende} label={t('calendar.end')} onChange={(v) => setF((prev) => ({ ...prev, ende: v }))} />
        </div>
      </div>
      <div className="row">
        <div className="field">
          <label>{t('calendar.minSize')}</label>
          <input className="input" type="number" min="1" value={f.min_size} onChange={set('min_size')} />
        </div>
        <div className="field">
          <label>{t('calendar.maxSize')} <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>{t('calendar.optional')}</span></label>
          <input className="input" type="number" min="0" value={f.max_size} onChange={set('max_size')} placeholder={t('calendar.noLimit')} />
        </div>
      </div>
      <div className="field">
        <label>{t('calendar.description')}</label>
        <textarea className="textarea" value={f.description} onChange={set('description')} />
      </div>
      <button className="btn btn-primary" style={{ width: '100%' }} onClick={submit} disabled={busy || !f.title}>
        {isNew ? t('calendar.createRaid') : t('calendar.save')}
      </button>
    </Modal>
  );
}
