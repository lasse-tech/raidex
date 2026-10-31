// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: MIT
import { api } from './api.js';
import { lang } from '../i18n/index.js';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

// Register the service worker, subscribe to Web Push, and store the subscription.
// Silent no-op where unsupported / not permitted. Call after login.
export async function registerWebPush() {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
    if (Notification.permission === 'denied') return;
    const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (perm !== 'granted') return;
    const reg = await navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js');
    const { key } = await api.vapidPublic();
    if (!key) return;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
    }
    await api.registerDeviceToken({ token: JSON.stringify(sub), platform: 'web', lang });
  } catch (e) {
    // unsupported browser, permission dismissed, etc. — non-fatal.
  }
}
