// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMe } from '../lib/store.jsx';
import { api, LOGIN_URL } from '../lib/api.js';
import { t, lang } from '../i18n/index.js';

const FEATURES = [
  ['🗓️', t('login.f.calendar'), t('login.f.calendarBody')],
  ['🛡️', t('login.f.roster'), t('login.f.rosterBody')],
  ['⚔️', t('login.f.profiles'), t('login.f.profilesBody')],
  ['🔑', t('login.f.live'), t('login.f.liveBody')],
];

// Addon promos on the landing page, leaderboard images per UI language with a 2x variant in
// public/img/addons. Served from our own docroot, so the page makes no
// third-party request until someone clicks through.
//
// Paths and class names deliberately avoid "banner", "ad" and the 728x90 size:
// EasyList blocks both /banners/ and *-728x90.* outright, and ad blockers then
// swap the images for a transparent pixel while the dots stay put.
const ADDONS = [
  { slug: 'tallymaster', name: 'Tallymaster', href: 'https://www.curseforge.com/wow/addons/tallymaster' },
  { slug: 'wowhead-comments', name: 'Wowhead Comments', href: 'https://www.curseforge.com/wow/addons/wowhead-comments' },
];
const ADDON_INTERVAL_MS = 5000;

export default function Login() {
  const { refresh } = useMe();
  const params = new URLSearchParams(window.location.search);
  const loginError = params.get('login_error');
  const verified = params.get('verified');

  const [mode, setMode] = useState('register'); // 'register' | 'login'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(null); // 'email'
  const [msg, setMsg] = useState(verified === '1' ? { ok: true, text: t('login.verified') } : null);

  const submitEmail = async (e) => {
    e.preventDefault();
    setBusy('email'); setMsg(null);
    try {
      if (mode === 'register') {
        const r = await api.register(email, password);
        setMsg({
          ok: true,
          text: r.mailed
            ? t('login.mailed')
            : t('login.notMailed'),
          link: r.verifyUrl,
        });
        setMode('login');
      } else {
        await api.emailLogin(email, password);
        await refresh();
        return;
      }
    } catch (err) {
      const known = ['invalid_email', 'weak_password', 'email_taken', 'not_verified', 'invalid_credentials'];
      setMsg({ ok: false, text: known.includes(err.message) ? t(`login.err.${err.message}`) : t('login.err.generic') });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="landing">
      <div className="landing-inner">
        <section className="landing-hero">
          <img src="/logomark.svg" alt="" className="landing-logo" />
          <h1 className="landing-title">RAIDEX</h1>
          <p className="landing-kicker">{t('login.kicker')}</p>
          <p className="landing-lead">
            {t('login.lead')}
          </p>

          <div className="feature-grid">
            {FEATURES.map(([icon, title, body]) => (
              <div key={title} className="feature">
                <div className="feature-ico">{icon}</div>
                <div>
                  <div className="feature-title">{title}</div>
                  <div className="feature-body">{body}</div>
                </div>
              </div>
            ))}
          </div>

          <AddonRotator />
        </section>

        <section className="auth-card card">
          <h2 className="auth-h">{t('login.start')}</h2>

          {loginError && <div className="auth-msg err">{t('login.bnetFailed')}</div>}
          {msg && (
            <div className={'auth-msg ' + (msg.ok ? 'ok' : 'err')}>
              {msg.text}
              {msg.link && <> <a href={msg.link}>{t('login.confirmMail')}</a></>}
            </div>
          )}

          <a className="btn btn-bnet auth-bnet" href={LOGIN_URL}>{t('login.bnet')}</a>
          <button type="button" className="auth-switch" onClick={() => {
            // Kurz bei Battle.net abmelden, dann Login mit Kontoauswahl (switch=1).
            const w = window.open('https://oauth.battle.net/logout', '_blank', 'width=480,height=620');
            setTimeout(() => { try { if (w) w.close(); } catch { /* noop */ } window.location.href = `${LOGIN_URL}?switch=1`; }, 2500);
          }}>{t('login.bnetSwitch')}</button>
          <div className="auth-hint">{t('login.bnetHint')}</div>

          <div className="auth-divider"><span>{t('login.orDemo')}</span></div>

          <form className="auth-email" onSubmit={submitEmail}>
            <input className="input" type="email" placeholder={t('login.email')} required
              value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            <input className="input" type="password" placeholder={t('login.password')} required minLength={8}
              value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} />
            <button className="btn btn-primary" type="submit" disabled={!!busy}>
              {busy === 'email' ? t('login.wait') : mode === 'register' ? t('login.createDemo') : t('login.login')}
            </button>
          </form>
          <div className="auth-toggle">
            {mode === 'register'
              ? <>{t('login.haveDemo')} <button onClick={() => { setMode('login'); setMsg(null); }}>{t('login.login')}</button></>
              : <>{t('login.newHere')} <button onClick={() => { setMode('register'); setMsg(null); }}>{t('login.createDemo')}</button></>}
          </div>

          <p className="auth-note">
            {t('login.note')}
          </p>
        </section>
      </div>

      <footer className="landing-foot">
        <div className="landing-foot-copy">
          © 2026 <a href="https://www.lasse-tech.de" target="_blank" rel="noopener noreferrer">lasse tech</a> · Lars Gossard
        </div>
        <div className="landing-foot-links">
          <Link to="/impressum">{t('nav.impressum')}</Link>
          <span aria-hidden="true">·</span>
          <Link to="/datenschutz">{t('nav.privacy')}</Link>
          <span aria-hidden="true">·</span>
          <Link to="/about">{t('nav.about')}</Link>
        </div>
      </footer>
    </div>
  );
}

// Cross-fades through ADDONS. Hovering or focusing the strip holds it, and
// picking one from the dots restarts the interval, since the timer is keyed on
// the index.
function AddonRotator() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || ADDONS.length < 2) return undefined;
    const timer = setTimeout(() => setIndex((i) => (i + 1) % ADDONS.length), ADDON_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [index, paused]);

  return (
    <div className="addons"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <div className="addons-stage">
        {ADDONS.map((b, i) => (
          <a key={b.slug} href={b.href} target="_blank" rel="noopener noreferrer"
            className={'addons-slide' + (i === index ? ' on' : '')}>
            <img src={`/img/addons/${b.slug}-wide-${lang}.png`}
              srcSet={`/img/addons/${b.slug}-wide-${lang}.png 1x, /img/addons/${b.slug}-wide-${lang}@2x.png 2x`}
              width="728" height="90" alt={t('login.addonAlt', { name: b.name })} />
          </a>
        ))}
      </div>
      {ADDONS.length > 1 && (
        <div className="addons-dots">
          {ADDONS.map((b, i) => (
            <button key={b.slug} type="button" className={'addons-dot' + (i === index ? ' on' : '')}
              aria-label={t('login.addonDot', { n: i + 1, total: ADDONS.length, name: b.name })} aria-current={i === index}
              onClick={() => setIndex(i)} />
          ))}
        </div>
      )}
    </div>
  );
}
