// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: MIT

// About: version, copyright, licence with the source link, credits, trademark
// notice, and the "Made with <3 in Europe" chip.
import { ScrollView, View, Text, Pressable } from 'react-native';
import Constants from 'expo-constants';
import { useTheme } from '../theme.js';
import { SectionTitle, BottomSheet, Pill } from '../ui.js';
import { openLink } from '../openLink.js';
import { t as tr } from '../i18n/index.js';

const SOURCE_URL = 'https://github.com/lasse-tech/raidex';
const LICENSE_URL = 'https://opensource.org/license/mit';

const CREDITS = [
  [tr('about.fonts'), 'Oxanium, Chakra Petch, JetBrains Mono, Orbitron · SIL Open Font License 1.1'],
  [tr('about.icons'), '@expo/vector-icons · MIT'],
  [tr('about.libraries'), 'React Native, Expo, React Navigation · MIT'],
  [tr('about.gameData'), 'Blizzard Battle.net API'],
];

export default function AboutModal({ onClose }) {
  const t = useTheme();
  const version = Constants.expoConfig?.version ?? '';
  const dim = { color: t.textDim, fontFamily: t.body, fontSize: 14, lineHeight: 22 };
  const link = { color: t.accent, fontFamily: t.body, fontSize: 14, lineHeight: 22 };
  return (
    <BottomSheet onClose={onClose}>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 34 }}>
        <Text style={{ color: t.text, fontFamily: t.display, fontSize: 20, letterSpacing: 0.5, marginBottom: 10 }}>RAIDEX</Text>
        <View style={{ flexDirection: 'row', marginBottom: 12 }}><Pill>{tr('about.version', { v: version })}</Pill></View>
        <Text style={dim}>© 2026 lasse tech, Lars Gossard</Text>
        <Pressable onPress={() => openLink('mailto:lars@lasse-tech.de')}><Text style={link}>lars@lasse-tech.de</Text></Pressable>
        <View style={{ flexDirection: 'row', gap: 14, marginBottom: 18 }}>
          <Pressable onPress={() => openLink(LICENSE_URL)}><Text style={link}>MIT</Text></Pressable>
          <Pressable onPress={() => openLink(SOURCE_URL)}><Text style={link}>{tr('about.source')}</Text></Pressable>
        </View>

        <SectionTitle>{tr('about.credits')}</SectionTitle>
        {CREDITS.map(([k, v]) => (
          <Text key={k} style={dim}><Text style={{ color: t.textFaint }}>{k}  </Text>{v}</Text>
        ))}
        <Text style={{ color: t.textFaint, fontFamily: t.body, fontSize: 12, marginTop: 14 }}>
          {tr('about.trademark')}
        </Text>

        <View style={{ alignItems: 'center', marginTop: 22 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface2 }}>
            <Text style={{ color: t.textMuted, fontFamily: t.mono, fontSize: 11 }}>Made with</Text>
            <Text style={{ color: '#E5484D', fontSize: 11 }}>♥</Text>
            <Text style={{ color: t.textMuted, fontFamily: t.mono, fontSize: 11 }}>in Europe</Text>
          </View>
        </View>
      </ScrollView>
    </BottomSheet>
  );
}
