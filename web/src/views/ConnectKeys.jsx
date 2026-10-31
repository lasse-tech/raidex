// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMe } from '../lib/store.jsx';
import { api } from '../lib/api.js';
import { t } from '../i18n/index.js';

// Raidex Keys, the desktop companion, connects to this account here: the app
// opened /verbinden?code=… and shows the same code; the user confirms it with
// one click (api/keys.php, "connecting the app"). The code can also be typed.
export default function ConnectKeys() {
  const { me, logout } = useMe();
  const navigate = useNavigate();
  const fromUrl = (new URLSearchParams(window.location.search).get('code') || '').toUpperCase();
  const [code, setCode] = useState(fromUrl);
  const [state, setState] = useState(fromUrl ? 'checking' : 'enter'); // enter|checking|pending|approved|denied|unknown
  const [busy, setBusy] = useState(false);

  const check = async (c) => {
    setState('checking');
    try {
      const r = await api.connectInfo(c);
      setState(r.status === 'pending' ? 'pending' : r.status);
    } catch {
      setState('unknown');
    }
  };
  useEffect(() => { if (fromUrl) check(fromUrl); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const decide = async (approve) => {
    setBusy(true);
    try {
      const r = approve ? await api.connectApprove(code) : await api.connectDeny(code);
      setState(r.status);
    } catch {
      setState('unknown');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="onboarding">
      <div className="content">
        <div className="onboarding-hero">
          <img src="/logomark.svg" alt="" className="onboarding-logo" />
          <div>
            <div className="onboarding-kicker">{t('connect.kicker')}</div>
            <h1 className="onboarding-title">{t('connect.title')}</h1>
          </div>
        </div>

        <div className="card card-pad" style={{ maxWidth: 560 }}>
          {state === 'enter' && (
            <form onSubmit={(e) => { e.preventDefault(); check(code.trim()); }}>
              <p>{t('connect.enter')}</p>
              <div className="row" style={{ gap: 10, marginTop: 12 }}>
                <input className="input" value={code} placeholder="ABCD-2345" autoFocus
                       onChange={(e) => setCode(e.target.value.toUpperCase())} style={{ fontFamily: 'var(--font-mono, monospace)', letterSpacing: 2 }} />
                <button className="btn btn-primary" disabled={code.trim().length < 9}>{t('common.continue')}</button>
              </div>
            </form>
          )}
          {state === 'checking' && <p className="muted">{t('common.wait')}</p>}
          {state === 'pending' && (
            <>
              <p>{t('connect.pending')}</p>
              <p className="muted" style={{ marginTop: 12 }}>{t('connect.matches')}</p>
              <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 30, letterSpacing: 4, margin: '10px 0 18px' }}>{code}</div>
              <div className="row" style={{ gap: 10 }}>
                <button className="btn btn-primary" disabled={busy} onClick={() => decide(true)}>{t('connect.connect')}</button>
                <button className="btn btn-ghost" disabled={busy} onClick={() => decide(false)}>{t('common.cancel')}</button>
              </div>
            </>
          )}
          {state === 'approved' && (
            <>
              <p>{t('connect.approved')}</p>
              <button className="btn btn-ghost" style={{ marginTop: 14 }} onClick={() => navigate('/', { replace: true })}>{t('connect.toRaidex')}</button>
            </>
          )}
          {state === 'denied' && <p>{t('connect.denied')}</p>}
          {state === 'unknown' && (
            <>
              <p>{t('connect.unknown')}</p>
              <button className="btn btn-ghost" style={{ marginTop: 14 }} onClick={() => { setCode(''); setState('enter'); }}>{t('connect.enterCode')}</button>
            </>
          )}
        </div>

        <div className="onboarding-foot">
          <span>{t('common.loggedInAs')} <b>{me.user.battletag}</b></span>
          <button className="btn btn-ghost btn-sm" onClick={logout}>{t('nav.logout')}</button>
          <span className="onboarding-legal">
            <Link to="/impressum">{t('nav.impressum')}</Link>
            <span aria-hidden="true">·</span>
            <Link to="/datenschutz">{t('nav.privacy')}</Link>
          </span>
        </div>
      </div>
    </div>
  );
}
