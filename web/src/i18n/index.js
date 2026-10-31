// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: MIT
// UI language: English first, German second, picked from the browser's
// language list; anything else falls back to English. Dictionaries are
// i18next-style JSON (nested keys, {{name}} placeholders, _one/_other plurals);
// scripts/i18n-check.mjs keeps en and de in step.
import en from './en.json';
import de from './de.json';

export const LANGS = ['en', 'de'];
export const FALLBACK = 'en';
const DICTS = { en, de };

function detect() {
  const list = typeof navigator === 'undefined' ? [] : (navigator.languages?.length ? navigator.languages : [navigator.language]);
  for (const tag of list) {
    const primary = String(tag || '').toLowerCase().split('-')[0];
    if (LANGS.includes(primary)) return primary;
  }
  return FALLBACK;
}

export const lang = detect();

function lookup(dict, key) {
  let node = dict;
  for (const part of key.split('.')) {
    if (node == null || typeof node !== 'object') return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

const plurals = new Intl.PluralRules(lang);

// t('calendar.title'), t('roster.members', { count: 3 }), t('push.cancelled', { title }).
export function t(key, params) {
  let k = key;
  if (params && typeof params.count === 'number') {
    const form = `${key}_${plurals.select(params.count)}`;
    if (lookup(DICTS[lang], form) !== undefined || lookup(DICTS[FALLBACK], form) !== undefined) k = form;
    else if (lookup(DICTS[lang], `${key}_other`) !== undefined) k = `${key}_other`;
  }
  const text = lookup(DICTS[lang], k) ?? lookup(DICTS[FALLBACK], k) ?? key;
  if (!params) return text;
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, name) => (params[name] ?? m));
}
