// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useState, useCallback } from 'react';
import { ScrollView, View, Text, RefreshControl } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme, classColorByName, formatNumber, DIFFICULTIES, formatDateTime, countdown, ROLES } from '../theme.js';
import { useAuth } from '../auth.js';
import { api } from '../api.js';
import { Card, Stat, Loading, Empty } from '../ui.js';
import { t as tr } from '../i18n/index.js';

// A neon section header: soft-glow mono label over a faint magenta→cyan bar.
function NeonHeader({ children, color }) {
  const t = useTheme();
  const c = color || t.cyan;
  return (
    <View style={{ marginTop: 6, marginBottom: 9 }}>
      <Text style={{ color: c, fontSize: 11, fontFamily: t.mono, letterSpacing: 1.6, textTransform: 'uppercase', textShadowColor: c + '66', textShadowRadius: 8 }}>{children}</Text>
      <LinearGradient colors={[t.magenta, t.violet, t.cyan]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={{ height: 2, borderRadius: 2, marginTop: 5, width: 56, opacity: 0.75 }} />
    </View>
  );
}

function RoleCounts({ counts }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
      {['tank', 'healer', 'dps'].map((role) => (
        <View key={role} style={{ flex: 1, backgroundColor: 'rgba(8,8,13,0.35)', borderRadius: 11, paddingVertical: 12, alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 22, fontFamily: t.black }}>{counts?.[role] ?? 0}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, fontFamily: t.mono, letterSpacing: 0.5 }}>{ROLES[role].icon} {ROLES[role].label}</Text>
        </View>
      ))}
    </View>
  );
}

export default function DashboardScreen() {
  const t = useTheme();
  const { me } = useAuth();
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const active = me?.activeCharacter;
  const guild = me?.activeGuild;

  const load = useCallback(() => api.dashboard().then(setData).catch(() => setData({ widgets: [] })), []);
  useEffect(() => { load(); }, [load]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  if (!data) return <Loading />;
  const hour = new Date().getHours();
  const greet = tr(hour < 5 ? 'dashboard.greetNight' : hour < 11 ? 'dashboard.greetMorning' : hour < 18 ? 'dashboard.greetDay' : 'dashboard.greetEvening');
  const diff = data.nextRaid && DIFFICULTIES[data.nextRaid.difficulty];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.magenta} />}>
      <Text style={{ color: t.violet, fontSize: 11, fontFamily: t.mono, letterSpacing: 2, marginBottom: 2, textShadowColor: t.violet + '55', textShadowRadius: 8 }}>{greet}</Text>
      <Text style={{ color: active ? classColorByName(active.className) : t.text, fontSize: 30, fontFamily: t.black,
        textShadowColor: (active ? classColorByName(active.className) : t.cyan) + '55', textShadowRadius: 14 }}>
        {active ? active.name : 'RAIDEX'}
      </Text>
      <Text style={{ color: t.textMuted, marginTop: 4, marginBottom: 18, fontFamily: t.body }}>
        {guild ? `${guild.displayName} · ${guild.realmName}` : tr('onboarding.welcome')}
      </Text>

      {active && (
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 18 }}>
          <Stat label={tr('wow.itemLevel')} value={active.itemLevel ?? '—'} accent={t.cyan} />
          <Stat label={tr('wow.mplusRating')} value={active.mythicRating ? formatNumber(active.mythicRating) : '—'} accent={active.mythicRating ? t.magenta : undefined} />
          <Stat label={tr('wow.achievements')} value={formatNumber(active.achievementPoints)} />
        </View>
      )}

      <NeonHeader color={t.magenta}>{tr('dashboard.nextRaid')}</NeonHeader>
      {data.nextRaid ? (
        <View style={{ borderRadius: 18, overflow: 'hidden' }}>
          <LinearGradient colors={diff?.grad || t.gradMagenta} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 18 }}>
            <View style={{ backgroundColor: 'rgba(8,8,13,0.5)', alignSelf: 'flex-start', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 }}>
              <Text style={{ color: '#fff', fontSize: 11, fontFamily: t.bold, letterSpacing: 0.8 }}>{diff?.label?.toUpperCase()}</Text>
            </View>
            <Text style={{ color: 'rgba(255,255,255,0.9)', marginTop: 10, fontFamily: t.bodyMed }}>{formatDateTime(data.nextRaid.starts_at)} · {countdown(data.nextRaid.starts_at)}</Text>
            <Text style={{ color: '#fff', fontSize: 22, fontFamily: t.display, marginTop: 4 }}>{data.nextRaid.title}</Text>
            {data.nextRaid.description ? <Text style={{ color: 'rgba(255,255,255,0.8)', marginTop: 4, fontFamily: t.body }}>{data.nextRaid.description}</Text> : null}
            <RoleCounts counts={data.nextRaid.counts} />
          </LinearGradient>
        </View>
      ) : (
        <Card><Text style={{ color: t.textMuted, fontFamily: t.body }}>{tr('dashboard.noRaid')}</Text></Card>
      )}

      <View style={{ height: 16 }} />
      <NeonHeader color={t.cyan}>{tr('dashboard.weeklyReset')}</NeonHeader>
      <Card style={{ alignItems: 'center' }}>
        <MaterialCommunityIcons name="recycle-variant" size={30} color={t.cyan} style={{ textShadowColor: t.cyan + '80', textShadowRadius: 14 }} />
        <Text style={{ color: t.cyan, fontSize: 20, fontFamily: t.black, marginTop: 6, textShadowColor: t.cyan + '80', textShadowRadius: 12 }}>{countdown(data.weeklyResetAt)}</Text>
        <Text style={{ color: t.textMuted, fontSize: 13, fontFamily: t.mono }}>{formatDateTime(data.weeklyResetAt)}</Text>
      </Card>

      {(data.events?.length || data.widgets?.length) ? (
        <>
          <View style={{ height: 16 }} />
          <NeonHeader color={t.violet}>{tr('dashboard.news')}</NeonHeader>
          {data.events?.map((e) => (
            <Card key={e.key} style={{ flexDirection: 'row', gap: 12, marginBottom: 10, borderLeftWidth: 3, borderLeftColor: e.accent || t.cyan }}>
              <Text style={{ fontSize: 24 }}>{e.icon || '📌'}</Text>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
                  <Text style={{ color: t.text, fontFamily: t.bodySemi }}>{e.title}</Text>
                  {e.computed ? <Text style={{ color: t.textFaint, fontFamily: t.mono, fontSize: 9, letterSpacing: 0.5 }}>{tr('dashboard.computed')}</Text> : null}
                </View>
                <Text style={{ color: t.textDim, fontSize: 13.5, lineHeight: 19, fontFamily: t.body }}>{e.body}</Text>
              </View>
            </Card>
          ))}
          {data.widgets?.map((w) => (
            <Card key={w.key} style={{ flexDirection: 'row', gap: 12, marginBottom: 10, borderLeftWidth: 3, borderLeftColor: w.accent || t.magenta }}>
              <Text style={{ fontSize: 24 }}>{w.icon || '📌'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontFamily: t.bodySemi, marginBottom: 3 }}>{w.title}</Text>
                <Text style={{ color: t.textDim, fontSize: 13.5, lineHeight: 19, fontFamily: t.body }}>{w.body}</Text>
              </View>
            </Card>
          ))}
        </>
      ) : null}

      {!guild && <Empty>{tr('dashboard.noGuild')}</Empty>}
    </ScrollView>
  );
}
