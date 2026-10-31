// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: AGPL-3.0-or-later
import { View, Text, ActivityIndicator, Image, Pressable, Modal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from './theme.js';

// Android-style bottom sheet: slides up from the bottom, rounded top, a drag
// handle, tap-scrim to dismiss. Children bring their own ScrollView.
export function BottomSheet({ onClose, children, maxHeightPct = 92 }) {
  const t = useTheme();
  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(4,6,16,0.6)', justifyContent: 'flex-end' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={{ backgroundColor: t.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: `${maxHeightPct}%`, overflow: 'hidden', borderTopWidth: 1, borderColor: t.border }}>
          {/* Tap the handle (or the scrim / hardware-back) to dismiss. */}
          <Pressable onPress={onClose} hitSlop={12} style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 6 }}>
            <View style={{ width: 42, height: 5, borderRadius: 3, backgroundColor: t.borderStrong }} />
          </Pressable>
          {children}
        </View>
      </View>
    </Modal>
  );
}

export function Card({ children, style, glow }) {
  const t = useTheme();
  return (
    <LinearGradient colors={t.gradSurface} start={{ x: 0, y: 0 }} end={{ x: 0.4, y: 1 }}
      style={[{ borderColor: t.border, borderWidth: 1, borderRadius: 18, padding: 18 }, style]}>
      {children}
    </LinearGradient>
  );
}

export function SectionTitle({ children }) {
  const t = useTheme();
  return <Text style={{ color: t.textFaint, fontSize: 11, fontFamily: t.mono, letterSpacing: 1.6, textTransform: 'uppercase', marginBottom: 8, marginTop: 6 }}>{children}</Text>;
}

// Stat tile: big Orbitron value with a neon glow + mono label.
export function Stat({ label, value, accent }) {
  const t = useTheme();
  const c = accent || t.text;
  return (
    <View style={{ flex: 1, backgroundColor: t.surface, borderColor: t.border, borderWidth: 1, borderRadius: 14, padding: 14 }}>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}
        style={{ color: c, fontSize: 22, fontFamily: t.black, textShadowColor: accent ? c + '99' : 'transparent', textShadowRadius: accent ? 12 : 0 }}>{value}</Text>
      <Text numberOfLines={1} style={{ color: t.textFaint, fontSize: 10, fontFamily: t.mono, textTransform: 'uppercase', letterSpacing: 1.2, marginTop: 4 }}>{label}</Text>
    </View>
  );
}

export function Pill({ children, color }) {
  const t = useTheme();
  return (
    <View style={{ borderWidth: 1, borderColor: color || t.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' }}>
      <Text style={{ color: color || t.textDim, fontSize: 11, fontFamily: t.mono, letterSpacing: 0.6, textTransform: 'uppercase' }}>{children}</Text>
    </View>
  );
}

export function RoleBadge({ role, roles }) {
  const r = roles[role];
  if (!r) return null;
  return (
    <View style={{ backgroundColor: r.color, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
      <Text style={{ color: '#101730', fontFamily: 'Oxanium_700Bold', fontSize: 11 }}>{r.icon} {r.label}</Text>
    </View>
  );
}

// Avatar: raster renders via <Image>; SVG/data or missing → class-coloured initial.
export function Avatar({ uri, name, color, size = 44, radius, ring }) {
  const isRaster = uri && !uri.startsWith('data:image/svg');
  const r = radius ?? size / 2; // circular by default
  const border = ring ? { borderWidth: 2, borderColor: ring } : { borderWidth: 2, borderColor: color };
  if (isRaster) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: r, ...border }} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: r, backgroundColor: color, alignItems: 'center', justifyContent: 'center', ...border }}>
      <Text style={{ color: '#101730', fontFamily: 'Oxanium_800ExtraBold', fontSize: size * 0.44 }}>{(name?.[0] || '?').toUpperCase()}</Text>
    </View>
  );
}

export function Loading() {
  const t = useTheme();
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg }}><ActivityIndicator size="large" color={t.magenta} /></View>;
}

export function Empty({ children }) {
  const t = useTheme();
  return <View style={{ padding: 40, alignItems: 'center' }}><Text style={{ color: t.textMuted, textAlign: 'center', lineHeight: 22, fontFamily: t.body }}>{children}</Text></View>;
}

// Gradient primary CTA button (magenta→violet).
export function GradientButton({ children, onPress, style, disabled, busy }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled || busy} style={[{ borderRadius: 11, overflow: 'hidden', opacity: disabled ? 0.5 : 1 }, style]}>
      <LinearGradient colors={t.gradMagenta} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ paddingVertical: 14, alignItems: 'center' }}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontFamily: t.bold, fontSize: 14, letterSpacing: 0.8 }}>{children}</Text>}
      </LinearGradient>
    </Pressable>
  );
}
