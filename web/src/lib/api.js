// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: AGPL-3.0-or-later
// API base is derived from the Vite base path, so the same build works on every
// environment that serves the app at the domain root: '/api'.
export const API = (import.meta.env.BASE_URL || '/') + 'api';
export const LOGIN_URL = `${API}/auth/login`;

async function req(method, path, body) {
  const res = await fetch(API + path, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let detail = {};
    try { detail = await res.json(); } catch { /* noop */ }
    const err = new Error(detail.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  me: () => req('GET', '/me'),
  // Raidex Keys connecting to this account (views/ConnectKeys.jsx).
  connectInfo: (code) => req('GET', `/keys/connect/${encodeURIComponent(code)}`),
  connectApprove: (code) => req('POST', `/keys/connect/${encodeURIComponent(code)}/approve`),
  connectDeny: (code) => req('POST', `/keys/connect/${encodeURIComponent(code)}/deny`),
  characters: () => req('GET', '/characters'),
  character: (realm, name, refresh) => req('GET', `/characters/${encodeURIComponent(realm)}/${encodeURIComponent(name)}${refresh ? '?refresh=1' : ''}`),
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
  raids: (scope) => req('GET', scope === 'past' ? '/raids?scope=past' : '/raids'),
  createRaid: (data) => req('POST', '/raids', data),
  updateRaid: (id, data) => req('PATCH', `/raids/${id}`, data),
  deleteRaid: (id) => req('DELETE', `/raids/${id}`),
  signup: (id, data) => req('PUT', `/raids/${id}/signup`, data),
  withdraw: (id) => req('DELETE', `/raids/${id}/signup`),
  removeSignup: (id, signupId) => req('DELETE', `/raids/${id}/signup/${signupId}`),
  createShareLink: (id) => req('POST', `/raids/${id}/share`),
  guildDiscord: () => req('GET', '/guild/discord'),
  setGuildDiscord: (webhookUrl) => req('POST', '/guild/discord', { webhookUrl }),
  testGuildDiscord: () => req('POST', '/guild/discord/test'),
  setGuildLang: (lang) => req('POST', '/guild/lang', { lang }),
  vapidPublic: () => req('GET', '/push/vapid-public'),
  registerDeviceToken: (data) => req('POST', '/push/register', data),
  dashboard: (withHidden) => req('GET', '/dashboard' + (withHidden ? '?withHidden=1' : '')),
  saveWidget: (key, data) => req('PUT', `/widgets/${key}`, data),
  deleteWidget: (key) => req('DELETE', `/widgets/${encodeURIComponent(key)}`),
  saveLayout: (layout) => req('POST', '/widgets/layout', { layout }),
  setSystemVisibility: (key, hidden) => req('POST', '/widgets/system-visibility', { key, hidden }),
  guildOverview: () => req('GET', '/stats/guilds'),
  // Operator only: scan any guild by id, whether or not the caller is in it.
  scanGuild: (id) => req('POST', `/guilds/${id}/scan`),
  statsTokens: () => req('GET', '/stats/tokens'),
  createStatsToken: (label) => req('POST', '/stats/tokens', { label }),
  deleteStatsToken: (id) => req('DELETE', `/stats/tokens/${id}`),
  logout: () => req('POST', '/auth/logout'),
  register: (email, password) => req('POST', '/auth/register', { email, password }),
  emailLogin: (email, password) => req('POST', '/auth/login', { email, password }),
};
