// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: MIT
import { useEffect, useState, useCallback, useRef } from 'react';
import { ScrollView, View, Text, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme, classColorByName, className, formatNumber, mplusColor, countdown } from '../theme.js';
import { useAuth } from '../auth.js';
import { api } from '../api.js';
import { Card, Avatar, Loading, Pill } from '../ui.js';
import { t as tr } from '../i18n/index.js';

// `onboarding` is the same screen in its gate role: it is what a user without a
// main sees instead of the app, so it explains what the choice decides rather
// than just listing characters. See OnboardingScreen.js.
export default function CharactersScreen({ onboarding = false }) {
  const t = useTheme();
  const { me, refresh } = useAuth();
  const [chars, setChars] = useState(null);
  const [selecting, setSelecting] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [reloadInfo, setReloadInfo] = useState(null); // { limit, remaining, nextAt }
  const [, setTick] = useState(0);
  const aliveRef = useRef(true);
  const activeId = me?.activeCharacter?.id;

  // Load the account's characters and enrich each with live detail.
  // force=true bypasses the server-side 10-min cache (fixes stale data).
  const load = useCallback(async (force = false) => {
    try {
      const list = await api.characters();
      if (!aliveRef.current) return;
      setChars(list.map((c) => ({ ...c, loading: true })));
      await Promise.all(list.slice(0, 12).map(async (c) => {
        try {
          const d = await api.character(c.realmSlug, c.name, force);
          if (aliveRef.current) setChars((p) => p?.map((x) => (x.id === c.id ? { ...x, ...d, loading: false } : x)));
        } catch {
          if (aliveRef.current) setChars((p) => p?.map((x) => (x.id === c.id ? { ...x, loading: false } : x)));
        }
      }));
    } catch { if (aliveRef.current) setChars([]); }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    load(false);
    api.reloadStatus().then((s) => aliveRef.current && setReloadInfo(s)).catch(() => {});
    return () => { aliveRef.current = false; };
  }, [load]);

  // Tick the countdown; refetch the budget once a slot frees.
  useEffect(() => {
    const id = setInterval(() => {
      setTick((x) => x + 1);
      setReloadInfo((info) => {
        if (info?.nextAt && Date.now() >= info.nextAt) api.reloadStatus().then((s) => aliveRef.current && setReloadInfo(s)).catch(() => {});
        return info;
      });
    }, 30000);
    return () => clearInterval(id);
  }, []);

  const reload = useCallback(async () => {
    let info = reloadInfo;
    try { info = await api.reloadStatus(); if (aliveRef.current) setReloadInfo(info); } catch {}
    if (info && info.remaining <= 0) return; // budget exhausted — countdown is shown instead
    setRefreshing(true);
    try {
      const s = await api.reloadCharacters();
      if (aliveRef.current) setReloadInfo(s);
      await load(true); await refresh(); // also refresh the active character elsewhere
    } catch (e) {
      if (e?.status === 429) { try { const s = await api.reloadStatus(); if (aliveRef.current) setReloadInfo(s); } catch {} }
    } finally { if (aliveRef.current) setRefreshing(false); }
  }, [reloadInfo, load, refresh]);

  const select = useCallback(async (id) => {
    setSelecting(id);
    try { await api.selectCharacter(id); await refresh(); }
    finally { setSelecting(null); }
  }, [refresh]);

  if (!chars) return <Loading />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={t.magenta} />}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.text, fontSize: 24, fontFamily: t.black, letterSpacing: 0.5 }}>
            {tr(onboarding ? 'characters.pickMain' : 'characters.title')}
          </Text>
          <Text style={{ color: t.textMuted, marginBottom: 14, fontFamily: t.body }}>
            {tr(onboarding ? 'characters.mainSetsGuildFull' : 'characters.mainSetsGuild')}
          </Text>
        </View>
        {(() => {
          const blocked = !!(reloadInfo && reloadInfo.remaining <= 0 && reloadInfo.nextAt);
          const tint = blocked ? t.textMuted : t.cyan;
          return (
            <Pressable onPress={reload} disabled={refreshing || blocked} hitSlop={8}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: blocked ? t.border : t.borderStrong, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, opacity: refreshing ? 0.5 : 1 }}>
              {refreshing
                ? <ActivityIndicator color={t.cyan} size="small" />
                : <MaterialCommunityIcons name={blocked ? 'clock-outline' : 'refresh'} size={16} color={tint} />}
              <Text style={{ color: tint, fontFamily: t.bodySemi, fontSize: 12 }}>
                {blocked ? countdown(reloadInfo.nextAt, true) : tr('characters.reload')}
              </Text>
            </Pressable>
          );
        })()}
      </View>

      {chars.length === 0 && (
        <Text style={{ color: t.textMuted, fontFamily: t.body, textAlign: 'center', paddingVertical: 40 }}>
          {tr('characters.none')}
          {onboarding ? `\n${tr('characters.noneHint')}` : ''}
        </Text>
      )}

      {chars.map((c) => {
        const color = classColorByName(c.className);
        const isActive = c.id === activeId;
        const mc = mplusColor(c.mythicRating, c.mythicRatingColor);
        return (
          <Card key={c.id} style={{ marginBottom: 12, borderColor: isActive ? t.accent : t.border, borderWidth: isActive ? 2 : 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Avatar uri={c.images?.avatar} name={c.name} color={color} size={62} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ color, fontSize: 18, fontWeight: '800' }}>{c.name}</Text>
                  {isActive && <Pill color={t.accent}>{tr('characters.main')}</Pill>}
                </View>
                <Text style={{ color: t.textMuted, fontSize: 13 }}>{tr('wow.level', { level: c.level })} · {className(c.classId, c.className)}{c.specName ? ` · ${c.specName}` : ''}</Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 18, marginTop: 12 }}>
              <Mini t={t} label={tr('wow.itemLevel')} value={c.itemLevel ?? '—'} />
              <Mini t={t} label={tr('wow.mplus')} value={c.mythicRating ? formatNumber(c.mythicRating) : '—'} color={c.mythicRating ? mc : undefined} />
              <Mini t={t} label={tr('wow.achievements')} value={c.achievementPoints ? formatNumber(c.achievementPoints) : '—'} />
            </View>

            {!isActive && (
              <Pressable onPress={() => select(c.id)} disabled={selecting === c.id}
                style={{ backgroundColor: t.frost3, borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 12 }}>
                {selecting === c.id ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>{tr('characters.setMain')}</Text>}
              </Pressable>
            )}
          </Card>
        );
      })}
    </ScrollView>
  );
}

function Mini({ t, label, value, color }) {
  return (
    <View>
      <Text style={{ color: color || t.text, fontWeight: '800', fontSize: 15 }}>{value}</Text>
      <Text style={{ color: t.textMuted, fontSize: 11 }}>{label}</Text>
    </View>
  );
}
