// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: MIT
// Date/time locale, mirroring web/src/lib/locale.js.
//
// The value is a per-user preference from /me rather than a device lookup: a
// client cannot read the host's format settings. Intl derives its locale from
// the UI language, so a system set to English with German date formats still
// reports en-US. The stored preference is the only reliable source; 'system'
// is the sentinel for "use whatever the device reports after all".

import { t } from './i18n/index.js';

// No explicit choice: follow the browser/device. LOCALE_FALLBACK only when Intl
// reports nothing.
export const LOCALE_DEFAULT = 'system';
export const LOCALE_FALLBACK = 'en-GB';

// Must stay in sync with LOCALES in api/lib.php and web/src/lib/locale.js.
export const LOCALE_OPTIONS = [
  { value: 'de-DE', label: 'Deutsch (Deutschland)' },
  { value: 'de-AT', label: 'Deutsch (Österreich)' },
  { value: 'de-CH', label: 'Deutsch (Schweiz)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'en-US', label: 'English (US)' },
  { value: 'system', label: t('profile.localeSystem') },
];

export function systemLocale() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || LOCALE_FALLBACK;
  } catch {
    return LOCALE_FALLBACK;
  }
}

export function resolveLocale(pref) {
  return (pref || LOCALE_DEFAULT) === 'system' ? systemLocale() : pref;
}

let active = resolveLocale(LOCALE_DEFAULT);

// Called from AuthProvider before `me` reaches the tree, so the render that
// follows already formats with the user's locale.
export function setActiveLocale(pref) {
  active = resolveLocale(pref);
}

export function activeLocale() {
  return active;
}
