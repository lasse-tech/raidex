// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: MIT
import { useState } from 'react';
import { View, Text, Image, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NavigationContainer, DarkTheme, useNavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Oxanium_700Bold, Oxanium_800ExtraBold } from '@expo-google-fonts/oxanium';
import { ChakraPetch_400Regular, ChakraPetch_500Medium, ChakraPetch_600SemiBold } from '@expo-google-fonts/chakra-petch';
import { JetBrainsMono_500Medium, JetBrainsMono_700Bold } from '@expo-google-fonts/jetbrains-mono';

import { AuthProvider, useAuth } from './src/auth.js';
import { useTheme, classColorByName, factionColor, factionLabel, formatNumber } from './src/theme.js';
import { Loading, BottomSheet, SectionTitle, Stat, Avatar } from './src/ui.js';
import { api } from './src/api.js';
import { t as tr } from './src/i18n/index.js';
import LoginScreen from './src/screens/LoginScreen.js';
import DashboardScreen from './src/screens/DashboardScreen.js';
import CalendarScreen from './src/screens/CalendarScreen.js';
import RosterScreen from './src/screens/RosterScreen.js';
import CharactersScreen from './src/screens/CharactersScreen.js';
import ProfileScreen from './src/screens/ProfileScreen.js';
import LegalModal from './src/screens/LegalScreen.js';
import AboutModal from './src/screens/AboutScreen.js';
import OnboardingScreen from './src/screens/OnboardingScreen.js';

const Tab = createBottomTabNavigator();
const NavTheme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: '#141D38', card: '#101730', border: '#2D3A64', primary: '#FF2D78' } };

const TAB_ICONS = {
  Dashboard: 'view-dashboard-outline',
  Calendar: 'calendar-month-outline',
  Roster: 'account-group-outline',
  Chars: 'sword-cross',
};

function TabIcon({ name, focused, color }) {
  return (
    <View style={{ width: 56, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: focused ? 'rgba(255,45,120,0.16)' : 'transparent' }}>
      <MaterialCommunityIcons name={name} size={22} color={color} />
    </View>
  );
}

function Tabs() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: t.magenta,
        tabBarInactiveTintColor: t.textMuted,
        tabBarStyle: { backgroundColor: t.canvasDeep, borderTopColor: t.border, borderTopWidth: 1, height: 58 + insets.bottom, paddingTop: 6, paddingBottom: insets.bottom + 14 },
        tabBarLabelStyle: { fontFamily: t.body, fontSize: 11, letterSpacing: 0.3, marginTop: 2 },
        tabBarIcon: ({ focused, color }) => <TabIcon name={TAB_ICONS[route.name]} focused={focused} color={color} />,
      })}>
      <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ title: tr('nav.dashboard') }} />
      <Tab.Screen name="Calendar" component={CalendarScreen} options={{ title: tr('nav.calendar') }} />
      <Tab.Screen name="Roster" component={RosterScreen} options={{ title: tr('nav.roster') }} />
      <Tab.Screen name="Chars" component={CharactersScreen} options={{ title: tr('nav.chars') }} />
    </Tab.Navigator>
  );
}

function TopAppBar({ onMenu, guild, onGuild }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, height: 54, paddingHorizontal: 14, backgroundColor: t.canvasDeep, borderBottomWidth: 1, borderBottomColor: t.border }}>
      <Pressable onPress={onMenu} hitSlop={8} style={{ width: 38, height: 38, borderRadius: 10, overflow: 'hidden' }}>
        <Image source={require('./assets/icon.png')} style={{ width: '100%', height: '100%' }} />
      </Pressable>
      <Text style={{ fontFamily: t.display, fontSize: 20, color: t.text, letterSpacing: 3 }}>RAIDEX</Text>
      {guild ? (
        <Pressable onPress={onGuild} hitSlop={8} style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 170 }}>
          {guild.crestEmblemUrl ? (
            <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: guild.crestBg || t.surface2, alignItems: 'center', justifyContent: 'center' }}>
              <Image source={{ uri: guild.crestEmblemUrl }} style={{ width: 16, height: 16 }} />
            </View>
          ) : null}
          <Text numberOfLines={1} style={{ fontFamily: t.mono, fontSize: 11, color: t.textMuted }}>{guild.displayName}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function DrawerItem({ icon, label, onPress, color }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} android_ripple={{ color: t.surface2 }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, paddingHorizontal: 12, borderRadius: 11 }}>
      <MaterialCommunityIcons name={icon} size={22} color={color || t.textDim} />
      <Text style={{ color: color || t.text, fontFamily: t.bodySemi, fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
}

const DRAWER_NAV = [
  { name: 'Dashboard', label: tr('nav.dashboard'), icon: 'view-dashboard-outline' },
  { name: 'Calendar', label: tr('nav.calendar'), icon: 'calendar-month-outline' },
  { name: 'Roster', label: tr('nav.roster'), icon: 'account-group-outline' },
  { name: 'Chars', label: tr('nav.characters'), icon: 'sword-cross' },
];

function AppDrawer({ open, onClose, onProfil, onLegal, onNavigate }) {
  const t = useTheme();
  const { me, logout, refresh } = useAuth();
  const active = me?.activeCharacter;
  const guild = me?.activeGuild;
  const guilds = me?.guilds || [];
  if (!open) return null;
  const switchGuild = async (id) => { if (id !== guild?.id) { await api.selectGuild(id); await refresh(); } onClose(); };
  return (
    <View style={{ position: 'absolute', inset: 0, zIndex: 100 }}>
      <Pressable style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(4,6,16,0.6)' }} onPress={onClose} />
      <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 296, backgroundColor: t.surface, borderRightWidth: 1, borderRightColor: t.border }}>
        <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, padding: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 6, paddingBottom: 14 }}>
            <Image source={require('./assets/icon.png')} style={{ width: 44, height: 44, borderRadius: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: t.display, fontSize: 18, color: t.text, letterSpacing: 2 }}>RAIDEX</Text>
              <Text numberOfLines={1} style={{ fontFamily: t.mono, fontSize: 10, color: t.textFaint, textTransform: 'uppercase', letterSpacing: 1 }}>{guild ? guild.displayName : tr('nav.guildPortal')}</Text>
            </View>
          </View>

          {guilds.length > 1 && (
            <View style={{ marginBottom: 8 }}>
              {guilds.map((g) => {
                const on = g.id === guild?.id;
                const fc = factionColor(g.faction);
                return (
                  <Pressable key={g.id} onPress={() => switchGuild(g.id)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10, backgroundColor: on ? t.surface2 : 'transparent' }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: fc }} />
                    <Text style={{ color: on ? t.text : t.textMuted, fontFamily: t.bodyMed, fontSize: 13 }}>{g.displayName}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {DRAWER_NAV.map((n) => (
            <DrawerItem key={n.name} icon={n.icon} label={n.label} onPress={() => onNavigate(n.name)} />
          ))}
          <View style={{ height: 1, backgroundColor: t.border, marginVertical: 8, marginHorizontal: 6 }} />
          <DrawerItem icon="account-circle-outline" label={tr('nav.profile')} onPress={onProfil} />

          <View style={{ flex: 1 }} />

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 8, paddingVertical: 8 }}>
            <Avatar uri={active?.images?.avatar} name={active?.name || me?.user?.battletag}
              color={active ? classColorByName(active.className) : t.magenta} size={50} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: active ? classColorByName(active.className) : t.text, fontFamily: t.bodySemi, fontSize: 14 }}>{active ? active.name : me?.user?.battletag}</Text>
              <Text style={{ color: t.textMuted, fontFamily: t.mono, fontSize: 10 }}>{tr(me?.user?.isGM ? 'guildRole.gm' : me?.user?.isAdmin ? 'guildRole.lead' : 'guildRole.member').toUpperCase()}</Text>
            </View>
          </View>
          <Pressable onPress={() => { onClose(); logout(); }} style={{ borderColor: t.red, borderWidth: 1, borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 4 }}>
            <Text style={{ color: t.red, fontFamily: t.bold }}>{tr('common.signOut').toUpperCase()}</Text>
          </Pressable>

          <View style={{ flexDirection: 'row', gap: 18, paddingTop: 14, marginTop: 10, borderTopWidth: 1, borderTopColor: t.border, justifyContent: 'center' }}>
            <Pressable onPress={() => onLegal('impressum')}><Text style={{ color: t.textFaint, fontFamily: t.mono, fontSize: 11 }}>{tr('nav.imprint').toUpperCase()}</Text></Pressable>
            <Pressable onPress={() => onLegal('datenschutz')}><Text style={{ color: t.textFaint, fontFamily: t.mono, fontSize: 11 }}>{tr('nav.privacy').toUpperCase()}</Text></Pressable>
            <Pressable onPress={() => onLegal('about')}><Text style={{ color: t.textFaint, fontFamily: t.mono, fontSize: 11 }}>{tr('nav.about').toUpperCase()}</Text></Pressable>
          </View>
        </SafeAreaView>
      </View>
    </View>
  );
}

function ProfileModal({ onClose }) {
  return (
    <BottomSheet onClose={onClose}>
      <ProfileScreen />
    </BottomSheet>
  );
}

function GuildProfileSheet({ guild, onClose }) {
  const t = useTheme();
  const fc = factionColor(guild.faction);
  return (
    <BottomSheet onClose={onClose} maxHeightPct={82}>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 34 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18 }}>
          <View style={{ width: 62, height: 62, borderRadius: 16, backgroundColor: guild.crestBg || t.surface2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: t.border }}>
            {guild.crestEmblemUrl
              ? <Image source={{ uri: guild.crestEmblemUrl }} style={{ width: 42, height: 42 }} />
              : <MaterialCommunityIcons name="shield-outline" size={30} color={t.textMuted} />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.text, fontFamily: t.display, fontSize: 22 }} numberOfLines={2}>{guild.displayName}</Text>
            <Text style={{ color: t.textMuted, fontFamily: t.mono, fontSize: 12, marginTop: 2 }}>{guild.realmName} · {guild.region?.toUpperCase()}</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 8 }}>
          <Stat label={tr('guild.members')} value={guild.memberCount != null ? formatNumber(guild.memberCount) : '—'} accent={t.cyan} />
          <Stat label={tr('wow.achievements')} value={guild.achievementPoints != null ? formatNumber(guild.achievementPoints) : '—'} accent={t.magenta} />
          <Stat label={tr('guild.faction')} value={factionLabel(guild.faction)} accent={fc} />
        </View>

        <SectionTitle>{tr('guild.scan')}</SectionTitle>
        <View style={{ backgroundColor: t.surface, borderColor: t.border, borderWidth: 1, borderRadius: 14, padding: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
            <Text style={{ color: t.textMuted, fontFamily: t.body }}>{tr('guild.scannedChars')}</Text>
            <Text style={{ color: t.text, fontFamily: t.bodySemi }}>{guild.scannedChars != null ? formatNumber(guild.scannedChars) : '—'}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
            <Text style={{ color: t.textMuted, fontFamily: t.body }}>{tr('common.status')}</Text>
            <Text style={{ color: guild.scanning ? t.cyan : t.textDim, fontFamily: t.bodySemi }}>{guild.scanning ? tr('guild.scanning') : tr('guild.upToDate')}</Text>
          </View>
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

function Root({ navRef }) {
  const t = useTheme();
  const { me, loading } = useAuth();
  const [drawer, setDrawer] = useState(false);
  const [modal, setModal] = useState(null); // 'profil' | 'guild' | 'impressum' | 'datenschutz' | 'about'

  if (loading) return <Loading />;
  if (!me) return <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top']}><LoginScreen /></SafeAreaView>;
  // No main character → no active guild → every tab is empty and the guild
  // never gets scanned. Gate on it instead of letting the user find out.
  if (me.needsMain) {
    return <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top']}><OnboardingScreen /></SafeAreaView>;
  }

  const goto = (name) => { setDrawer(false); navRef?.current?.navigate?.(name); };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top']}>
      <TopAppBar onMenu={() => setDrawer(true)} guild={me.activeGuild} onGuild={() => me.activeGuild && setModal('guild')} />
      <Tabs />
      <AppDrawer open={drawer} onClose={() => setDrawer(false)}
        onNavigate={goto}
        onProfil={() => { setDrawer(false); setModal('profil'); }}
        onLegal={(x) => { setDrawer(false); setModal(x); }} />
      {modal === 'profil' && <ProfileModal onClose={() => setModal(null)} />}
      {modal === 'guild' && me.activeGuild && <GuildProfileSheet guild={me.activeGuild} onClose={() => setModal(null)} />}
      {(modal === 'impressum' || modal === 'datenschutz') && <LegalModal type={modal} onClose={() => setModal(null)} />}
      {modal === 'about' && <AboutModal onClose={() => setModal(null)} />}
    </SafeAreaView>
  );
}

export default function App() {
  const navRef = useNavigationContainerRef();
  const [fontsLoaded, fontError] = useFonts({
    Oxanium_700Bold, Oxanium_800ExtraBold,
    ChakraPetch_400Regular, ChakraPetch_500Medium, ChakraPetch_600SemiBold,
    JetBrainsMono_500Medium, JetBrainsMono_700Bold,
  });
  if (!fontsLoaded && !fontError) {
    return <View style={{ flex: 1, backgroundColor: '#141D38', alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color="#FF2D78" /></View>;
  }
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer theme={NavTheme} ref={navRef}>
          <StatusBar style="light" />
          <Root navRef={navRef} />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
