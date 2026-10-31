// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useState, useCallback } from 'react';
import { api, LOGIN_URL } from '../lib/api.js';
import { useMe } from '../lib/store.jsx';
import { classColorByName, formatNumber, mplusColor, countdown, CLASS_NAMES } from '../lib/wow.js';
import { Spinner } from '../components/bits.jsx';
import { t } from '../i18n/index.js';

// `onboarding` is the same screen in its gate role: it is what a user without a
// main sees instead of the app, so it explains what the choice decides rather
// than just listing characters. See Onboarding.jsx.
export default function Characters({ onboarding = false }) {
  const { me, refresh } = useMe();
  const [chars, setChars] = useState(null);
  const [selecting, setSelecting] = useState(null);
  const [reloadInfo, setReloadInfo] = useState(null); // { remaining, nextAt }
  const [reloading, setReloading] = useState(false);
  const [linkError, setLinkError] = useState(null); // 'bnet_reauth_required' | 'bnet_unavailable'
  const [, setTick] = useState(0);
  const activeId = me.activeCharacter?.id;

  const load = useCallback(async (force = false) => {
    const list = await api.characters();
    setLinkError(null);
    clearReauthGuard(); // the link works, so a later expiry gets its own attempt
    setChars(list.map((c) => ({ ...c, loading: true })));
    await Promise.all(
      list.slice(0, 16).map(async (c) => {
        try {
          const d = await api.character(c.realmSlug, c.name, force);
          setChars((prev) => prev?.map((x) => (x.id === c.id ? { ...x, ...d, loading: false } : x)));
        } catch {
          setChars((prev) => prev?.map((x) => (x.id === c.id ? { ...x, loading: false } : x)));
        }
      }),
    );
  }, []);

  useEffect(() => {
    load(false).catch((e) => {
      const err = linkErrorOf(e);
      // Mid-redirect there is nothing to show: leaving the spinner up beats
      // flashing an error message for the fraction of a second it takes.
      if (err === 'bnet_reauth_required' && tryAutoReauth()) return;
      setLinkError(err);
      setChars([]);
    });
    api.reloadStatus().then(setReloadInfo).catch(() => {});
  }, [load]);

  // Tick the countdown; refetch the budget once the window frees.
  useEffect(() => {
    const id = setInterval(() => {
      setTick((x) => x + 1);
      setReloadInfo((info) => {
        if (info?.nextAt && Date.now() >= info.nextAt) api.reloadStatus().then(setReloadInfo).catch(() => {});
        return info;
      });
    }, 30000);
    return () => clearInterval(id);
  }, []);

  const reload = useCallback(async () => {
    let info = reloadInfo;
    try { info = await api.reloadStatus(); setReloadInfo(info); } catch {}
    if (info && info.remaining <= 0) return;
    setReloading(true);
    try {
      const s = await api.reloadCharacters();
      setReloadInfo(s);
      await load(true); await refresh();
    } catch (e) {
      if (e?.status === 429) { try { setReloadInfo(await api.reloadStatus()); } catch {} }
      else setLinkError(linkErrorOf(e));
    } finally { setReloading(false); }
  }, [reloadInfo, load, refresh]);

  async function select(id) {
    setSelecting(id);
    try {
      await api.selectCharacter(id);
      await refresh();
    } finally {
      setSelecting(null);
    }
  }

  if (!chars) return <Spinner />;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{onboarding ? t('characters.pickMain') : t('characters.yours')}</h1>
          <div className="page-sub">
            {onboarding
              ? t('characters.subOnboarding')
              : t('characters.sub')}
          </div>
        </div>
        {linkError !== 'bnet_reauth_required' && (() => {
          const blocked = !!(reloadInfo && reloadInfo.remaining <= 0 && reloadInfo.nextAt);
          return (
            <button className="btn btn-sm" onClick={reload} disabled={reloading || blocked}
              title={blocked ? t('characters.nextReload') : t('characters.reloadTitle')}>
              {reloading ? t('characters.reloading') : blocked ? `🕐 ${countdown(reloadInfo.nextAt)}` : t('characters.reload')}
            </button>
          );
        })()}
      </div>

      {linkError === 'bnet_reauth_required' && (
        <div className="center-msg">
          {t('characters.reauth')}
          <div style={{ marginTop: 14 }}>
            <a className="btn btn-primary btn-sm" href={LOGIN_URL}>{t('characters.reconnect')}</a>
          </div>
        </div>
      )}

      {linkError === 'bnet_unavailable' && (
        <div className="center-msg">
          {t('characters.unavailable')}
        </div>
      )}

      {!linkError && chars.length === 0 && (
        <div className="center-msg">
          {t('characters.none')}
          {onboarding && <><br />{t('characters.noneHint')}</>}
        </div>
      )}

      <div className="grid cols-auto">
        {chars.map((c) => {
          const color = classColorByName(c.className);
          const isActive = c.id === activeId;
          const mc = mplusColor(c.mythicRating, c.mythicRatingColor);
          return (
            <div key={c.id} className={'card char-card' + (isActive ? ' selected' : '')}
              onClick={() => !isActive && select(c.id)}>
              <div className="char-shot" style={{ backgroundImage: c.images?.inset ? `url(${c.images.inset})` : `linear-gradient(135deg, ${color}, var(--surface-2))` }} />
              <div className="body">
                {c.images?.avatar
                  ? <img className="avatar avatar-ring" src={c.images.avatar} alt="" style={{ borderColor: color }} />
                  : <div className="avatar avatar-ring" style={{ width: 66, height: 66, borderRadius: '50%', borderColor: color }} />}
                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h3 style={{ color, fontSize: 18 }}>{c.name}</h3>
                  {isActive && <span className="pill" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>{t('characters.main')}</span>}
                </div>
                <div className="muted" style={{ fontSize: 13 }}>
                  {t('char.level', { level: c.level })} · {CLASS_NAMES[c.classId] || c.className}{c.specName ? ` · ${c.specName}` : ''}
                </div>

                <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
                  <Mini label={t('char.itemLevel')} value={c.itemLevel ?? '—'} />
                  <Mini label={t('char.mplusShort')} value={c.mythicRating ? formatNumber(c.mythicRating) : '—'} color={c.mythicRating ? mc : undefined} />
                  <Mini label={t('char.achievementPoints')} value={c.achievementPoints ? formatNumber(c.achievementPoints) : '—'} />
                </div>

                {!isActive && (
                  <button className="btn btn-primary btn-sm" style={{ marginTop: 14, width: '100%' }}
                    disabled={selecting === c.id}>
                    {selecting === c.id ? '…' : t('characters.setMain')}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// Blizzard issues this client no refresh token — measured against their token
// endpoint, which rejects the grant outright — so an expired link can only be
// renewed by sending the user through Battle.net again. Their SSO cookie lives
// 30 days, so that trip is normally a flicker with nothing to type.
//
// Once per session, and only from here: this screen has no unsaved input to
// lose, and a token that comes back broken (authorisation revoked, Blizzard
// down) must not turn into a redirect carousel. Everything after the first
// attempt falls through to the reconnect button.
const REAUTH_GUARD = 'raidex.bnetReauthAttempted';

function tryAutoReauth() {
  try {
    if (sessionStorage.getItem(REAUTH_GUARD)) return false;
    sessionStorage.setItem(REAUTH_GUARD, String(Date.now()));
  } catch {
    return false; // no session storage (private mode) → offer the button instead
  }
  window.location.href = LOGIN_URL;
  return true;
}

function clearReauthGuard() {
  try { sessionStorage.removeItem(REAUTH_GUARD); } catch { /* noop */ }
}

// An expired Battle.net link (409) and an unreachable Blizzard (503) both look
// like "no characters" from here; only the API can tell them apart.
function linkErrorOf(e) {
  if (e?.status === 409 || e?.status === 503) return e.message;
  return null;
}

function Mini({ label, value, color }) {
  return (
    <div>
      <div style={{ fontWeight: 800, fontSize: 15, color: color || 'var(--text)' }}>{value}</div>
      <div className="muted" style={{ fontSize: 11 }}>{label}</div>
    </div>
  );
}
