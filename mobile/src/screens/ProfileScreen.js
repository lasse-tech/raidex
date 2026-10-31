// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: MIT
import { useState } from 'react';
import { ScrollView, View, Text, Pressable, Image, ActivityIndicator, Alert } from 'react-native';
import { openLink } from '../openLink.js';
import { useTheme, classColorByName, className, factionLabel, formatNumber, mplusTier, mplusColor, raiderIoUrl } from '../theme.js';
import { useAuth } from '../auth.js';
import { api } from '../api.js';
import { LOCALE_DEFAULT, LOCALE_OPTIONS, resolveLocale, systemLocale } from '../locale.js';
import { Card, Avatar, Stat, SectionTitle, Empty } from '../ui.js';
import { t as tr } from '../i18n/index.js';

export default function ProfileScreen() {
  const t = useTheme();
  const { me, logout } = useAuth();
  const c = me?.activeCharacter;
  const color = c ? classColorByName(c.className) : t.accent;
  const render = c?.images?.main;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }}>
      <Text style={{ color: t.textMuted, marginBottom: 16, fontFamily: t.mono, fontSize: 12 }}>{me?.user?.battletag} · {tr(me?.user?.isGM ? 'guildRole.gm' : me?.user?.isAdmin ? 'guildRole.lead' : 'guildRole.member').toUpperCase()}</Text>

      {!c ? (
        <Empty>{tr('profile.noChar')}</Empty>
      ) : (
        <>
          <Card style={{ marginBottom: 14, height: 200, padding: 14, overflow: 'hidden' }}>
            <View style={{ position: 'absolute', top: 8, bottom: 8, right: 8, width: '54%', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {render && !render.startsWith('data:image/svg')
                ? <Image source={{ uri: render }} style={{ width: '150%', height: '150%', transform: [{ translateX: 20 }, { translateY: -16 }] }} resizeMode="cover" />
                : <Avatar uri={c.images?.avatar} name={c.name} color={color} size={130} />}
            </View>
            <View style={{ position: 'absolute', left: 14, right: 14, top: 0, bottom: 0, justifyContent: 'center' }}>
              <View style={{ maxWidth: '58%' }}>
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.4} style={{ color, fontSize: 27, fontFamily: t.black }}>{c.title || c.name}</Text>
              </View>
              {c.guild ? <Text numberOfLines={1} style={{ color: t.textDim, fontSize: 13, marginTop: 5 }}>&lt;{c.guild}&gt;</Text> : null}
              <Text numberOfLines={1} style={{ color: t.textDim, fontSize: 13, marginTop: 3 }}>{tr('wow.level', { level: c.level })} {c.raceName}</Text>
              <Text numberOfLines={1} style={{ color: t.textDim, fontSize: 13, marginTop: 1 }}>{className(c.classId, c.className)}{c.specName ? ` · ${c.specName}` : ''}</Text>
            </View>
          </Card>

          <Pressable
            onPress={() => openLink(raiderIoUrl(c))}
            android_ripple={{ color: t.surface2 }}
            style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: t.borderStrong, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, marginBottom: 14 }}>
            <Text style={{ fontSize: 14 }}>🌐</Text>
            <Text style={{ color: t.cyan, fontFamily: t.bodySemi, fontSize: 13 }}>{tr('wow.raiderio')}</Text>
          </Pressable>

          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
            <Stat label={tr('wow.itemLevel')} value={c.itemLevel ?? '—'} />
            <Stat label={tr('wow.mplusRating')} value={c.mythicRating ? formatNumber(c.mythicRating) : '—'} accent={c.mythicRating ? mplusColor(c.mythicRating, c.mythicRatingColor) : undefined} />
            <Stat label={tr('wow.achievements')} value={formatNumber(c.achievementPoints)} accent={t.yellow} />
          </View>

          <SectionTitle>{tr('common.details')}</SectionTitle>
          <Card>
            <Detail t={t} k={tr('wow.classLabel')} v={className(c.classId, c.className)} color={color} />
            <Detail t={t} k={tr('wow.spec')} v={c.specName || '—'} />
            <Detail t={t} k={tr('wow.race')} v={c.raceName || '—'} />
            <Detail t={t} k={tr('guild.faction')} v={factionLabel(c.faction)} />
            <Detail t={t} k={tr('wow.mplusTier')} v={mplusTier(c.mythicRating || 0).label} color={mplusColor(c.mythicRating, c.mythicRatingColor)} last />
          </Card>
        </>
      )}

      <LocaleSetting t={t} />

      <Pressable onPress={logout} style={{ borderColor: t.red, borderWidth: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 20 }}>
        <Text style={{ color: t.red, fontWeight: '700' }}>{tr('common.signOut')}</Text>
      </Pressable>

      {me?.user?.isDemo ? <DeleteDemo t={t} /> : null}
    </ScrollView>
  );
}

// Demo accounts are created in the app, so they can be deleted in the app.
function DeleteDemo({ t }) {
  const { deleteAccount } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const run = async () => {
    setBusy(true); setError(null);
    try { await deleteAccount(); }
    catch { setError(tr('profile.deleteFailed')); setBusy(false); }
  };
  const ask = () => Alert.alert(tr('profile.deleteDemo'), tr('profile.deleteDemoConfirm'), [
    { text: tr('common.cancel'), style: 'cancel' },
    { text: tr('common.delete'), style: 'destructive', onPress: run },
  ]);

  return (
    <>
      <Pressable onPress={ask} disabled={busy} style={{ paddingVertical: 13, alignItems: 'center', marginTop: 8 }}>
        {busy ? <ActivityIndicator size="small" color={t.red} /> : <Text style={{ color: t.red, fontFamily: t.bodySemi, fontSize: 13 }}>{tr('profile.deleteDemo')}</Text>}
      </Pressable>
      {error ? <Text style={{ color: t.red, fontSize: 12.5, textAlign: 'center' }}>{error}</Text> : null}
    </>
  );
}

// Date and time format. A stored preference rather than a device lookup: no
// client can read the host's format settings, only its UI language, so a device
// set to English but formatting dates the German way still reports en-US.
function LocaleSetting({ t }) {
  const { me, refresh } = useAuth();
  const pref = me?.user?.locale || LOCALE_DEFAULT;
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  const change = async (value) => {
    if (value === pref || busy) return;
    setBusy(value); setError(null);
    try {
      await api.setLocale(value);
      await refresh();
    } catch { setError(tr('profile.saveFailed')); }
    finally { setBusy(null); }
  };

  const sample = new Intl.DateTimeFormat(resolveLocale(pref), {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(Date.now());

  return (
    <>
      <SectionTitle>{tr('profile.dateTime')}</SectionTitle>
      <Card>
        <Text style={{ color: t.textDim, fontSize: 12.5, marginBottom: 12 }}>
          {tr('profile.example')}: <Text style={{ color: t.text, fontFamily: t.mono }}>{sample}</Text>
        </Text>
        {LOCALE_OPTIONS.map((o, i) => {
          const on = o.value === pref;
          return (
            <Pressable key={o.value} onPress={() => change(o.value)} android_ripple={{ color: t.surface2 }}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                paddingVertical: 11, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: t.border }}>
              <Text style={{ color: on ? t.text : t.textDim, fontFamily: on ? t.bodySemi : undefined, fontSize: 14, flex: 1 }}>
                {o.value === 'system' ? `${o.label} (${systemLocale()})` : o.label}
              </Text>
              {busy === o.value
                ? <ActivityIndicator size="small" color={t.accent} />
                : on ? <Text style={{ color: t.accent, fontWeight: '700' }}>✓</Text> : null}
            </Pressable>
          );
        })}
      </Card>
      {error ? <Text style={{ color: t.red, fontSize: 12.5, marginTop: 8 }}>{error}</Text> : null}
    </>
  );
}

function Detail({ t, k, v, color, last }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, borderBottomWidth: last ? 0 : 1, borderBottomColor: t.border }}>
      <Text style={{ color: t.textMuted }}>{k}</Text>
      <Text style={{ color: color || t.text, fontWeight: '700' }}>{v}</Text>
    </View>
  );
}
