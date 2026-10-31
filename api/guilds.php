<?php
// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: MIT
// Guild provisioning + membership/admin — all derived from Blizzard data.
//   • active guild  = the active character's guild (auto-provisioned)
//   • member        = has a character in that guild (implicit)
//   • admin/raidlead = rank 0 or 1 (GM/officer) in the Blizzard roster

// Ensure a guild row exists; seed its widgets on first creation. Returns the row.
function ensure_guild(string $region, string $realmSlug, string $nameSlug, string $displayName, ?string $realmName = null, ?string $faction = null): ?array {
    if (!$realmSlug || !$nameSlug) return null;
    $sel = db()->prepare('SELECT * FROM ' . tbl('guilds') . ' WHERE region=? AND realm_slug=? AND name_slug=?');
    $sel->execute([$region, $realmSlug, $nameSlug]);
    $g = $sel->fetch();
    if ($g) return $g;

    $ins = db()->prepare('INSERT INTO ' . tbl('guilds') . ' (region, realm_slug, name_slug, display_name, realm_name, faction, created_at)
        VALUES (?,?,?,?,?,?,?) ON CONFLICT (region, realm_slug, name_slug) DO NOTHING RETURNING id');
    $ins->execute([$region, $realmSlug, $nameSlug, $displayName, $realmName, $faction, now_ms()]);
    $newId = $ins->fetchColumn();
    $sel->execute([$region, $realmSlug, $nameSlug]);
    $g = $sel->fetch();
    if ($g && $newId !== false) {
        seed_guild_widgets((int) $g['id']);
        if (demo_mode()) seed_demo_raids((int) $g['id'], guild_lang((int) $g['id']));
    }
    return $g ?: null;
}

// The language of everything Raidex sends to the whole guild: Discord messages,
// the raid card, the demo guild's sample raids. Set by the GM (POST /guild/lang).
function guild_lang(int $guildId): string {
    static $memo = [];
    if (!isset($memo[$guildId])) {
        $st = db()->prepare('SELECT lang FROM ' . tbl('guilds') . ' WHERE id = ?');
        $st->execute([$guildId]);
        $memo[$guildId] = normalize_lang((string) ($st->fetchColumn() ?: '')) ?? I18N_FALLBACK;
    }
    return $memo[$guildId];
}

// Resolve + persist the active guild from a character's detail. Returns guild row|null.
function set_active_guild_from_char(array $user, ?array $charDetail): ?array {
    if (!$charDetail || empty($charDetail['guildRealmSlug']) || empty($charDetail['guildNameSlug'])) {
        db()->prepare('UPDATE ' . tbl('users') . ' SET active_guild_id=NULL WHERE id=?')->execute([$user['id']]);
        return null;
    }
    $g = ensure_guild(
        cfg()['bnet_region'],
        $charDetail['guildRealmSlug'],
        $charDetail['guildNameSlug'],
        $charDetail['guild'] ?? $charDetail['guildNameSlug'],
        $charDetail['guildRealmName'] ?? null,
        $charDetail['guildFaction'] ?? null,
    );
    if ($g) {
        db()->prepare('UPDATE ' . tbl('users') . ' SET active_guild_id=? WHERE id=?')->execute([$g['id'], $user['id']]);
        associate_user_guild((int) $user['id'], (int) $g['id'], $charDetail['name'] ?? null, $charDetail['realmSlug'] ?? null);
    }
    return $g;
}

// Remember that a user belongs to a guild (for the multi-guild picker).
function associate_user_guild(int $userId, int $guildId, ?string $charName = null, ?string $charRealm = null): void {
    db()->prepare('INSERT INTO ' . tbl('user_guilds') . ' (user_id, guild_id, char_name, char_realm, added_at)
        VALUES (?,?,?,?,?) ON CONFLICT (user_id, guild_id) DO UPDATE SET char_name=EXCLUDED.char_name, char_realm=EXCLUDED.char_realm')
        ->execute([$userId, $guildId, $charName, $charRealm, now_ms()]);
}

// All guilds the user has a character in.
function user_guilds(int $userId): array {
    $st = db()->prepare('SELECT g.* FROM ' . tbl('user_guilds') . ' ug JOIN ' . tbl('guilds') . ' g ON g.id = ug.guild_id
        WHERE ug.user_id = ? ORDER BY g.display_name');
    $st->execute([$userId]);
    return array_map('guild_public', $st->fetchAll());
}

function current_guild(?array $user): ?array {
    if (!$user || empty($user['active_guild_id'])) return null;
    $st = db()->prepare('SELECT * FROM ' . tbl('guilds') . ' WHERE id=?');
    $st->execute([$user['active_guild_id']]);
    return $st->fetch() ?: null;
}

function guild_public(array $g): array {
    return [
        'id' => (int) $g['id'],
        'displayName' => $g['display_name'],
        'realmName' => $g['realm_name'],
        'realmSlug' => $g['realm_slug'],
        'nameSlug' => $g['name_slug'],
        'region' => $g['region'],
        'lang' => normalize_lang($g['lang'] ?? null) ?? I18N_FALLBACK,
        'faction' => $g['faction'],
        'memberCount' => isset($g['member_count']) ? (int) $g['member_count'] : null,
        'achievementPoints' => isset($g['achievement_points']) ? (int) $g['achievement_points'] : null,
        'crestBg' => $g['crest_bg'] ?? null,
        'crestEmblem' => $g['crest_emblem'] ?? null,
        'crestEmblemUrl' => $g['crest_emblem_url'] ?? null,
        'scanning' => !empty($g['scanning']),
        'lastScanAt' => isset($g['last_scan_at']) ? (int) $g['last_scan_at'] : null,
        'scannedChars' => guild_char_count((int) $g['id']),
    ];
}

// Rank of a character within a guild roster (0=GM, 1=officer, …) or null.
function guild_char_rank(array $guild, string $charRealmSlug, string $charName): ?int {
    // Prefer the scanned DB (fast, complete); fall back to a live roster fetch.
    $st = db()->prepare('SELECT rank FROM ' . tbl('characters') . ' WHERE guild_id=? AND realm_slug=? AND name_lower=?');
    $st->execute([$guild['id'], strtolower($charRealmSlug), mb_strtolower($charName)]);
    $row = $st->fetch();
    if ($row) return (int) $row['rank'];
    $roster = get_guild_roster($guild['region'], $guild['realm_slug'], $guild['name_slug']);
    $cn = mb_strtolower($charName);
    foreach ($roster as $m) {
        if (mb_strtolower($m['name']) === $cn && strtolower($m['realm']) === strtolower($charRealmSlug)) {
            return (int) $m['rank'];
        }
    }
    return null;
}

// The Guild Master (Blizzard rank 0) — the app's superadmin. Only the GM may
// appoint raidleads and manage every calendar entry.
function is_guild_gm(array $user, ?array $guild): bool {
    // Bewusst KEIN Superadmin-Bypass mehr: GM ist nur, wessen aktiver Charakter
    // Rang 0 in dieser Gilde hat (charakterbasiertes Rollenmodell).
    if (demo_mode() && !empty($user['is_demo'])) return true;
    if (!$guild || empty($user['active_char_id'])) return false;
    [$rs, $nm] = array_pad(explode(':', $user['active_char_id'], 2), 2, '');
    return guild_char_rank($guild, $rs, $nm) === 0;
}

// Has a character been appointed raidlead in this guild?
function is_raidlead_char(int $guildId, string $realmSlug, string $name): bool {
    $st = db()->prepare('SELECT 1 FROM ' . tbl('raidleads') . ' WHERE guild_id=? AND realm_slug=? AND name_lower=?');
    $st->execute([$guildId, strtolower(rawurldecode($realmSlug)), mb_strtolower($name)]);
    return (bool) $st->fetchColumn();
}

// Set of appointed raidleads for a guild, keyed "realmslug:namelower".
function guild_raidlead_keys(int $guildId): array {
    $st = db()->prepare('SELECT realm_slug, name_lower FROM ' . tbl('raidleads') . ' WHERE guild_id=?');
    $st->execute([$guildId]);
    $set = [];
    foreach ($st->fetchAll() as $r) $set[$r['realm_slug'] . ':' . $r['name_lower']] = true;
    return $set;
}

// Raid-management rights: the GM, or a raidlead the GM has appointed. Because
// Blizzard only exposes GM/Officer/Member, officers are NOT admins by default —
// the GM appoints raidleads explicitly.
function is_guild_admin(array $user, ?array $guild): bool {
    if (is_guild_gm($user, $guild)) return true;
    if (!$guild || empty($user['active_char_id'])) return false;
    [$rs, $nm] = array_pad(explode(':', $user['active_char_id'], 2), 2, '');
    return is_raidlead_char((int) $guild['id'], $rs, $nm);
}

// No placeholder widgets are seeded — "Aktuelles" is driven by live/computed
// events; guild leads can still add their own widgets via the widget endpoints.
function seed_guild_widgets(int $guildId): void {}

// Sample raids for the demo guild, written in the guild's language.
function seed_demo_raids(int $guildId, string $lang): void {
    $mk = function ($days, $hour) { $d = new DateTime('now'); $d->setTime($hour, 0); $d->modify("+$days day"); return $d->getTimestamp() * 1000; };
    $inst = tr('demo.instance', [], $lang);
    $raids = [
        [tr('demo.mythicTitle', ['instance' => $inst], $lang), $inst, 'mythic', $mk(2, 20), 180, tr('demo.mythicBody', [], $lang), 20],
        [tr('demo.heroicTitle', ['instance' => $inst], $lang), $inst, 'heroic', $mk(5, 20), 120, tr('demo.heroicBody', [], $lang), 25],
        [tr('demo.mplusTitle', [], $lang), tr('demo.mplusInstance', [], $lang), 'mplus', $mk(4, 21), 120, tr('demo.mplusBody', [], $lang), 20],
    ];
    $st = db()->prepare('INSERT INTO ' . tbl('raids') . ' (guild_id, title, instance, difficulty, starts_at, duration_min, description, max_size, created_by_name, created_by_is_lead, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    foreach ($raids as $r) $st->execute([$guildId, $r[0], $r[1], $r[2], $r[3], $r[4], $r[5], $r[6], 'Raidlead', 1, now_ms()]);
}
