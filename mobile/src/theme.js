// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: AGPL-3.0-or-later
// Raidex "Overclock" theme — dark gamer / neon on an indigo canvas.
// Dark-only by design (the neon aesthetic doesn't translate to a light mode).

import { activeLocale } from './locale.js';
import { t as tr } from './i18n/index.js';

export const FONTS = {
  display: 'Oxanium_800ExtraBold',
  black: 'Oxanium_800ExtraBold',
  bold: 'Oxanium_700Bold',
  body: 'ChakraPetch_400Regular',
  bodyMed: 'ChakraPetch_500Medium',
  bodySemi: 'ChakraPetch_600SemiBold',
  mono: 'JetBrainsMono_500Medium',
  monoBold: 'JetBrainsMono_700Bold',
};

const OVERCLOCK = {
  ...FONTS,
  bg: '#141D38',
  canvasDeep: '#101730',
  canvasTop: '#1A2340',
  surface: '#202C52',
  surface2: '#28345C',
  surface3: '#2D3A64',
  border: '#2D3A64',
  borderStrong: '#3A4A7A',
  text: '#F2F0F7',
  textDim: '#C9C4D4',
  textMuted: '#8A8296',
  textFaint: '#6A6272',
  // neon accents
  magenta: '#FF2D78',
  cyan: '#22E6FF',
  violet: '#7A1CE0',
  // semantic aliases used across components
  accent: '#FF2D78',
  frost0: '#22E6FF', frost1: '#22E6FF', frost2: '#7A1CE0', frost3: '#FF2D78',
  red: '#FF476A', green: '#3DDC97', yellow: '#22E6FF', purple: '#7A1CE0', orange: '#FF2D78',
  gradMagenta: ['#FF2D78', '#7A1CE0'],
  gradSurface: ['#202C52', '#141D38'],
  scheme: 'dark',
};

export function useTheme() {
  return OVERCLOCK;
}

// ── WoW data ────────────────────────────────────────────────────────────────
export const CLASS_COLORS = {
  1: '#C79C6E', 2: '#F58CBA', 3: '#ABD473', 4: '#FFF569', 5: '#F0F0F0',
  6: '#C41F3B', 7: '#0070DE', 8: '#69CCF0', 9: '#9482C9', 10: '#00FF96',
  11: '#FF7D0A', 12: '#A330C9', 13: '#33937F',
};
const NAME_TO_ID = {
  Warrior: 1, Paladin: 2, Hunter: 3, Rogue: 4, Priest: 5, 'Death Knight': 6,
  Shaman: 7, Mage: 8, Warlock: 9, Monk: 10, Druid: 11, 'Demon Hunter': 12, Evoker: 13,
  Krieger: 1, Jäger: 3, Schurke: 4, Priester: 5, Todesritter: 6, Schamane: 7,
  Magier: 8, Hexenmeister: 9, Mönch: 10, Druide: 11, Dämonenjäger: 12, Rufer: 13,
};
export const classColor = (id) => CLASS_COLORS[id] || '#22E6FF';
export const classColorByName = (n) => classColor(NAME_TO_ID[n]);
// Class name in the UI language by class id; the API's own name as fallback.
export const className = (id, fallback) => (CLASS_COLORS[id] ? tr(`wow.class.${id}`) : (fallback || '—'));

// Raider.io profile URL for a character (region defaults to eu).
export const raiderIoUrl = (c) =>
  `https://raider.io/characters/${c.region || 'eu'}/${encodeURIComponent(c.realmSlug || c.realm)}/${encodeURIComponent(c.name)}`;

export const FACTIONS = {
  ALLIANCE: { label: tr('wow.faction.ALLIANCE'), color: '#22E6FF' },
  HORDE: { label: tr('wow.faction.HORDE'), color: '#FF2D78' },
};
export const factionColor = (f) => FACTIONS[f]?.color || '#8A8296';
export const factionLabel = (f) => FACTIONS[f]?.label || '—';

export const ROLES = {
  tank: { label: tr('wow.role.tank'), icon: '🛡️', color: '#22E6FF' },
  healer: { label: tr('wow.role.healer'), icon: '✚', color: '#3DDC97' },
  dps: { label: tr('wow.role.dps'), icon: '⚔️', color: '#FF2D78' },
};
export const DIFFICULTIES = {
  mythic: { label: tr('wow.difficulty.mythic'), color: '#FF2D78', grad: ['#FF2D78', '#7A1CE0'] },
  heroic: { label: tr('wow.difficulty.heroic'), color: '#7A1CE0', grad: ['#7A1CE0', '#4a1499'] },
  normal: { label: tr('wow.difficulty.normal'), color: '#22E6FF', grad: ['#22E6FF', '#1785a0'] },
  lfr: { label: tr('wow.difficulty.lfr'), color: '#3DDC97', grad: ['#3DDC97', '#1f8f63'] },
  mplus: { label: tr('wow.difficulty.mplus'), color: '#FF2D78', grad: ['#FF2D78', '#7A1CE0'] },
};
// Authentic Blizzard M+ colour, faded toward light grey for readability on the
// dark indigo canvas. Falls back to WoW tier colours when no API colour exists.
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
  const target = [193, 190, 205], a = 0.34;
  const m = base.map((c, i) => Math.round(c * (1 - a) + target[i] * a));
  return `rgb(${m[0]}, ${m[1]}, ${m[2]})`;
}

export function mplusTier(r) {
  if (r >= 2500) return { label: tr('wow.tier.master'), color: '#FF2D78' };
  if (r >= 2000) return { label: tr('wow.tier.elite'), color: '#7A1CE0' };
  if (r >= 1000) return { label: tr('wow.tier.advanced'), color: '#22E6FF' };
  if (r > 0) return { label: tr('wow.tier.beginner'), color: '#3DDC97' };
  return { label: '—', color: '#8A8296' };
}

// Built per locale and cached rather than as module constants, because the
// user's format is a stored preference that can change at runtime.
const DTF_OPTS = { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' };
const dtfs = new Map();
const nfs = new Map();
const cached = (map, make) => {
  const locale = activeLocale();
  let f = map.get(locale);
  if (!f) { f = make(locale); map.set(locale, f); }
  return f;
};
export const formatDateTime = (ms) => cached(dtfs, (l) => new Intl.DateTimeFormat(l, DTF_OPTS)).format(new Date(ms));
export const formatNumber = (n) => cached(nfs, (l) => new Intl.NumberFormat(l)).format(n ?? 0);
// bare: the span without "in" (a countdown label of its own).
export function countdown(ms, bare = false) {
  const diff = ms - Date.now();
  if (diff <= 0) return tr('time.running');
  const d = Math.floor(diff / 86400000), h = Math.floor((diff % 86400000) / 3600000), m = Math.floor((diff % 3600000) / 60000);
  const span = d > 0 ? tr('time.dh', { count: d, h }) : h > 0 ? tr('time.hm', { h, m }) : tr('time.m', { m });
  return bare ? span : tr('time.in', { span });
}
