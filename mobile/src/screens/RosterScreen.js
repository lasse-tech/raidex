// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { View, Text, FlatList, TextInput, RefreshControl, Pressable, ScrollView, Image } from 'react-native';
import { useTheme, classColor, className, formatNumber, mplusColor, factionColor } from '../theme.js';
import { useAuth } from '../auth.js';
import { api } from '../api.js';
import { Avatar, Loading, Empty, BottomSheet, SectionTitle } from '../ui.js';
import CharacterSheet from './CharacterSheet.js';
import { t as tr } from '../i18n/index.js';

const GOLD = '#F5C451';
const PAGE_SIZE = 25;

function GuildPicker() {
  const t = useTheme();
  const { me, refresh } = useAuth();
  const guilds = me?.guilds || [];
  const activeId = me?.activeGuild?.id;
  if (guilds.length < 2) return null;
  const pick = async (id) => { if (id !== activeId) { await api.selectGuild(id); await refresh(); } };
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }} contentContainerStyle={{ gap: 8 }}>
      {guilds.map((g) => {
        const on = g.id === activeId;
        const fc = factionColor(g.faction);
        return (
          <Pressable key={g.id} onPress={() => pick(g.id)}
            style={{ borderWidth: 1.5, borderColor: on ? fc : t.border, backgroundColor: on ? t.surface : 'transparent', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: fc }} />
            <Text style={{ color: on ? t.text : t.textMuted, fontFamily: t.bodySemi, fontSize: 13 }}>{g.displayName}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function FilterPill({ label, active, onPress }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: active ? t.magenta : t.border, backgroundColor: active ? 'rgba(255,45,120,0.14)' : t.surface, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}>
      <Text style={{ color: active ? t.magenta : t.textDim, fontFamily: t.bodyMed, fontSize: 12.5 }}>{label}</Text>
      <Text style={{ color: active ? t.magenta : t.textFaint, fontSize: 10 }}>▾</Text>
    </Pressable>
  );
}

function SortToggle({ sortKey, onChange }) {
  const t = useTheme();
  const opts = [['mythicRating', tr('wow.mplus')], ['achievementPoints', tr('wow.achievements')]];
  return (
    <View style={{ flexDirection: 'row', backgroundColor: t.surface, borderRadius: 999, borderWidth: 1, borderColor: t.border, padding: 3 }}>
      {opts.map(([k, lbl]) => {
        const on = sortKey === k;
        return (
          <Pressable key={k} onPress={() => onChange(k)}
            style={{ borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: on ? t.magenta : 'transparent' }}>
            <Text style={{ color: on ? '#fff' : t.textMuted, fontFamily: t.bodySemi, fontSize: 12.5 }}>{lbl}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function RosterScreen() {
  const t = useTheme();
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [sheet, setSheet] = useState(null);
  const [filters, setFilters] = useState({ classId: null, race: null });
  const [sortKey, setSortKey] = useState('mythicRating');
  const [openFilter, setOpenFilter] = useState(null); // 'classId' | 'race' | 'rank'
  const [page, setPage] = useState(0);
  const listRef = useRef(null);

  const load = useCallback(() => api.roster().then(setData).catch(() => setData({ members: [] })), []);
  useEffect(() => { load(); }, [load]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  const toggleLead = useCallback(async (m) => {
    if (m.isGM) return; // the GM is always a lead
    try {
      await api.setRaidlead({ realm: m.realm, name: m.name, on: !m.isRaidlead });
      setData((d) => ({ ...d, members: d.members.map((x) => (x.id === m.id ? { ...x, isRaidlead: !x.isRaidlead } : x)) }));
    } catch {}
  }, []);

  const toggleQuartermaster = useCallback(async (m) => {
    try {
      await api.setQuartermaster({ realm: m.realm, name: m.name, on: !m.isQuartermaster });
      setData((d) => ({ ...d, members: d.members.map((x) => (x.id === m.id ? { ...x, isQuartermaster: !x.isQuartermaster } : x)) }));
    } catch {}
  }, []);

  const options = useMemo(() => {
    const m = data?.members || [];
    return {
      classId: [...new Set(m.map((x) => x.classId).filter((x) => x != null))].sort((a, b) => className(a).localeCompare(className(b))),
      race: [...new Set(m.map((x) => x.race).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    };
  }, [data]);

  const rows = useMemo(() => {
    let m = data?.members || [];
    if (q) m = m.filter((x) => x.name.toLowerCase().includes(q.toLowerCase()));
    if (filters.classId != null) m = m.filter((x) => x.classId === filters.classId);
    if (filters.race != null) m = m.filter((x) => x.race === filters.race);
    return [...m].sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0));
  }, [data, q, filters, sortKey]);

  // Reset to the first page whenever the result set changes.
  useEffect(() => { setPage(0); }, [q, filters, sortKey]);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages - 1);
  const pageRows = rows.slice(pageSafe * PAGE_SIZE, (pageSafe + 1) * PAGE_SIZE);
  const goPage = (p) => { setPage(p); listRef.current?.scrollToOffset({ offset: 0, animated: false }); };

  if (!data) return <Loading />;

  const anyFilter = filters.classId != null || filters.race != null;
  const pillLabel = {
    classId: filters.classId != null ? className(filters.classId, tr('wow.classLabel')) : tr('wow.classLabel'),
    race: filters.race || tr('wow.race'),
  };
  const crest = data.guild;

  const Header = (
    <View style={{ padding: 16, paddingBottom: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {crest?.crestEmblemUrl ? (
          <View style={{ width: 40, height: 40, borderRadius: 11, backgroundColor: crest.crestBg || t.surface2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: t.border }}>
            <Image source={{ uri: crest.crestEmblemUrl }} style={{ width: 28, height: 28 }} />
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.text, fontSize: 24, fontFamily: t.black, letterSpacing: 0.5 }}>{tr('roster.title')}</Text>
          <Text style={{ color: t.textMuted, fontFamily: t.mono, fontSize: 12 }}>
            {tr('roster.members', { count: data.members?.length || 0 })}{data.guild?.scanning ? tr('roster.scanning') : ''}
          </Text>
        </View>
      </View>

      <View style={{ height: 12 }} />
      <GuildPicker />
      <TextInput value={q} onChangeText={setQ} placeholder={tr('common.search')} placeholderTextColor={t.textFaint}
        style={{ backgroundColor: t.surface, borderColor: t.border, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 10, color: t.text, fontFamily: t.body }} />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 12 }}>
        <FilterPill label={pillLabel.classId} active={filters.classId != null} onPress={() => setOpenFilter('classId')} />
        <FilterPill label={pillLabel.race} active={filters.race != null} onPress={() => setOpenFilter('race')} />
        {anyFilter && (
          <Pressable onPress={() => setFilters({ classId: null, race: null })} hitSlop={6} style={{ paddingHorizontal: 8, paddingVertical: 6 }}>
            <Text style={{ color: t.textMuted, fontFamily: t.mono, fontSize: 11 }}>{tr('common.reset')}</Text>
          </Pressable>
        )}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
        <Text style={{ color: t.textFaint, fontFamily: t.mono, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' }}>{tr('roster.sort')}</Text>
        <SortToggle sortKey={sortKey} onChange={setSortKey} />
      </View>
    </View>
  );

  const pagerBtn = (disabled) => ({
    borderWidth: 1, borderColor: disabled ? t.border : t.borderStrong, borderRadius: 999,
    paddingHorizontal: 18, paddingVertical: 9, opacity: disabled ? 0.4 : 1,
  });
  const Footer = totalPages > 1 ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, paddingVertical: 22 }}>
      <Pressable disabled={pageSafe === 0} onPress={() => goPage(pageSafe - 1)} style={pagerBtn(pageSafe === 0)}>
        <Text style={{ color: t.text, fontFamily: t.bodySemi, fontSize: 16 }}>‹</Text>
      </Pressable>
      <Text style={{ color: t.textDim, fontFamily: t.mono, fontSize: 13 }}>{tr('roster.page', { page: pageSafe + 1, total: totalPages })}</Text>
      <Pressable disabled={pageSafe >= totalPages - 1} onPress={() => goPage(pageSafe + 1)} style={pagerBtn(pageSafe >= totalPages - 1)}>
        <Text style={{ color: t.text, fontFamily: t.bodySemi, fontSize: 16 }}>›</Text>
      </Pressable>
    </View>
  ) : null;

  return (
    <>
      <FlatList
        ref={listRef}
        style={{ flex: 1, backgroundColor: t.bg }}
        data={pageRows}
        keyExtractor={(m) => m.id}
        ListHeaderComponent={Header}
        ListFooterComponent={Footer}
        ListEmptyComponent={<Empty>{tr('roster.none')}</Empty>}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.magenta} />}
        renderItem={({ item: m }) => {
          const color = classColor(m.classId);
          const mc = mplusColor(m.mythicRating, m.mythicRatingColor);
          const showMplus = sortKey === 'mythicRating';
          const rightVal = showMplus ? (m.mythicRating ? formatNumber(m.mythicRating) : '—') : formatNumber(m.achievementPoints);
          const rightColor = showMplus ? (m.mythicRating ? mc : t.textMuted) : t.text;
          return (
            <Pressable
              onPress={() => setSheet({ realm: m.realm, name: m.name })}
              android_ripple={{ color: t.surface2 }}
              style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomColor: t.border, borderBottomWidth: 1 }}>
              <Avatar uri={m.avatar} name={m.name} color={color} size={54} ring={color} />
              <View style={{ flex: 1, marginLeft: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                  <Text style={{ color, fontFamily: t.bodySemi, fontSize: 16 }}>{m.name}</Text>
                  {m.isRaidlead && (
                    <View style={{ borderWidth: 1, borderColor: GOLD, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1 }}>
                      <Text style={{ color: GOLD, fontSize: 10, fontFamily: t.mono }}>{tr(m.isGM ? 'roster.badgeGm' : 'roster.badgeLead')}</Text>
                    </View>
                  )}
                  {m.isQuartermaster && (
                    <View style={{ borderWidth: 1, borderColor: t.cyan, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1 }}>
                      <Text style={{ color: t.cyan, fontSize: 10, fontFamily: t.mono }}>{tr('roster.badgeGuides')}</Text>
                    </View>
                  )}
                </View>
                <Text style={{ color: t.textMuted, fontSize: 12.5, fontFamily: t.body }}>
                  {tr('wow.level', { level: m.level })} · {m.race ? `${m.race} ` : ''}{className(m.classId)}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: rightColor, fontFamily: t.black, fontSize: 16 }}>{rightVal}</Text>
                <Text style={{ color: t.textFaint, fontSize: 10, fontFamily: t.mono, letterSpacing: 0.5 }}>{showMplus ? tr('wow.mplus') : tr('wow.achievements').toUpperCase()}</Text>
              </View>
              {data.canManageRaidleads && (
                <Pressable onPress={() => toggleLead(m)} disabled={m.isGM} hitSlop={8} style={{ marginLeft: 12, padding: 4 }}
                  accessibilityRole="button"
                  accessibilityLabel={tr(m.isGM ? 'roster.a11yGmLead' : m.isRaidlead ? 'roster.a11yRemoveLead' : 'roster.a11yMakeLead', { name: m.name })}>
                  <Text style={{ fontSize: 22, color: m.isRaidlead ? GOLD : t.textFaint }}>{m.isRaidlead ? '★' : '☆'}</Text>
                </Pressable>
              )}
              {data.canManageQuartermasters && (
                <Pressable onPress={() => toggleQuartermaster(m)} hitSlop={8} style={{ marginLeft: 8, padding: 4, opacity: m.isQuartermaster ? 1 : 0.4 }}
                  accessibilityRole="button"
                  accessibilityLabel={tr(m.isQuartermaster ? 'roster.a11yRemoveQm' : 'roster.a11yMakeQm', { name: m.name })}>
                  <Text style={{ fontSize: 20 }}>📖</Text>
                </Pressable>
              )}
            </Pressable>
          );
        }}
      />

      {openFilter && (
        <BottomSheet onClose={() => setOpenFilter(null)} maxHeightPct={70}>
          <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 30 }}>
            <SectionTitle>{openFilter === 'classId' ? tr('wow.classLabel') : tr('wow.race')}</SectionTitle>
            <Pressable onPress={() => { setFilters((f) => ({ ...f, [openFilter]: null })); setOpenFilter(null); }}
              style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: t.border }}>
              <Text style={{ color: filters[openFilter] == null ? t.magenta : t.textDim, fontFamily: t.bodySemi, fontSize: 15 }}>{tr('common.all')}</Text>
            </Pressable>
            {options[openFilter].map((val) => {
              const label = openFilter === 'classId' ? className(val, tr('wow.classN', { id: val })) : val;
              const col = openFilter === 'classId' ? classColor(val) : t.text;
              const on = filters[openFilter] === val;
              return (
                <Pressable key={String(val)} onPress={() => { setFilters((f) => ({ ...f, [openFilter]: val })); setOpenFilter(null); }}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: t.border }}>
                  <Text style={{ color: on ? t.magenta : col, fontFamily: on ? t.bodySemi : t.body, fontSize: 15 }}>{label}</Text>
                  {on && <Text style={{ color: t.magenta, fontSize: 16 }}>✓</Text>}
                </Pressable>
              );
            })}
          </ScrollView>
        </BottomSheet>
      )}

      {sheet && <CharacterSheet realm={sheet.realm} name={sheet.name} onClose={() => setSheet(null)} />}
    </>
  );
}
