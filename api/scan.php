<?php
// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: MIT
// Full guild scan: fetches the guild profile + EVERY member's details and
// persists them to mm_characters. Heavy — runs in the background (after
// fastcgi_finish_request) so the triggering request isn't blocked.

const SCAN_STALE_MS = 15 * 60 * 1000;   // a scan flag older than this is treated as crashed
const SCAN_TTL_MS = 24 * 60 * 60 * 1000; // re-scan at most once per day

function guild_needs_scan(array $g): bool {
    $now = now_ms();
    if (!empty($g['scanning'])) {
        return (int) ($g['scan_started'] ?? 0) < $now - SCAN_STALE_MS; // stuck → allow retry
    }
    $last = (int) ($g['last_scan_at'] ?? 0);
    return $last === 0 || $last < $now - SCAN_TTL_MS;
}

// Atomically claim the scan slot. Returns true if we won.
function try_start_scan(int $guildId): bool {
    $now = now_ms();
    $st = db()->prepare('UPDATE ' . tbl('guilds') . ' SET scanning=1, scan_started=?
        WHERE id=? AND (scanning=0 OR scan_started < ?)');
    $st->execute([$now, $guildId, $now - SCAN_STALE_MS]);
    return $st->rowCount() > 0;
}

function run_guild_scan(int $guildId): void {
    $g = db()->prepare('SELECT * FROM ' . tbl('guilds') . ' WHERE id=?');
    $g->execute([$guildId]);
    $guild = $g->fetch();
    if (!$guild) return;
    [$region, $realmSlug, $nameSlug] = [$guild['region'], $guild['realm_slug'], $guild['name_slug']];

    // 1) guild profile
    $sum = get_guild_summary($region, $realmSlug, $nameSlug);
    if ($sum) {
        db()->prepare('UPDATE ' . tbl('guilds') . ' SET member_count=?, achievement_points=?, faction=?, crest_bg=?, crest_emblem=?, crest_emblem_url=? WHERE id=?')
            ->execute([$sum['member_count'], $sum['achievement_points'], $sum['faction'], $sum['crest_bg'], $sum['crest_emblem'], $sum['crest_emblem_url'] ?? null, $guildId]);
    }

    // 2) full roster + enrich EVERY member in batches
    $members = fetch_guild_roster_raw($region, $realmSlug, $nameSlug);
    $ns = 'profile-' . $region;
    $up = db()->prepare('INSERT INTO ' . tbl('characters') . '
        (guild_id, realm_slug, name_lower, name, class_id, level, rank, spec, spec_id, race, race_id, faction, item_level, mythic_rating, mythic_rating_color, achievement_points, avatar, main_image, title, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT (guild_id, realm_slug, name_lower) DO UPDATE SET
          name=EXCLUDED.name, class_id=EXCLUDED.class_id, level=EXCLUDED.level, rank=EXCLUDED.rank,
          spec=EXCLUDED.spec, spec_id=EXCLUDED.spec_id, race=EXCLUDED.race, race_id=EXCLUDED.race_id, faction=EXCLUDED.faction, item_level=EXCLUDED.item_level,
          mythic_rating=EXCLUDED.mythic_rating, mythic_rating_color=EXCLUDED.mythic_rating_color, achievement_points=EXCLUDED.achievement_points,
          avatar=EXCLUDED.avatar, main_image=EXCLUDED.main_image, title=EXCLUDED.title, updated_at=EXCLUDED.updated_at');

    foreach (array_chunk($members, 40) as $batch) {
        $paths = [];
        foreach ($batch as $i => $m) {
            $base = char_base_path($m['realm'], $m['name']);
            $paths["$i|s"] = $base;
            $paths["$i|m"] = $base . '/mythic-keystone-profile';
            $paths["$i|media"] = $base . '/character-media';
        }
        $res = bnet_multi_get($paths, $ns, 30);
        foreach ($batch as $i => $m) {
            $d = assemble_detail($m['realm'], $m['name'], $res["$i|s"] ?? null, null, $res["$i|m"] ?? null, $res["$i|media"] ?? null);
            $up->execute([
                $guildId, $m['realm'], mb_strtolower($m['name']), $m['name'],
                $m['classId'] ?? ($d['classId'] ?? null), $m['level'], $m['rank'],
                $d['specName'] ?? null, $d['specId'] ?? null, $d['raceName'] ?? null, $d['raceId'] ?? null, $d['faction'] ?? null,
                $d['itemLevel'] ?? null, $d['mythicRating'] ?? null, $d['mythicRatingColor'] ?? null, $d['achievementPoints'] ?? null,
                $d['images']['avatar'] ?? null, $d['images']['main'] ?? null, $d['title'] ?? null, now_ms(),
            ]);
        }
    }

    db()->prepare('UPDATE ' . tbl('guilds') . ' SET scanning=0, last_scan_at=? WHERE id=?')->execute([now_ms(), $guildId]);
}

// Roster read from the DB (all enriched). Returns [] if never scanned.
function db_roster(int $guildId): array {
    $st = db()->prepare('SELECT * FROM ' . tbl('characters') . ' WHERE guild_id=? ORDER BY mythic_rating DESC NULLS LAST, rank ASC');
    $st->execute([$guildId]);
    $out = [];
    foreach ($st->fetchAll() as $r) {
        $out[] = [
            'id' => $r['realm_slug'] . ':' . $r['name_lower'],
            'name' => $r['name'],
            'realm' => $r['realm_slug'],
            'level' => (int) $r['level'],
            'rank' => (int) $r['rank'],
            'classId' => $r['class_id'] !== null ? (int) $r['class_id'] : null,
            // In the reader's language by id; the name stored at the scan as fallback.
            'race' => game_name('race', $r['race_id'] !== null ? (int) $r['race_id'] : null) ?? $r['race'] ?? null,
            'faction' => $r['faction'],
            'itemLevel' => $r['item_level'] !== null ? (int) $r['item_level'] : null,
            'mythicRating' => $r['mythic_rating'] !== null ? (int) $r['mythic_rating'] : null,
            'mythicRatingColor' => $r['mythic_rating_color'] ?? null,
            'achievementPoints' => $r['achievement_points'] !== null ? (int) $r['achievement_points'] : null,
            'avatar' => $r['avatar'],
        ];
    }
    return $out;
}

function guild_char_count(int $guildId): int {
    $st = db()->prepare('SELECT COUNT(*) c FROM ' . tbl('characters') . ' WHERE guild_id=?');
    $st->execute([$guildId]);
    return (int) $st->fetch()['c'];
}
