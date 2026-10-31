// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: MIT
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { api } from './api.js';
import { lang } from './i18n/index.js';

// Show alerts while the app is foregrounded too.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

// Ask permission, get the native device push token (APNs on iOS / FCM on Android),
// and register it with the backend. No-op on simulators/emulators (no real token).
export async function registerForPush() {
  try {
    if (!Device.isDevice) return;
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;
    const { data: token } = await Notifications.getDevicePushTokenAsync();
    if (token) await api.registerDeviceToken({ token, platform: Platform.OS, lang });
  } catch {
    // Missing FCM config on Android, no entitlement, etc. — non-fatal.
  }
}
