// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: MIT
import { lang } from './i18n/index.js';

export const API_BASE = 'https://raidex.app/api';

let authToken = null;
export function setToken(t) { authToken = t; }
export function getToken() { return authToken; }

async function req(method, path, body) {
  const res = await fetch(API_BASE + path, {
    method,
    headers: {
      // Server-generated texts (dashboard cards) in the UI language.
      'Accept-Language': lang,
      ...(authToken ? { Authorization: 'Bearer ' + authToken } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let detail = {};
    try { detail = await res.json(); } catch {}
    const err = new Error(detail.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  me: () => req('GET', '/me'),
  demoToken: () => req('POST', '/auth/demo-token'),
  // E-mail demo account, same endpoints as the web; platform 'mobile' → token only, no cookie.
  register: (email, password) => req('POST', '/auth/register', { email, password }),
  emailLogin: (email, password) => req('POST', '/auth/login', { email, password, platform: 'mobile' }),
  deleteAccount: () => req('DELETE', '/me'),
  logout: () => req('POST', '/auth/logout'),
  characters: () => req('GET', '/characters'),
  character: (realm, name, refresh) => req('GET', `/characters/${encodeURIComponent(realm)}/${encodeURIComponent(name)}${refresh ? '?refresh=1' : ''}`),
  // (realm already encoded above)
  selectCharacter: (id) => req('POST', '/characters/select', { id }),
  reloadStatus: () => req('GET', '/characters/reload-status'),
  reloadCharacters: () => req('POST', '/characters/reload'),
  roster: () => req('GET', '/guild/roster'),
  setRaidlead: (data) => req('POST', '/guild/raidleads', data),
  setQuartermaster: (data) => req('POST', '/guild/quartermasters', data),
  guides: (instance) => req('GET', `/guides/${encodeURIComponent(instance)}`),
  addGuide: (data) => req('POST', '/guild/guides', data),
  deleteGuide: (id) => req('DELETE', `/guild/guides/${id}`),
  guilds: () => req('GET', '/guilds'),
  selectGuild: (guildId) => req('POST', '/guilds/select', { guildId }),
  setLocale: (locale) => req('POST', '/me/locale', { locale }),
  raidInstances: () => req('GET', '/wow/raids'),
  dungeonInstances: () => req('GET', '/wow/dungeons'),
  raids: () => req('GET', '/raids'),
  createRaid: (data) => req('POST', '/raids', data),
  updateRaid: (id, data) => req('PATCH', `/raids/${id}`, data),
  deleteRaid: (id) => req('DELETE', `/raids/${id}`),
  signup: (id, data) => req('PUT', `/raids/${id}/signup`, data),
  withdraw: (id) => req('DELETE', `/raids/${id}/signup`),
  removeSignup: (id, signupId) => req('DELETE', `/raids/${id}/signup/${signupId}`),
  registerDeviceToken: (data) => req('POST', '/push/register', data),
  dashboard: () => req('GET', '/dashboard'),
};
