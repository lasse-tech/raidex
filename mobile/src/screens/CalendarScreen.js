// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: MIT
import { useEffect, useState, useCallback } from 'react';
import { ScrollView, View, Text, Pressable, Modal, RefreshControl, ActivityIndicator, TextInput, Alert, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker from '@react-native-community/datetimepicker';
import { openLink } from '../openLink.js';
import { useTheme, DIFFICULTIES, ROLES, classColorByName, formatDateTime, countdown } from '../theme.js';
import { useAuth } from '../auth.js';
import { api } from '../api.js';
import { Card, SectionTitle, Loading, Empty, GradientButton } from '../ui.js';
import { activeLocale } from '../locale.js';
import { t as tr } from '../i18n/index.js';

export default function CalendarScreen() {
  const t = useTheme();
  const { me } = useAuth();
  const [raids, setRaids] = useState(null);
  const [signupFor, setSignupFor] = useState(null);
  const [editing, setEditing] = useState(null); // raid | {} (new)
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => api.raids().then(setRaids).catch(() => setRaids([])), []);
  useEffect(() => { load(); }, [load]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);
  const removeSignup = useCallback(async (raidId, signupId) => {
    try { const updated = await api.removeSignup(raidId, signupId); setRaids((p) => p.map((r) => (r.id === updated.id ? updated : r))); } catch {}
  }, []);

  if (!raids) return <Loading />;

  return (
    <>
      <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.accent} />}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <View style={{ flex: 1, marginBottom: 14 }}>
            <Text style={{ color: t.text, fontSize: 24, fontFamily: t.black, letterSpacing: 0.5 }}>{tr('calendar.title')}</Text>
          </View>
          <Pressable onPress={() => setEditing({})} style={{ borderRadius: 11, overflow: 'hidden' }}>
            <LinearGradient colors={t.gradMagenta} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
              <Text style={{ color: '#fff', fontFamily: t.bold }}>{tr('calendar.new')}</Text>
            </LinearGradient>
          </Pressable>
        </View>

        {raids.length === 0 && <Empty>{tr('calendar.empty')}</Empty>}

        {raids.map((raid) => {
          const diff = DIFFICULTIES[raid.difficulty];
          const roster = (raid.roster || []).filter((s) => s.status !== 'absent');
          const bench = raid.bench || [];
          return (
            <Card key={raid.id} style={{ padding: 0, overflow: 'hidden', marginBottom: 14 }}>
              <LinearGradient colors={diff?.grad || t.gradMagenta} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 14 }}>
                <Text style={{ color: '#fff', fontFamily: t.bold, fontSize: 12, letterSpacing: 0.8 }}>{diff?.label?.toUpperCase()}</Text>
                <Text style={{ color: 'rgba(255,255,255,0.9)', fontFamily: t.bodyMed, marginTop: 4 }}>{formatDateTime(raid.starts_at)} · {countdown(raid.starts_at)}</Text>
              </LinearGradient>
              <View style={{ padding: 14 }}>
                <Text style={{ color: t.text, fontSize: 17, fontFamily: t.display }}>{raid.title}</Text>
                {raid.instance ? <Text style={{ color: t.textMuted, fontSize: 13 }}>{raid.instance} · {tr('common.minutes', { n: raid.duration_min })}</Text> : null}

                {raid.createdByName ? (() => {
                  // A Quartiermeister used to fall through to "Mitglied" here,
                  // while the web card named the role — same payload, two
                  // different answers. 📖 for the role that curates the guides.
                  const role = raid.createdByGM ? `👑 ${tr('guildRole.gm')}`
                    : raid.createdByLead ? `🛡️ ${tr('guildRole.lead')}`
                    : raid.createdByQM ? `📖 ${tr('guildRole.qm')}`
                    : null;
                  return (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                      <View style={{ borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, borderColor: role ? t.yellow : t.borderStrong }}>
                        <Text style={{ color: role ? t.yellow : t.textMuted, fontSize: 11, fontWeight: '700' }}>
                          {role || `👤 ${tr('guildRole.member')}`}
                        </Text>
                      </View>
                      <Text style={{ color: t.textMuted, fontSize: 12 }}>· {raid.createdByName}</Text>
                    </View>
                  );
                })() : null}

                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  {['tank', 'healer', 'dps'].map((role) => (
                    <View key={role} style={{ flex: 1, backgroundColor: t.surface2, borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}>
                      <Text style={{ color: ROLES[role].color, fontSize: 22, fontWeight: '800' }}>{raid.counts?.[role] ?? 0}</Text>
                      <Text style={{ color: t.textDim, fontSize: 13, fontWeight: '700' }}>{ROLES[role].icon} {ROLES[role].label}</Text>
                    </View>
                  ))}
                </View>

                {raid.instance ? <GuideChips instance={raid.instance} /> : null}

                {roster.length > 0 && (
                  <View style={{ marginTop: 12 }}>
                    <SectionTitle>{tr('calendar.lineup', { n: roster.length, max: raid.max_size })}</SectionTitle>
                    {roster.map((s) => (
                      <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 5, gap: 8 }}>
                        <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: ROLES[s.role]?.color }} />
                        <Text style={{ fontSize: 13 }}>{ROLES[s.role]?.icon}</Text>
                        <Text style={{ color: classColorByName(s.className), fontWeight: '700' }}>{s.name || tr('common.unknown')}</Text>
                        <Text style={{ color: t.textMuted, marginLeft: 'auto', fontSize: 12 }}>{s.status === 'tentative' ? tr('calendar.tentative') : ROLES[s.role]?.label}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {bench.length > 0 && (
                  <View style={{ marginTop: 12 }}>
                    <SectionTitle>{tr('calendar.bench')}</SectionTitle>
                    {bench.map((g) => (
                      <View key={g.userId} style={{ marginTop: 2 }}>
                        <Text style={{ color: t.textMuted, fontFamily: t.mono, fontSize: 11.5, paddingVertical: 2 }}>{g.mainName}</Text>
                        {g.alts.map((a) => (
                          <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4, gap: 7, paddingLeft: 8 }}>
                            <Text style={{ color: t.borderStrong, fontFamily: t.mono }}>└</Text>
                            <Text style={{ fontSize: 12 }}>{ROLES[a.role]?.icon}</Text>
                            <Text style={{ color: classColorByName(a.className), fontWeight: '700' }}>{a.name}</Text>
                            <Text style={{ color: t.textMuted, marginLeft: 'auto', fontSize: 12 }}>{a.status === 'tentative' ? tr('calendar.tentative') : ROLES[a.role]?.label}</Text>
                            {(a.mine || raid.canManage) && (
                              <Pressable onPress={() => removeSignup(raid.id, a.id)} hitSlop={8} style={{ paddingHorizontal: 4 }}>
                                <Text style={{ color: t.textFaint, fontSize: 16 }}>×</Text>
                              </Pressable>
                            )}
                          </View>
                        ))}
                      </View>
                    ))}
                  </View>
                )}

                <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                  <Pressable onPress={() => setSignupFor(raid)}
                    style={{ flex: 1, backgroundColor: raid.mySignup ? t.surface2 : t.frost3, borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}>
                    <Text style={{ color: raid.mySignup ? t.text : '#fff', fontWeight: '700' }}>
                      {raid.mySignup ? tr('calendar.signedUp', { role: ROLES[raid.mySignup.role]?.label }) : tr('calendar.signUp')}
                    </Text>
                  </Pressable>
                  {raid.canManage && (
                    <Pressable onPress={() => setEditing(raid)} style={{ borderColor: t.borderStrong, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, justifyContent: 'center' }}>
                      <Text style={{ color: t.text, fontWeight: '700' }}>✎</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            </Card>
          );
        })}
      </ScrollView>

      {signupFor && (
        <SignupModal raid={signupFor} me={me} onClose={() => setSignupFor(null)}
          onChange={(updated) => { setRaids((p) => p.map((r) => (r.id === updated.id ? updated : r))); setSignupFor(updated); }} />
      )}
      {editing && (
        <RaidFormModal raid={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} onDeleted={() => { setEditing(null); load(); }} />
      )}
    </>
  );
}

const SITE_DOMAIN = { wowhead: 'wowhead.com', method: 'method.gg', buffed: 'buffed.de' };
const siteIcon = (gd) => gd.iconUrl || (SITE_DOMAIN[gd.site] ? `https://www.google.com/s2/favicons?sz=64&domain=${SITE_DOMAIN[gd.site]}` : null);

// Raid guides for one instance: the global links (Wowhead/Method/buffed, in the
// right language) plus the guild's own; managers may add/remove their own.
// WoW item-quality colours, the same coding the web .rolechip variants use:
// legendary orange for the GM, epic purple for a raidlead, rare blue for a
// Quartiermeister.
const ROLE_CHIP = { gm: '#FFA53C', lead: '#C069FF', qm: '#3CA0FF' };

// Guides grouped by whoever added them, so a link someone in the guild curated
// carries their name and role instead of hiding among the automatic ones. The
// generated Wowhead/Method links have no author and stay in one group at the
// end, credited to the product itself; that heading only appears when there is
// a named group to tell it from, since a lone heading over the usual list would
// be noise.
//
// The role comes off the first guide of each author: the API derives it per row
// from the same account, so every row of a group carries the same one.
// The API's own fallback name (char_display_name()), compared, never shown.
const ANON = 'Mitglied';

function groupGuides(guides, locale, product) {
  const byPerson = new Map();
  const standard = [];
  for (const gd of guides) {
    if (gd.global) { standard.push(gd); continue; }
    const who = gd.createdBy || ANON;
    if (!byPerson.has(who)) byPerson.set(who, []);
    byPerson.get(who).push(gd);
  }
  // char_display_name() falls back to ANON for an account with no main set,
  // which reads wrong as a name — and that group belongs after the named ones
  // rather than alphabetically among them.
  const groups = [...byPerson.entries()]
    .sort((a, b) => (a[0] === ANON) - (b[0] === ANON) || a[0].localeCompare(b[0], locale))
    .map(([who, items]) => ({
      name: who === ANON ? tr('calendar.aMember') : who,
      role: guideRole(items[0]),
      items,
    }));
  // The generated links are Raidex's own contribution, so they get the same
  // "Von X" shape as a person — minus a role chip, since the app holds none.
  // Still only labelled when a named group exists to tell it from.
  if (standard.length) groups.push({ name: groups.length ? product : null, items: standard });
  return groups;
}

// Same wording and colour coding the raid card uses for its creator. Returns
// null when the author holds none of the three roles any more.
function guideRole(gd) {
  if (gd.createdByGM) return { cls: 'gm', label: tr('guildRole.gm') };
  if (gd.createdByLead) return { cls: 'lead', label: tr('guildRole.lead') };
  if (gd.createdByQM) return { cls: 'qm', label: tr('guildRole.qm') };
  return null;
}

function GuideChips({ instance }) {
  const t = useTheme();
  const { me } = useAuth();
  const [data, setData] = useState(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => api.guides(instance).then(setData).catch(() => setData({ guides: [] })), [instance]);
  useEffect(() => { load(); }, [load]);
  if (!data) return null;

  const canManage = !!data.canManage;
  const groups = groupGuides(data.guides || [], activeLocale(), me?.product || 'Raidex');
  const del = (gd) => Alert.alert(tr('calendar.removeGuide'), gd.title, [
    { text: tr('common.cancel'), style: 'cancel' },
    { text: tr('common.remove'), style: 'destructive', onPress: async () => { try { await api.deleteGuide(gd.id); load(); } catch {} } },
  ]);

  return (
    <View style={{ marginTop: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <SectionTitle>{tr('calendar.guides')}</SectionTitle>
        {canManage && (
          <Pressable onPress={() => setAdding(true)} hitSlop={8}>
            <Text style={{ color: t.cyan, fontFamily: t.bodySemi, fontSize: 13 }}>{tr('calendar.addGuideBtn')}</Text>
          </Pressable>
        )}
      </View>
      {groups.map((grp, gi) => (
        <View key={grp.name || 'all'} style={{ marginTop: gi > 0 ? 18 : 0 }}>
          {grp.name ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
              {/* One notch under SectionTitle (11px / 1.6), the same ratio the web
                  panel keeps between .section-title and .guide-group-label. */}
              <Text style={{ color: t.textFaint, fontFamily: t.mono, fontSize: 10, letterSpacing: 1.3, textTransform: 'uppercase' }}>
                {tr('calendar.by')}
                <Text style={{ color: t.text, fontFamily: t.bodySemi }}>{grp.name}</Text>
              </Text>
              {grp.role ? (
                <View style={{ borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1, borderColor: ROLE_CHIP[grp.role.cls] }}>
                  <Text style={{ color: ROLE_CHIP[grp.role.cls], fontSize: 10, fontWeight: '700' }}>{grp.role.label}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {grp.items.map((gd, i) => {
              const icon = siteIcon(gd);
              return (
                <Pressable key={gd.id || 'g' + i} onPress={() => openLink(gd.url)}
                  onLongPress={() => !gd.global && canManage && del(gd)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: t.surface2, borderWidth: 1, borderColor: t.border, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7 }}>
                  {icon ? <Image source={{ uri: icon }} style={{ width: 16, height: 16, borderRadius: 3 }} /> : <Text style={{ fontSize: 13 }}>🔗</Text>}
                  <Text style={{ color: t.textDim, fontSize: 12.5, fontFamily: t.bodyMed }}>{gd.title}{gd.lang ? ` · ${gd.lang.toUpperCase()}` : ''}</Text>
                  {!gd.global && canManage ? <Text style={{ color: t.textFaint, fontSize: 12 }}>✕</Text> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
      {adding && <GuideAddModal instance={instance} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />}
    </View>
  );
}

function GuideAddModal({ instance, onClose, onSaved }) {
  const t = useTheme();
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const input = { backgroundColor: t.bg, borderColor: t.borderStrong, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: t.text, marginTop: 6 };
  const save = async () => {
    if (!/^https?:\/\//i.test(url)) return;
    setBusy(true);
    try { await api.addGuide({ instance, site: 'custom', title: title.trim() || 'Guide', url: url.trim() }); onSaved(); }
    finally { setBusy(false); }
  };
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: t.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 34 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ color: t.text, fontSize: 18, fontFamily: t.display }}>{tr('calendar.addGuide')}</Text>
            <Pressable onPress={onClose}><Text style={{ color: t.textMuted, fontSize: 20 }}> ✕</Text></Pressable>
          </View>
          <Text style={{ color: t.textDim, fontFamily: t.bodySemi }}>{tr('calendar.guideTitle')}</Text>
          <TextInput value={title} onChangeText={setTitle} placeholder={tr('calendar.guideTitlePh')} placeholderTextColor={t.textMuted} style={input} />
          <Text style={{ color: t.textDim, fontFamily: t.bodySemi, marginTop: 12 }}>{tr('calendar.guideUrl')}</Text>
          <TextInput value={url} onChangeText={setUrl} placeholder="https://…" placeholderTextColor={t.textMuted} autoCapitalize="none" keyboardType="url" style={input} />
          <Pressable onPress={save} disabled={busy || !/^https?:\/\//i.test(url)}
            style={{ backgroundColor: t.frost3, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 18, opacity: busy || !/^https?:\/\//i.test(url) ? 0.5 : 1 }}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontFamily: t.bodySemi }}>{tr('calendar.add')}</Text>}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// Group an instance list into [{ expansion, items }] for one sub-header per WoW
// expansion. Expansions newest-first (journal id rises with release date), the
// instances within each sorted alphabetically.
function byExpansion(list) {
  const groups = [];
  const idx = {};
  for (const it of list || []) {
    const key = it.expansion || tr('calendar.otherExpansion');
    if (idx[key] === undefined) { idx[key] = groups.length; groups.push({ expansion: key, expansionId: it.expansionId ?? 0, items: [] }); }
    groups[idx[key]].items.push(it);
  }
  for (const g of groups) g.items.sort((a, b) => (a.name || '').localeCompare(b.name || '', activeLocale()));
  groups.sort((a, b) => (b.expansionId ?? 0) - (a.expansionId ?? 0));
  return groups;
}

function RaidFormModal({ raid, onClose, onSaved, onDeleted }) {
  const t = useTheme();
  const isNew = !raid.id;
  const [title, setTitle] = useState(raid.title || '');
  const [instance, setInstance] = useState(raid.instance || '');
  const [difficulty, setDifficulty] = useState(raid.difficulty || 'heroic');
  // Raid vs. Dungeon — switches the instance chips between the two lists.
  const [kind, setKind] = useState(raid.difficulty === 'mplus' ? 'dungeon' : 'raid');
  const [instancesBy, setInstancesBy] = useState({ raid: null, dungeon: null });
  const [when, setWhen] = useState(new Date(raid.starts_at || Date.now() + 2 * 86400000));
  const [duration, setDuration] = useState(String(raid.duration_min || 120));
  const [maxSize, setMaxSize] = useState(String(raid.max_size || 20));
  const [description, setDescription] = useState(raid.description || '');
  const [picker, setPicker] = useState(null); // 'date' | 'time'
  const [busy, setBusy] = useState(false);
  const instances = instancesBy[kind];
  const fallbackDiffs = kind === 'dungeon' ? ['normal', 'heroic', 'mythic', 'mplus'] : ['lfr', 'normal', 'heroic', 'mythic'];

  useEffect(() => {
    Promise.all([api.raidInstances(), api.dungeonInstances()])
      .then(([raids, dungeons]) => {
        setInstancesBy({ raid: raids, dungeon: dungeons });
        if (raid.instance) {
          const inD = dungeons.some((i) => i.name === raid.instance);
          const inR = raids.some((i) => i.name === raid.instance);
          if (inD && !inR) setKind('dungeon'); else if (inR) setKind('raid');
        } else {
          const list = raid.difficulty === 'mplus' ? dungeons : raids;
          setInstance((cur) => cur || list[0]?.name || '');
        }
      })
      .catch(() => setInstancesBy({ raid: [], dungeon: [] }));
  }, []);

  // Difficulties available for the chosen instance (fallback to the full set).
  const chosen = instances?.find((i) => i.name === instance);
  const availDiffs = chosen?.difficulties?.length ? chosen.difficulties : fallbackDiffs;
  const pickInstance = (name) => {
    const inst = instances?.find((i) => i.name === name);
    const diffs = inst?.difficulties?.length ? inst.difficulties : fallbackDiffs;
    setInstance(name);
    setDifficulty((d) => (diffs.includes(d) ? d : diffs[diffs.length - 1]));
  };
  const switchKind = (k) => {
    if (k === kind) return;
    setKind(k);
    const first = (instancesBy[k] || [])[0];
    const diffs = first?.difficulties?.length ? first.difficulties : (k === 'dungeon' ? ['normal', 'heroic', 'mythic', 'mplus'] : ['lfr', 'normal', 'heroic', 'mythic']);
    setInstance(first?.name || '');
    setDifficulty((d) => (diffs.includes(d) ? d : diffs[diffs.length - 1]));
  };

  const save = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const payload = { title, instance, difficulty, starts_at: when.getTime(), duration_min: Number(duration) || 120, max_size: Number(maxSize) || 20, description };
      if (isNew) await api.createRaid(payload); else await api.updateRaid(raid.id, payload);
      onSaved();
    } finally { setBusy(false); }
  };
  const del = () => {
    Alert.alert(tr('calendar.deleteRaid'), raid.title, [
      { text: tr('common.cancel'), style: 'cancel' },
      { text: tr('common.delete'), style: 'destructive', onPress: async () => { await api.deleteRaid(raid.id); onDeleted(); } },
    ]);
  };

  const input = { backgroundColor: t.bg, borderColor: t.borderStrong, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: t.text };
  const label = { color: t.textDim, fontWeight: '700', marginBottom: 6, marginTop: 12 };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: t.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '92%' }}>
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 34 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: t.text, fontSize: 18, fontWeight: '800' }}>{tr(isNew ? 'calendar.newRaid' : 'calendar.editRaid')}</Text>
              <Pressable onPress={onClose}><Text style={{ color: t.textMuted, fontSize: 20 }}> ✕</Text></Pressable>
            </View>

            <Text style={label}>{tr('calendar.raidTitle')}</Text>
            <TextInput value={title} onChangeText={setTitle} placeholder={tr('calendar.raidTitlePh')} placeholderTextColor={t.textMuted} style={input} />

            <Text style={label}>{tr('calendar.type')}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[['raid', tr('calendar.raid')], ['dungeon', tr('calendar.dungeon')]].map(([k, lbl]) => {
                const on = kind === k;
                return (
                  <Pressable key={k} onPress={() => switchKind(k)}
                    style={{ flex: 1, backgroundColor: on ? t.frost3 : t.bg, borderWidth: 1, borderColor: on ? t.frost3 : t.borderStrong, borderRadius: 10, paddingVertical: 11, alignItems: 'center' }}>
                    <Text style={{ color: on ? '#fff' : t.textDim, fontWeight: '700', fontSize: 13 }}>{lbl}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={label}>{tr(kind === 'dungeon' ? 'calendar.dungeon' : 'calendar.raid')}</Text>
            {!instances ? (
              <ActivityIndicator color={t.accent} style={{ alignSelf: 'flex-start', marginTop: 4 }} />
            ) : (
              <View style={{ gap: 10 }}>
                {/* Keep a custom/legacy instance name selectable. */}
                {instance && !instances.some((i) => i.name === instance) && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    <Pressable style={{ backgroundColor: t.frost3, borderWidth: 1, borderColor: t.frost3, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 }}>
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{instance}</Text>
                    </Pressable>
                  </View>
                )}
                {byExpansion(instances).map((g) => (
                  <View key={g.expansion}>
                    <Text style={{ color: t.textMuted, fontSize: 11, fontFamily: t.bodySemi, letterSpacing: 0.4, marginBottom: 6 }}>{g.expansion.toUpperCase()}</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {g.items.map((i) => {
                        const on = instance === i.name;
                        return (
                          <Pressable key={i.id} onPress={() => pickInstance(i.name)}
                            style={{ backgroundColor: on ? t.frost3 : t.bg, borderWidth: 1, borderColor: on ? t.frost3 : t.borderStrong, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 }}>
                            <Text style={{ color: on ? '#fff' : t.textDim, fontWeight: '700', fontSize: 13 }}>{i.name}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ))}
              </View>
            )}

            <Text style={label}>{tr('calendar.difficulty')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {availDiffs.map((k) => {
                const v = DIFFICULTIES[k];
                const on = difficulty === k;
                return (
                  <Pressable key={k} onPress={() => setDifficulty(k)}
                    style={{ backgroundColor: on ? v.color : t.bg, borderWidth: 1, borderColor: on ? v.color : t.borderStrong, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 }}>
                    <Text style={{ color: on ? '#fff' : t.textDim, fontWeight: '700', fontSize: 13 }}>{v?.label || k}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={label}>{tr('calendar.when')}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={() => setPicker('date')} style={[input, { flex: 1 }]}><Text style={{ color: t.text }}>{when.toLocaleDateString(activeLocale(), { weekday: 'short', day: '2-digit', month: 'short' })}</Text></Pressable>
              <Pressable onPress={() => setPicker('time')} style={[input, { width: 110 }]}><Text style={{ color: t.text }}>{when.toLocaleTimeString(activeLocale(), { hour: '2-digit', minute: '2-digit' })}</Text></Pressable>
            </View>
            {picker && (
              <DateTimePicker value={when} mode={picker} is24Hour
                onChange={(e, d) => { setPicker(null); if (d) setWhen(d); }} />
            )}

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={label}>{tr('calendar.duration')}</Text>
                <TextInput value={duration} onChangeText={setDuration} keyboardType="number-pad" style={input} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={label}>{tr('calendar.maxSize')}</Text>
                <TextInput value={maxSize} onChangeText={setMaxSize} keyboardType="number-pad" style={input} />
              </View>
            </View>

            <Text style={label}>{tr('calendar.description')}</Text>
            <TextInput value={description} onChangeText={setDescription} multiline placeholderTextColor={t.textMuted} style={[input, { height: 80, textAlignVertical: 'top' }]} />

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
              <Pressable onPress={save} disabled={busy || !title.trim()} style={{ flex: 1, backgroundColor: t.frost3, borderRadius: 10, paddingVertical: 14, alignItems: 'center', opacity: busy || !title.trim() ? 0.5 : 1 }}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>{tr(isNew ? 'calendar.create' : 'common.save')}</Text>}
              </Pressable>
              {!isNew && (
                <Pressable onPress={del} style={{ borderColor: t.red, borderWidth: 1, borderRadius: 10, paddingVertical: 14, paddingHorizontal: 18, alignItems: 'center' }}>
                  <Text style={{ color: t.red, fontWeight: '700' }}>{tr('common.delete')}</Text>
                </Pressable>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function SignupModal({ raid, me, onClose, onChange }) {
  const t = useTheme();
  const [chars, setChars] = useState(null);
  const [mode, setMode] = useState('main'); // 'main' (Aufstellung) | 'alt' (Ersatzbank)
  const isAlt = mode === 'alt';
  const [charId, setCharId] = useState(
    raid.mySignup?.realm && raid.mySignup?.name
      ? `${raid.mySignup.realm}:${raid.mySignup.name.toLowerCase()}`
      : me?.activeCharacter?.id || '');
  const [role, setRole] = useState(raid.mySignup?.role || 'dps');
  const [status, setStatus] = useState(raid.mySignup?.status || 'confirmed');
  const [busy, setBusy] = useState(false);
  const myAlts = raid.myAlts || [];

  useEffect(() => {
    api.characters().then((list) => {
      setChars(list);
      setCharId((cur) => cur || me?.activeCharacter?.id || list[0]?.id || '');
    }).catch(() => setChars([]));
  }, []);

  const picked = chars?.find((c) => c.id === charId);
  const save = async () => {
    setBusy(true);
    try {
      const updated = await api.signup(raid.id, { role, status, charId, isAlt, charName: picked?.name, charRealm: picked?.realmSlug, charClass: picked?.className });
      onChange(updated);
      if (!isAlt) onClose();
    } finally { setBusy(false); }
  };
  const withdraw = async () => { setBusy(true); try { onChange(await api.withdraw(raid.id)); onClose(); } finally { setBusy(false); } };
  const removeAlt = async (id) => { setBusy(true); try { onChange(await api.removeSignup(raid.id, id)); } finally { setBusy(false); } };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: t.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 34 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <Text style={{ color: t.text, fontSize: 18, fontWeight: '800', flex: 1 }} numberOfLines={1}>{tr('calendar.signupTitle', { title: raid.title })}</Text>
            <Pressable onPress={onClose}><Text style={{ color: t.textMuted, fontSize: 20 }}> ✕</Text></Pressable>
          </View>

          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
            {[['main', tr('calendar.modeMain')], ['alt', tr('calendar.modeAlt')]].map(([k, lbl]) => {
              const on = mode === k;
              return (
                <Pressable key={k} onPress={() => setMode(k)}
                  style={{ flex: 1, backgroundColor: on ? t.surface2 : t.bg, borderWidth: 1, borderColor: on ? t.cyan : t.borderStrong, borderRadius: 10, paddingVertical: 11, alignItems: 'center' }}>
                  <Text style={{ color: on ? t.cyan : t.textDim, fontWeight: '700', fontSize: 13 }}>{lbl}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={{ color: t.textDim, fontWeight: '700', marginBottom: 6 }}>{tr('calendar.character')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
            {[...(chars || [])].sort((a, b) => a.name.localeCompare(b.name)).map((c) => {
              const on = c.id === charId;
              const color = classColorByName(c.className);
              return (
                <Pressable key={c.id} onPress={() => setCharId(c.id)}
                  style={{ borderWidth: on ? 2 : 1, borderColor: on ? color : t.borderStrong, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginRight: 8 }}>
                  <Text style={{ color, fontWeight: '700' }}>{c.name}</Text>
                  <Text style={{ color: t.textMuted, fontSize: 11 }}>{c.className} · {c.level}</Text>
                </Pressable>
              );
            })}
            {!chars && <ActivityIndicator color={t.accent} />}
          </ScrollView>

          <Text style={{ color: t.textDim, fontWeight: '700', marginBottom: 6 }}>{tr('calendar.role')}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
            {Object.entries(ROLES).map(([key, r]) => {
              const on = role === key;
              return (
                <Pressable key={key} onPress={() => setRole(key)}
                  style={{ flex: 1, backgroundColor: on ? r.color : t.bg, borderWidth: 1, borderColor: on ? r.color : t.borderStrong, borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}>
                  <Text style={{ fontSize: 20 }}>{r.icon}</Text>
                  <Text style={{ color: on ? '#fff' : t.textDim, fontWeight: '700', marginTop: 2 }}>{r.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={{ color: t.textDim, fontWeight: '700', marginBottom: 6 }}>{tr('common.status')}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 18 }}>
            {[['confirmed', tr('calendar.confirmed')], ['tentative', tr('calendar.tentative')], ['absent', tr('calendar.absent')]].map(([key, lbl]) => {
              const on = status === key;
              return (
                <Pressable key={key} onPress={() => setStatus(key)}
                  style={{ flex: 1, backgroundColor: on ? t.frost3 : t.bg, borderWidth: 1, borderColor: on ? t.frost3 : t.borderStrong, borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}>
                  <Text style={{ color: on ? '#fff' : t.textDim, fontWeight: '700', fontSize: 13 }}>{lbl}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable onPress={save} disabled={busy || !charId}
              style={{ flex: 1, backgroundColor: t.frost3, borderRadius: 10, paddingVertical: 14, alignItems: 'center', opacity: busy || !charId ? 0.5 : 1 }}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>{tr(isAlt ? 'calendar.addAlt' : raid.mySignup ? 'calendar.update' : 'calendar.signUp')}</Text>}
            </Pressable>
            {!isAlt && raid.mySignup && (
              <Pressable onPress={withdraw} disabled={busy}
                style={{ borderColor: t.red, borderWidth: 1, borderRadius: 10, paddingVertical: 14, paddingHorizontal: 18, alignItems: 'center' }}>
                <Text style={{ color: t.red, fontWeight: '700' }}>{tr('calendar.withdraw')}</Text>
              </Pressable>
            )}
          </View>

          {myAlts.length > 0 && (
            <View style={{ marginTop: 18 }}>
              <Text style={{ color: t.textDim, fontWeight: '700', marginBottom: 6 }}>{tr('calendar.myAlts')}</Text>
              {myAlts.map((a) => (
                <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 5, gap: 8 }}>
                  <Text style={{ fontSize: 13 }}>{ROLES[a.role]?.icon}</Text>
                  <Text style={{ color: classColorByName(a.className), fontWeight: '700' }}>{a.name}</Text>
                  <Pressable onPress={() => removeAlt(a.id)} disabled={busy} hitSlop={8} style={{ marginLeft: 'auto', paddingHorizontal: 6 }}>
                    <Text style={{ color: t.red, fontSize: 16 }}>×</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
