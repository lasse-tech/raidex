// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: MIT
import { activeLocale } from './locale.js';
import { t, lang } from '../i18n/index.js';

// WoW class colours (official) keyed by class id.
export const CLASS_COLORS = {
  1: '#C79C6E', 2: '#F58CBA', 3: '#ABD473', 4: '#FFF569', 5: '#F0F0F0',
  6: '#C41F3B', 7: '#0070DE', 8: '#69CCF0', 9: '#9482C9', 10: '#00FF96',
  11: '#FF7D0A', 12: '#A330C9', 13: '#33937F',
};

// In the UI language; the API's className follows its bnet_locale instead.
export const CLASS_NAMES = Object.fromEntries(
  Array.from({ length: 13 }, (_, i) => [i + 1, t(`wow.class.${i + 1}`)]),
);

export function classColor(classId) {
  return CLASS_COLORS[classId] || '#88C0D0';
}

// Map a class name (English or German, as the API returns per locale) to its colour.
const NAME_TO_ID = {
  Warrior: 1, Paladin: 2, Hunter: 3, Rogue: 4, Priest: 5, 'Death Knight': 6,
  Shaman: 7, Mage: 8, Warlock: 9, Monk: 10, Druid: 11, 'Demon Hunter': 12, Evoker: 13,
  Krieger: 1, Jäger: 3, Schurke: 4, Priester: 5, Todesritter: 6, Schamane: 7,
  Magier: 8, Hexenmeister: 9, Mönch: 10, Druide: 11, Dämonenjäger: 12, Rufer: 13,
};
export function classColorByName(name) {
  return classColor(NAME_TO_ID[name]);
}

// Raider.io profile: https://raider.io/characters/{region}/{realm-slug}/{name}
export function raiderIoUrl(c) {
  if (!c?.realmSlug || !c?.name) return null;
  return `https://raider.io/characters/${c.region || 'eu'}/${encodeURIComponent(c.realmSlug)}/${encodeURIComponent(c.name)}`;
}

export function wowProfileUrl(c) {
  if (!c?.realmSlug || !c?.name) return null;
  return `https://worldofwarcraft.blizzard.com/${lang === 'de' ? 'de-de' : 'en-gb'}/character/${c.region || 'eu'}/${encodeURIComponent(c.realmSlug)}/${encodeURIComponent(String(c.name).toLowerCase())}`;
}

export const FACTIONS = {
  ALLIANCE: { label: t('wow.alliance'), color: '#4C7BD9', dot: '#4C7BD9' },
  HORDE: { label: t('wow.horde'), color: '#C1272D', dot: '#C1272D' },
};
export const factionColor = (f) => FACTIONS[f]?.color || 'var(--text-muted)';
export const factionLabel = (f) => FACTIONS[f]?.label || '—';

export const ROLES = {
  tank: { label: t('wow.role.tank'), icon: '🛡️', color: '#5E81AC' },
  healer: { label: t('wow.role.healer'), icon: '✚', color: '#A3BE8C' },
  dps: { label: t('wow.role.dps'), icon: '⚔️', color: '#BF616A' },
};

// Real Blizzard/WoW role icons (shield/cross/swords), under BASE_URL.
const ROLE_ICON_FILE = { tank: 'role-tank', healer: 'role-heal', dps: 'role-dps' };
export const roleIconUrl = (role) => `${import.meta.env.BASE_URL}img/${ROLE_ICON_FILE[role] || 'role-dps'}.webp`;

export const DIFFICULTIES = {
  mythic: { label: t('wow.diff.mythic'), color: '#FF8000' },
  heroic: { label: t('wow.diff.heroic'), color: '#A335EE' },
  normal: { label: t('wow.diff.normal'), color: '#0070DD' },
  lfr: { label: t('wow.diff.lfr'), color: '#1EFF00' },
  mplus: { label: t('wow.diff.mplus'), color: '#FF8000' },
};

// Authentic Blizzard M+ rating colour, faded toward a light grey so it stays
// readable on the dark indigo canvas. Falls back to WoW tier colours.
function _hex(h) {
  h = (h || '').replace('#', '');
  return h.length >= 6 ? [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)] : null;
}
function _tier(r) {
  if (r >= 3000) return [255, 128, 0];
  if (r >= 2500) return [163, 53, 238];
  if (r >= 2000) return [0, 112, 221];
  if (r >= 1000) return [30, 255, 0];
  return [157, 157, 157];
}
export function mplusColor(rating, blizzHex) {
  if (!rating) return '#8A8296';
  const base = _hex(blizzHex) || _tier(rating);
  const grey = [193, 190, 205], a = 0.34;
  const m = base.map((c, i) => Math.round(c * (1 - a) + grey[i] * a));
  return `rgb(${m[0]}, ${m[1]}, ${m[2]})`;
}

export function mplusTier(rating) {
  if (rating >= 2500) return { label: t('wow.tier.master'), color: '#FF8000' };
  if (rating >= 2000) return { label: t('wow.tier.elite'), color: '#A335EE' };
  if (rating >= 1000) return { label: t('wow.tier.advanced'), color: '#0070DD' };
  if (rating > 0) return { label: t('wow.tier.beginner'), color: '#1EFF00' };
  return { label: '—', color: 'var(--text-muted)' };
}

// ── formatting ──────────────────────────────────────────────────────────────
// Formatters follow the user's stored locale (see lib/locale.js — the device
// cannot be asked), so they are built per locale and cached instead of being
// module constants.
const OPTS = {
  dateTime: { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' },
  date: { weekday: 'long', day: '2-digit', month: 'long' },
  time: { hour: '2-digit', minute: '2-digit' },
};
const formatters = new Map();

function fmt(kind) {
  const locale = activeLocale();
  const key = `${locale}:${kind}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, OPTS[kind]);
    formatters.set(key, f);
  }
  return f;
}

export const formatDateTime = (ms) => fmt('dateTime').format(new Date(ms));
export const formatDate = (ms) => fmt('date').format(new Date(ms));
export const formatTime = (ms) => fmt('time').format(new Date(ms));

// "20:00 Uhr", but "8:00 PM" — the German suffix only makes sense on a 24-hour
// clock, and an AM/PM locale already carries the marker itself.
export function formatClock(ms) {
  const f = fmt('time');
  const cycle = f.resolvedOptions().hourCycle;
  const bare = f.format(new Date(ms));
  return cycle === 'h23' || cycle === 'h24' ? t('wow.clock24', { time: bare }) : bare;
}

// `durationMin` is what tells a running raid from a finished one. Without it a
// start in the past reads as "läuft" indefinitely — a raid from July still
// claimed to be running. Callers with no duration (weekly reset, reload lock)
// pass nothing and keep the old behaviour; for them the moment always lies
// ahead anyway.
export function countdown(ms, durationMin = 0) {
  const now = Date.now();
  const diff = ms - now;
  if (diff > 0) {
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    if (d > 0) return t('wow.in.days', { count: d, h });
    if (h > 0) return t('wow.in.hours', { h, m });
    return t('wow.in.minutes', { m });
  }
  const since = now - (ms + durationMin * 60000);
  if (since < 0) return t('wow.running');
  const d = Math.floor(since / 86400000);
  const h = Math.floor(since / 3600000);
  const m = Math.floor(since / 60000);
  if (d > 0) return t('wow.ago.days', { count: d });
  if (h > 0) return t('wow.ago.hours', { h });
  return t('wow.ago.minutes', { m });
}

// Follows the same locale as the dates — a user on en-US reading "12.345" as
// twelve-point-three would be worse than no setting at all.
const numberFormatters = new Map();
export function formatNumber(n) {
  const locale = activeLocale();
  let f = numberFormatters.get(locale);
  if (!f) {
    f = new Intl.NumberFormat(locale);
    numberFormatters.set(locale, f);
  }
  return f.format(n ?? 0);
}
