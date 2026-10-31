// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState, useEffect } from 'react';
import { Routes, Route, NavLink, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { registerWebPush } from './lib/webpush.js';
import {
  mdiViewDashboardOutline, mdiCalendarMonthOutline, mdiAccountGroupOutline,
  mdiSwordCross, mdiAccountCircleOutline, mdiShieldCrownOutline, mdiMenu,
} from '@mdi/js';
import { useMe } from './lib/store.jsx';
import { classColorByName, factionColor, factionLabel, formatNumber } from './lib/wow.js';
import Dropdown from './components/Dropdown.jsx';
import { FactionEmblem } from './components/CharacterSheet.jsx';
import { api, LOGIN_URL } from './lib/api.js';
import Modal from './components/Modal.jsx';
import Login from './views/Login.jsx';
import Dashboard from './views/Dashboard.jsx';
import Characters from './views/Characters.jsx';
import Profile from './views/Profile.jsx';
import Roster from './views/Roster.jsx';
import Calendar from './views/Calendar.jsx';
import Impressum from './views/Impressum.jsx';
import Datenschutz from './views/Datenschutz.jsx';
import About from './views/About.jsx';
import Guilds from './views/Guilds.jsx';
import Onboarding from './views/Onboarding.jsx';
import ConnectKeys from './views/ConnectKeys.jsx';
import { t } from './i18n/index.js';

// Same MaterialCommunityIcons glyphs as the Android app's navigation.
function Icon({ path, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ flexShrink: 0 }} aria-hidden="true">
      <path d={path} fill="currentColor" />
    </svg>
  );
}

const NAV = [
  { to: '/', label: t('nav.dashboard'), end: true, icon: mdiViewDashboardOutline },
  { to: '/calendar', label: t('nav.calendar'), icon: mdiCalendarMonthOutline },
  { to: '/roster', label: t('nav.roster'), icon: mdiAccountGroupOutline },
  { to: '/characters', label: t('nav.characters'), icon: mdiSwordCross },
  { to: '/profile', label: t('nav.profile'), icon: mdiAccountCircleOutline },
];
// Every guild on the instance, not just this user's — an operator's view, so it
// only joins the navigation for the BattleTag in admin_battletags. Last, after
// the entries everyone has.
const OPERATOR_NAV = { to: '/guilds', label: t('nav.guilds'), icon: mdiShieldCrownOutline };
const navFor = (me) => (me?.user?.isSuperadmin ? [...NAV, OPERATOR_NAV] : NAV);

const LEGAL = [
  { to: '/impressum', label: t('nav.impressum') },
  { to: '/datenschutz', label: t('nav.privacy') },
  { to: '/about', label: t('nav.about') },
];

function GuildPicker() {
  const { me, refresh } = useMe();
  const guilds = me.guilds || [];
  const activeId = me.activeGuild?.id;
  if (guilds.length < 2) return null;
  const onChange = async (id) => {
    if (id === activeId) return;
    await api.selectGuild(id);
    await refresh();
  };
  return (
    <div className="guild-picker" style={{ margin: '0 6px 10px' }} title={t('nav.switchGuild')}>
      <Dropdown value={activeId || ''} onChange={onChange}
        options={guilds.map((g) => ({
          value: g.id,
          icon: <FactionEmblem faction={g.faction} />,
          label: `${g.displayName} · ${g.realmName}`,
        }))} />
    </div>
  );
}

function Drawer({ open, onClose }) {
  const { me, logout } = useMe();
  const active = me.activeCharacter;
  const guild = me.activeGuild;
  return (
    <>
      <div className={'drawer-scrim' + (open ? ' open' : '')} onClick={onClose} />
      <aside className={'drawer' + (open ? ' open' : '')}>
        <div className="drawer-brand">
          <img src="/appicon.svg" alt="Raidex"
            style={guild?.faction ? { boxShadow: `0 0 0 2px ${factionColor(guild.faction)}` } : undefined} />
          <div style={{ minWidth: 0 }}>
            <div className="brand-name">RAIDEX</div>
            <div className="brand-sub">{guild ? `${guild.displayName}` : t('nav.guildPortal')}</div>
          </div>
        </div>

        <GuildPicker />

        <nav className="drawer-nav">
          {navFor(me).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} onClick={onClose}
              className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
              <Icon path={n.icon} size={22} />
              <span className="txt">{n.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="drawer-spacer" />

        <div className="user-chip" style={{ margin: '0 4px 8px' }}>
          {active?.images?.avatar
            ? <img className="avatar avatar-ring" src={active.images.avatar} alt=""
                style={active ? { borderColor: classColorByName(active.className) } : undefined} />
            : <div className="avatar avatar-ring" style={{ background: 'var(--surface-3)', borderColor: active ? classColorByName(active.className) : 'var(--accent)' }} />}
          <div style={{ minWidth: 0 }}>
            <div className="bt" style={active ? { color: classColorByName(active.className) } : undefined}>
              {active ? active.name : me.user.battletag}
            </div>
            <div className="role">{me.user.isGM ? t('role.gm') : me.user.isAdmin ? t('role.raidlead') : t('role.member')}</div>
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" style={{ margin: '0 4px' }} onClick={logout}>{t('nav.logout')}</button>

        <div className="drawer-legal">
          {LEGAL.map((n) => (
            <NavLink key={n.to} to={n.to} onClick={onClose} className="drawer-legal-link">{n.label}</NavLink>
          ))}
        </div>
      </aside>
    </>
  );
}

function GuildProfileModal({ guild, onClose }) {
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
      <div className="grid cols-3" style={{ marginBottom: 12 }}>
        {[[t('guild.members'), guild.memberCount], [t('guild.achievementPoints'), guild.achievementPoints], [t('guild.scanned'), guild.scannedChars]].map(([l, v]) => (
          <div key={l} className="card card-pad" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{v != null ? formatNumber(v) : '—'}</div>
            <div className="muted" style={{ fontSize: 12 }}>{l}</div>
          </div>
        ))}
      </div>
      <div className="muted" style={{ fontSize: 13 }}>{t('guild.scanStatus')}: {guild.scanning ? t('guild.scanRunning') : t('guild.scanCurrent')}</div>
    </Modal>
  );
}

function Shell() {
  const { me } = useMe();
  const [open, setOpen] = useState(false);
  const [guildOpen, setGuildOpen] = useState(false);
  const guild = me.activeGuild;
  useEffect(() => { registerWebPush(); }, []);
  return (
    <div className="app-shell">
      {me.user.isDemo && (
        <div className="demo-bar">
          <span>{t('demo.bar')}</span>
          <a className="btn btn-bnet" href={LOGIN_URL}>{t('demo.bnetLogin')}</a>
        </div>
      )}
      <header className="topbar">
        <div className="topbar-inner">
          {/* The drawer used to open from the logo alone, which nobody could
              guess — hence the explicit hamburger in front of the brand. */}
          <button className="menu-btn" onClick={() => setOpen(true)} aria-label={t('nav.openMenu')} aria-expanded={open}>
            <Icon path={mdiMenu} size={26} />
          </button>
          <img className="topbar-logo" src="/appicon.svg" alt="" />
          <span className="topbar-title">RAIDEX</span>
          <nav className="topbar-nav">
            {navFor(me).map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end}
                className={({ isActive }) => 'topnav-link' + (isActive ? ' active' : '')}>
                <Icon path={n.icon} size={18} />
                <span>{n.label}</span>
              </NavLink>
            ))}
          </nav>
          {guild && (
            <button className="topbar-guild topbar-guild-btn" onClick={() => setGuildOpen(true)} title={t('nav.guildProfile')}>
              {guild.crestEmblemUrl && <img src={guild.crestEmblemUrl} alt="" style={{ width: 20, height: 20, verticalAlign: 'middle', marginRight: 6 }} />}
              {guild.displayName}
            </button>
          )}
        </div>
      </header>

      {guildOpen && guild && <GuildProfileModal guild={guild} onClose={() => setGuildOpen(false)} />}
      <Drawer open={open} onClose={() => setOpen(false)} />

      <main className="main">
        <div className="content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/roster" element={<Roster />} />
            <Route path="/characters" element={<Characters />} />
            <Route path="/profile" element={<Profile />} />
            {me.user.isSuperadmin && <Route path="/guilds" element={<Guilds />} />}
            <Route path="/impressum" element={<Impressum />} />
            <Route path="/datenschutz" element={<Datenschutz />} />
            <Route path="/about" element={<About />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

// Impressum and Datenschutz have to be reachable without a login — they are
// linked from the landing page footer, and a legal notice behind a login is no
// legal notice. Logged out, App() otherwise renders <Login /> with no router at
// all, so those links would go nowhere.
function PublicLegal({ children }) {
  return (
    <div className="legal-page">
      <div className="content">
        {children}
        <NavLink to="/" className="drawer-legal-link" style={{ display: 'inline-block', marginTop: 24 }}>{t('nav.back')}</NavLink>
      </div>
    </div>
  );
}

// Raidex Keys sends people to /verbinden?code=…. Logged out, they log in first
// - through Battle.net, which lands on "/" - so the address waits in the tab's
// sessionStorage and is taken up once the login is through.
const RETURN_KEY = 'raidex.returnTo';
function useReturnAfterLogin(loggedIn) {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (!loggedIn && location.pathname === '/verbinden') {
      sessionStorage.setItem(RETURN_KEY, location.pathname + location.search);
    } else if (loggedIn) {
      const back = sessionStorage.getItem(RETURN_KEY);
      if (back) {
        sessionStorage.removeItem(RETURN_KEY);
        navigate(back, { replace: true });
      }
    }
  }, [loggedIn]); // eslint-disable-line react-hooks/exhaustive-deps
}

export default function App() {
  const { me, loading } = useMe();
  const location = useLocation();
  useReturnAfterLogin(!loading && !!me?.user);
  if (loading) return <div className="spinner" />;
  // Connecting Raidex Keys needs no main character, only the login.
  if (me?.user && location.pathname === '/verbinden') return <ConnectKeys />;
  if (!me?.user) {
    return (
      <Routes>
        <Route path="/impressum" element={<PublicLegal><Impressum /></PublicLegal>} />
        <Route path="/datenschutz" element={<PublicLegal><Datenschutz /></PublicLegal>} />
        <Route path="/about" element={<PublicLegal><About /></PublicLegal>} />
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }
  // No main character → no active guild → an app that is empty on every page and
  // never triggers its own guild scan. Nothing in the UI used to say so, so the
  // choice is a gate now rather than a setting to find. The legal pages stay
  // reachable through it, same as when logged out.
  if (me.needsMain) {
    return (
      <Routes>
        <Route path="/impressum" element={<PublicLegal><Impressum /></PublicLegal>} />
        <Route path="/datenschutz" element={<PublicLegal><Datenschutz /></PublicLegal>} />
        <Route path="/about" element={<PublicLegal><About /></PublicLegal>} />
        <Route path="*" element={<Onboarding />} />
      </Routes>
    );
  }
  return <Shell />;
}
