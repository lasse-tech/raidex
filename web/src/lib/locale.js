// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: MIT
import { t } from '../i18n/index.js';
// Date/time locale.
//
// The browser cannot be asked what date format the host wants. A Linux box with
// LANG=en_US.UTF-8 but LC_TIME=de_DE.UTF-8 wants 03.09.2026, yet Intl reports
// en-US and formats 9/3/2026 — ICU derives its locale from LANG/LC_MESSAGES and
// ignores LC_TIME entirely. The only OS setting that does come through is the
// time zone. So the format is a stored user preference, and 'system' is offered
// for anyone whose browser language happens to be the one they want.

// No explicit choice: follow the browser/device. LOCALE_FALLBACK only when Intl
// reports nothing.
export const LOCALE_DEFAULT = 'system';
export const LOCALE_FALLBACK = 'en-GB';

// Must stay in sync with LOCALES in api/lib.php, which validates what is
// stored. 'system' is a sentinel resolved here, not a locale the server knows
// how to format with.
export const LOCALE_OPTIONS = [
  { value: 'de-DE', label: 'Deutsch (Deutschland)' },
  { value: 'de-AT', label: 'Deutsch (Österreich)' },
  { value: 'de-CH', label: 'Deutsch (Schweiz)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'en-US', label: 'English (US)' },
  { value: 'system', label: t('locale.system') },
];

// What the device reports — the browser's UI language, not its format settings.
export function systemLocale() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || LOCALE_FALLBACK;
  } catch {
    return LOCALE_FALLBACK;
  }
}

// A stored preference (including the 'system' sentinel and a missing value)
// turned into a locale Intl will accept.
export function resolveLocale(pref) {
  return (pref || LOCALE_DEFAULT) === 'system' ? systemLocale() : pref;
}

let active = resolveLocale(LOCALE_DEFAULT);

// Set from the /me payload before `me` reaches the tree, so the render that
// follows already formats with the new locale. Module-level rather than context
// state because every formatDate() call site would otherwise need a hook.
export function setActiveLocale(pref) {
  active = resolveLocale(pref);
}

export function activeLocale() {
  return active;
}

// ── date field shape ────────────────────────────────────────────────────────
// Field order and separator are read out of the locale rather than assumed, so
// en-US gets MM/DD/YYYY and de-DE gets DD.MM.YYYY off the same code path.

const NUMERIC = { day: '2-digit', month: '2-digit', year: 'numeric' };
const shapes = new Map();

function shape(locale = active) {
  const hit = shapes.get(locale);
  if (hit) return hit;

  let order = ['day', 'month', 'year'];
  let sep = '.';
  try {
    const parts = new Intl.DateTimeFormat(locale, NUMERIC).formatToParts(new Date(2026, 8, 3));
    const fields = parts.filter((p) => p.type !== 'literal').map((p) => p.type);
    const literal = parts.find((p) => p.type === 'literal')?.value?.trim();
    // A locale can order the parts differently but must still yield all three;
    // anything unexpected keeps the day-first default rather than a partial mask.
    if (fields.length === 3) order = fields;
    if (literal) sep = literal;
  } catch { /* keep the defaults */ }

  // Mask letters follow the UI language, the field order the date locale.
  const letters = { day: t('locale.day'), month: t('locale.month'), year: t('locale.year') };
  const out = { order, sep, placeholder: order.map((f) => letters[f]).join(sep) };
  shapes.set(locale, out);
  return out;
}

export const datePlaceholder = (locale) => shape(locale).placeholder;

// ── date parsing / formatting for text input ────────────────────────────────

const WIDTH = { day: 2, month: 2, year: 4 };

// Digits typed so far, grouped into the locale's field order and rejoined with
// its separator — this is what runs on every keystroke.
export function maskDate(text, locale) {
  const { order, sep } = shape(locale);
  const digits = String(text ?? '').replace(/\D/g, '');
  const groups = [];
  let at = 0;
  for (const field of order) {
    if (at >= digits.length) break;
    groups.push(digits.slice(at, at + WIDTH[field]));
    at += WIDTH[field];
  }
  return groups.join(sep);
}

// Returns { y, m, d } or null. Rejects a date the calendar does not have (31.02)
// instead of letting Date roll it over into March.
export function parseDate(text, locale) {
  const { order } = shape(locale);
  const digits = String(text ?? '').replace(/\D/g, '');
  const need = order.reduce((n, f) => n + WIDTH[f], 0);
  if (digits.length !== need) return null;

  const got = {};
  let at = 0;
  for (const field of order) {
    got[field] = Number(digits.slice(at, at + WIDTH[field]));
    at += WIDTH[field];
  }
  const { year: y, month: m, day: d } = got;
  if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const probe = new Date(y, m - 1, d);
  if (probe.getFullYear() !== y || probe.getMonth() !== m - 1 || probe.getDate() !== d) return null;
  return { y, m, d };
}

export function formatDateField(date, locale) {
  const { order, sep } = shape(locale);
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const pad = (n, w) => String(n).padStart(w, '0');
  const val = { day: pad(date.getDate(), 2), month: pad(date.getMonth() + 1, 2), year: pad(date.getFullYear(), 4) };
  return order.map((f) => val[f]).join(sep);
}

// ── time parsing / formatting for text input ────────────────────────────────
// Input is 24-hour regardless of locale: it is unambiguous, it is what a raid
// roster reads like, and an AM/PM text field is a mess to type into. Display
// elsewhere still follows the locale, so an en-US user sees 8:00 PM on a card.

export function maskTime(text) {
  const digits = String(text ?? '').replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

// Returns { h, min } or null.
export function parseTime(text) {
  const m = String(text ?? '').match(/^(\d{1,2}):?(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return { h, min };
}

export function formatTimeField(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
