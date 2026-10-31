// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: MIT
import { Linking } from 'react-native';

// All external links (guides, Raider.io, …) open in the OS browser. The app itself
// contains no in-app browser for arbitrary URLs → no unrestricted web access.
export function openLink(url) {
  return Linking.openURL(url);
}
