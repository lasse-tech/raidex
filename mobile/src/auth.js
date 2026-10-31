// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: AGPL-3.0-or-later
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { api, setToken, API_BASE } from './api.js';
import { registerForPush } from './push.js';
import { setActiveLocale } from './locale.js';

WebBrowser.maybeCompleteAuthSession();
const KEY = 'raidex_token';
const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [me, setMe] = useState(null);
  const [demoMode, setDemoMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await api.me();
      setDemoMode(!!data.demoMode);
      // Before setMe, so the render it triggers already uses the user's format.
      setActiveLocale(data.user?.locale);
      setMe(data.user ? data : null);
    } catch {
      setMe(null);
    }
  }, []);

  // Bootstrap: restore token, then load session.
  useEffect(() => {
    (async () => {
      const t = await SecureStore.getItemAsync(KEY);
      if (t) setToken(t);
      await refresh();
      if (t) registerForPush();
      setLoading(false);
    })();
  }, [refresh]);

  const finishLogin = useCallback(async (token) => {
    setToken(token);
    await SecureStore.setItemAsync(KEY, token);
    await refresh();
    registerForPush();
  }, [refresh]);

  const loginDemo = useCallback(async () => {
    setBusy(true);
    try { const { token } = await api.demoToken(); await finishLogin(token); }
    finally { setBusy(false); }
  }, [finishLogin]);

  const loginEmail = useCallback(async (email, password) => {
    const { token } = await api.emailLogin(email, password);
    await finishLogin(token);
  }, [finishLogin]);

  const loginBattlenet = useCallback(async () => {
    setBusy(true);
    try {
      const redirect = 'raidex://auth';
      const result = await WebBrowser.openAuthSessionAsync(`${API_BASE}/auth/login?platform=mobile`, redirect);
      if (result.type === 'success' && result.url) {
        const sid = Linking.parse(result.url).queryParams?.sid;
        if (sid) await finishLogin(String(sid));
      }
    } finally { setBusy(false); }
  }, [finishLogin]);

  const logout = useCallback(async () => {
    try { await api.logout(); } catch {}
    setToken(null);
    await SecureStore.deleteItemAsync(KEY);
    setMe(null);
  }, []);

  const deleteAccount = useCallback(async () => {
    await api.deleteAccount();
    setToken(null);
    await SecureStore.deleteItemAsync(KEY);
    setMe(null);
  }, []);

  return (
    <AuthCtx.Provider value={{ me, demoMode, loading, busy, refresh, loginDemo, loginEmail, loginBattlenet, logout, deleteAccount }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
