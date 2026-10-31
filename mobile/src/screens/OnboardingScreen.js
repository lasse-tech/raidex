// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react';
import { View, Text, Image, Pressable } from 'react-native';
import { useTheme } from '../theme.js';
import { useAuth } from '../auth.js';
import CharactersScreen from './CharactersScreen.js';
import LegalModal from './LegalScreen.js';
import { t as tr } from '../i18n/index.js';

// The gate between the login and the app — the counterpart of the web app's
// Onboarding.jsx. Everything Raidex shows is scoped to the active guild, and
// the active guild is derived from the main character, so a user without one
// gets an app that is empty on every tab and never triggers the guild scan.
// Picking a main is therefore the only thing this screen offers.
export default function OnboardingScreen() {
  const t = useTheme();
  const { me, logout } = useAuth();
  const [legal, setLegal] = useState(null); // 'impressum' | 'datenschutz'

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 4 }}>
        <Image source={require('../../assets/login-logo.png')} style={{ width: 54, height: 54 }} resizeMode="contain" />
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.cyan, fontFamily: t.mono, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' }}>{tr('onboarding.step')}</Text>
          <Text style={{ color: t.text, fontFamily: t.black, fontSize: 22, letterSpacing: 0.5, marginTop: 3 }}>{tr('onboarding.welcome')}</Text>
        </View>
      </View>

      <View style={{ flex: 1 }}>
        <CharactersScreen onboarding />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16, borderTopWidth: 1, borderTopColor: t.border }}>
        <Text numberOfLines={1} style={{ flex: 1, color: t.textMuted, fontFamily: t.body, fontSize: 12.5 }}>
          {tr('onboarding.signedInAs', { tag: me?.user?.battletag })}
        </Text>
        <Pressable onPress={() => setLegal('datenschutz')} hitSlop={8}>
          <Text style={{ color: t.textFaint, fontFamily: t.mono, fontSize: 11 }}>{tr('nav.privacy').toUpperCase()}</Text>
        </Pressable>
        <Pressable onPress={logout} hitSlop={8}
          style={{ borderColor: t.red, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 }}>
          <Text style={{ color: t.red, fontFamily: t.bold, fontSize: 12 }}>{tr('common.signOut').toUpperCase()}</Text>
        </Pressable>
      </View>

      {legal && <LegalModal type={legal} onClose={() => setLegal(null)} />}
    </View>
  );
}
