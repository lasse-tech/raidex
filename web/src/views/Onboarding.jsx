// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: AGPL-3.0-or-later
import { Link } from 'react-router-dom';
import { useMe } from '../lib/store.jsx';
import Characters from './Characters.jsx';
import { t } from '../i18n/index.js';

// The gate between the login and the app. Everything Raidex shows is scoped to
// the active guild, and the active guild is derived from the main character —
// so a user without one lands on an app that is empty everywhere and, worse,
// never triggers the guild scan. Rather than leaving that to be discovered,
// this screen makes picking a main the one thing there is to do.
export default function Onboarding() {
  const { me, logout } = useMe();

  return (
    <div className="onboarding">
      <div className="content">
        <div className="onboarding-hero">
          <img src="/logomark.svg" alt="" className="onboarding-logo" />
          <div>
            <div className="onboarding-kicker">{t('onboarding.kicker')}</div>
            <h1 className="onboarding-title">{t('onboarding.title')}</h1>
          </div>
        </div>

        <Characters onboarding />

        <div className="onboarding-foot">
          <span>{t('onboarding.loggedInAs')} <b>{me.user.battletag}</b></span>
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
