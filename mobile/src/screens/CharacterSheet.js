// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react';
import { ScrollView, View, Text, Image, Pressable, ActivityIndicator } from 'react-native';
import { openLink } from '../openLink.js';
import { useTheme, classColorByName, className, factionLabel, formatNumber, mplusTier, mplusColor, raiderIoUrl } from '../theme.js';
import { api } from '../api.js';
import { Card, Stat, SectionTitle, Avatar, BottomSheet } from '../ui.js';
import { t as tr } from '../i18n/index.js';

export default function CharacterSheet({ realm, name, onClose }) {
  const t = useTheme();
  const [c, setC] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    api.character(realm, name).then((d) => alive && setC(d)).catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, [realm, name]);

  const color = c ? classColorByName(c.className) : t.accent;
  const render = c?.images?.main;
  const isRaster = render && !render.startsWith('data:image/svg');

  return (
    <BottomSheet onClose={onClose}>
      {!c && !failed && (
        <View style={{ padding: 48, alignItems: 'center' }}><ActivityIndicator size="large" color={t.accent} /></View>
      )}
      {failed && (
        <View style={{ padding: 40, alignItems: 'center' }}>
          <Text style={{ color: t.textMuted }}>{tr('characters.loadFailed')}</Text>
          <Pressable onPress={onClose} style={{ marginTop: 16 }}><Text style={{ color: t.accent, fontFamily: t.bold }}>{tr('common.close')}</Text></Pressable>
        </View>
      )}
      {c && (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
          <View style={{ height: 208 }}>
            <View style={{ position: 'absolute', top: 8, bottom: 8, right: 8, width: '54%', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {isRaster
                ? <Image source={{ uri: render }} style={{ width: '150%', height: '150%', transform: [{ translateX: 20 }, { translateY: -16 }] }} resizeMode="cover" />
                : <Avatar uri={c.images?.avatar} name={c.name} color={color} size={130} />}
            </View>
            <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'center' }}>
              <View style={{ maxWidth: '58%' }}>
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.4} style={{ color, fontSize: 28, fontFamily: t.black }}>{c.title || c.name}</Text>
              </View>
              {c.guild ? <Text numberOfLines={1} style={{ color: t.textDim, fontSize: 13.5, marginTop: 5 }}>&lt;{c.guild}&gt;</Text> : null}
              <Text numberOfLines={1} style={{ color: t.textDim, fontSize: 13.5, marginTop: 3 }}>{tr('wow.level', { level: c.level })} {c.raceName}</Text>
              <Text numberOfLines={1} style={{ color: t.textDim, fontSize: 13.5, marginTop: 1 }}>
                {className(c.classId, c.className)}{c.specName ? ` · ${c.specName}` : ''}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
            <Stat label={tr('wow.itemLevel')} value={c.itemLevel ?? '—'} accent={t.cyan} />
            <Stat label={tr('wow.mplusRating')} value={c.mythicRating ? formatNumber(c.mythicRating) : '—'} accent={c.mythicRating ? mplusColor(c.mythicRating, c.mythicRatingColor) : undefined} />
            <Stat label={tr('wow.achievements')} value={formatNumber(c.achievementPoints)} accent={t.yellow} />
          </View>

          <SectionTitle>{tr('common.details')}</SectionTitle>
          <Card>
            <Row t={t} k={tr('wow.classLabel')} v={className(c.classId, c.className)} color={color} />
            <Row t={t} k={tr('wow.spec')} v={c.specName || '—'} />
            <Row t={t} k={tr('wow.race')} v={c.raceName || '—'} />
            <Row t={t} k={tr('guild.faction')} v={factionLabel(c.faction)} />
            <Row t={t} k={tr('wow.mplusTier')} v={mplusTier(c.mythicRating || 0).label} color={mplusColor(c.mythicRating, c.mythicRatingColor)} last />
          </Card>

          <Pressable
            onPress={() => openLink(raiderIoUrl(c))}
            android_ripple={{ color: t.surface2 }}
            style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: t.borderStrong, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, marginTop: 14 }}>
            <Text style={{ fontSize: 14 }}>🌐</Text>
            <Text style={{ color: t.cyan, fontFamily: t.bodySemi, fontSize: 13 }}>{tr('wow.raiderio')}</Text>
          </Pressable>
        </ScrollView>
      )}
    </BottomSheet>
  );
}

function Row({ t, k, v, color, last }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: last ? 0 : 1, borderBottomColor: t.border }}>
      <Text style={{ color: t.textMuted }}>{k}</Text>
      <Text style={{ color: color || t.text, fontWeight: '700' }}>{v}</Text>
    </View>
  );
}
