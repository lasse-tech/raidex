<?php
// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: MIT
// Blizzard / Battle.net Game Data + Profile API client (curl), with a file
// cache and offline demo fallbacks. Real guild + character data works via
// client-credentials even before user OAuth is enabled.

const OAUTH_HOST = 'https://oauth.battle.net';

function api_host(): string {
    $r = cfg()['bnet_region'];
    return "https://{$r}.api.blizzard.com";
}
function profile_ns(): string { return 'profile-' . cfg()['bnet_region']; }

// Blizzard locale for a UI language (default: the request's, see i18n.php).
// Game data -- races, specs, titles, realms, instances -- is fetched and cached
// per locale, so a German and an English reader each get their own names.
function bnet_locale(?string $lang = null): string {
    $lang = normalize_lang($lang) ?? request_lang();
    if ($lang === 'de') return 'de_DE';
    return cfg()['bnet_region'] === 'us' ? 'en_US' : 'en_GB';
}

function have_bnet_creds(): bool {
    $c = cfg();
    return !empty($c['bnet_client_id']) && !empty($c['bnet_client_secret']);
}

// ── OAuth client-credentials token (cached) ─────────────────────────────────
function client_token(): ?string {
    if (!have_bnet_creds()) return null;
    $c = cfg();
    // Key the cache to the credentials so rotating client id/secret busts it.
    $ckey = 'client_token_' . substr(md5($c['bnet_client_id'] . $c['bnet_client_secret']), 0, 10);
    $t = cache_get($ckey);
    if ($t) return $t;
    $ch = curl_init(OAUTH_HOST . '/token');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_USERPWD => $c['bnet_client_id'] . ':' . $c['bnet_client_secret'],
        CURLOPT_POSTFIELDS => 'grant_type=client_credentials',
        CURLOPT_TIMEOUT => 15,
    ]);
    $res = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($code !== 200) return null;
    $j = json_decode($res, true);
    if (empty($j['access_token'])) return null;
    cache_set($ckey, $j['access_token'], max(60, ($j['expires_in'] ?? 3600) - 60) * 1000);
    return $j['access_token'];
}

// Thrown when the account profile cannot be read: the OAuth token expired or
// was revoked ('bnet_reauth_required'), or Blizzard did not answer
// ('bnet_unavailable'). Neither is "this account has no characters", and
// returning an empty list for them is what made the app look empty.
class BnetProfileError extends Exception {}

// ── generic profile GET ─────────────────────────────────────────────────────
// $status receives the HTTP code, so callers can tell a dead token from a
// character that simply does not exist.
function bnet_get(string $path, ?string $token = null, ?string $ns = null, ?string $locale = null, ?int &$status = null) {
    $status = null;
    $token = $token ?: client_token();
    if (!$token) return null;
    $ns = $ns ?: profile_ns();
    $url = api_host() . $path . '?namespace=' . urlencode($ns) . '&locale=' . urlencode($locale ?: bnet_locale());
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $token],
        CURLOPT_TIMEOUT => 15,
    ]);
    $res = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $status = $code ?: null;
    if ($code === 404 || $code >= 400) return null;
    return json_decode($res, true);
}

// Parallel GET for many profile paths at once (roster enrichment). Returns a
// map key => decoded-json|null. Chunked to respect Blizzard rate limits.
function bnet_multi_get(array $paths, ?string $ns = null, int $concurrency = 30, ?string $locale = null): array {
    $token = client_token();
    if (!$token) return [];
    $ns = $ns ?: profile_ns();
    $locale = $locale ?: bnet_locale();
    $out = [];
    foreach (array_chunk($paths, $concurrency, true) as $chunk) {
        $mh = curl_multi_init();
        $handles = [];
        foreach ($chunk as $key => $path) {
            $url = api_host() . $path . '?namespace=' . urlencode($ns) . '&locale=' . urlencode($locale);
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $token],
                CURLOPT_TIMEOUT => 15,
            ]);
            curl_multi_add_handle($mh, $ch);
            $handles[$key] = $ch;
        }
        do { $status = curl_multi_exec($mh, $active); if ($active) curl_multi_select($mh, 1.0); }
        while ($active && $status === CURLM_OK);
        foreach ($handles as $key => $ch) {
            $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $out[$key] = ($code >= 200 && $code < 300) ? json_decode(curl_multi_getcontent($ch), true) : null;
            curl_multi_remove_handle($mh, $ch);
            curl_close($ch);
        }
        curl_multi_close($mh);
    }
    return $out;
}

// Extract guild identity (slugs) from a character summary's guild object.
function guild_from_summary(?array $g): ?array {
    if (!$g) return null;
    $realmSlug = $g['realm']['slug'] ?? null;
    $nameSlug = null;
    if (!empty($g['key']['href'])) {
        $parts = explode('/', trim(parse_url($g['key']['href'], PHP_URL_PATH), '/'));
        $i = array_search('guild', $parts, true);
        if ($i !== false) {
            if (isset($parts[$i + 1]) && !$realmSlug) $realmSlug = rawurldecode($parts[$i + 1]);
            if (isset($parts[$i + 2])) $nameSlug = rawurldecode($parts[$i + 2]);
        }
    }
    if (!$nameSlug && !empty($g['name'])) $nameSlug = strtolower(str_replace(' ', '-', $g['name']));
    return [
        'name' => $g['name'] ?? null,
        'realmSlug' => $realmSlug,
        'nameSlug' => $nameSlug,
        'realmName' => $g['realm']['name'] ?? null,
        'faction' => $g['faction']['type'] ?? null,
    ];
}

function assemble_detail(string $realmSlug, string $name, ?array $summary, ?array $ach, ?array $mplus, ?array $media): ?array {
    if (!$summary) return null;
    $gu = guild_from_summary($summary['guild'] ?? null);
    return [
        'id' => char_id($realmSlug, $name),
        'name' => $summary['name'] ?? $name,
        'realm' => $summary['realm']['name'] ?? $realmSlug,
        'realmSlug' => $realmSlug,
        'region' => cfg()['bnet_region'],
        'level' => $summary['level'] ?? null,
        'className' => $summary['character_class']['name'] ?? null,
        'classId' => $summary['character_class']['id'] ?? null,
        'specName' => $summary['active_spec']['name'] ?? null,
        'specId' => $summary['active_spec']['id'] ?? null,
        'raceName' => $summary['race']['name'] ?? null,
        'raceId' => $summary['race']['id'] ?? null,
        'faction' => $summary['faction']['type'] ?? null,
        'itemLevel' => $summary['equipped_item_level'] ?? $summary['average_item_level'] ?? null,
        'guild' => $gu['name'] ?? null,
        'guildRealmSlug' => $gu['realmSlug'] ?? null,
        'guildNameSlug' => $gu['nameSlug'] ?? null,
        'guildRealmName' => $gu['realmName'] ?? null,
        'guildFaction' => $gu['faction'] ?? null,
        'title' => isset($summary['active_title']['display_string'])
            ? str_replace('{name}', $summary['name'] ?? $name, $summary['active_title']['display_string'])
            : null,
        'achievementPoints' => $ach['total_points'] ?? $summary['achievement_points'] ?? 0,
        'mythicRating' => (int) round($mplus['current_mythic_rating']['rating'] ?? 0),
        'mythicRatingColor' => isset($mplus['current_mythic_rating']['color'])
            ? sprintf('#%02x%02x%02x', (int) ($mplus['current_mythic_rating']['color']['r'] ?? 0), (int) ($mplus['current_mythic_rating']['color']['g'] ?? 0), (int) ($mplus['current_mythic_rating']['color']['b'] ?? 0))
            : null,
        'images' => media_assets($media, $realmSlug, $name),
    ];
}

// Always decode the realm slug first, then encode exactly once — this keeps a
// slug with non-ASCII (e.g. festung-der-stürme) from being double-encoded no
// matter whether the caller passed it decoded or URL-encoded.
function char_base_path(string $realmSlug, string $name): string {
    return '/profile/wow/character/' . rawurlencode(mb_strtolower(rawurldecode($realmSlug))) . '/' . rawurlencode(mb_strtolower($name));
}

function char_id(string $realmSlug, string $name): string {
    return mb_strtolower(rawurldecode($realmSlug)) . ':' . mb_strtolower($name);
}

// ── the user's own WoW characters (needs user OAuth token) ──────────────────
// Avatars for the account list come from the scanned roster DB (no extra
// Blizzard calls); characters outside scanned guilds simply stay without one.
function chars_with_avatars(array $list): array {
    foreach ($list as &$c) {
        if (empty($c['name'])) continue;
        try {
            $st = db()->prepare('SELECT avatar, mythic_rating, mythic_rating_color FROM ' . tbl('characters') . ' WHERE realm_slug=? AND name_lower=? LIMIT 1');
            $st->execute([mb_strtolower($c['realmSlug'] ?? ''), mb_strtolower($c['name'])]);
            if ($r = $st->fetch()) {
                if (empty($c['avatar']) && !empty($r['avatar'])) $c['avatar'] = $r['avatar'];
                if (empty($c['mythicRating']) && !empty($r['mythic_rating'])) $c['mythicRating'] = (int) $r['mythic_rating'];
                if (empty($c['mythicRatingColor']) && !empty($r['mythic_rating_color'])) $c['mythicRatingColor'] = $r['mythic_rating_color'];
            }
        } catch (Throwable $e) {}
    }
    return $list;
}

// The account profile is the one thing the client-credentials token cannot
// fetch, so a dead user token has no fallback — it has to reach the caller as
// an error. Throws BnetProfileError.
function get_account_characters(?string $userToken): array {
    if (demo_mode() || !$userToken) return chars_with_avatars(demo_characters());
    $status = null;
    $data = bnet_get('/profile/user/wow', $userToken, null, null, $status);
    if ($data === null) {
        // Blizzard's user tokens live ~24 h while a Raidex session lives 30 days,
        // so 401 is the everyday case: the person is still signed in here, but the
        // Battle.net link behind it has aged out and only a new login renews it.
        throw new BnetProfileError(in_array($status, [401, 403], true) ? 'bnet_reauth_required' : 'bnet_unavailable');
    }
    if (empty($data['wow_accounts'])) return [];
    $out = [];
    foreach ($data['wow_accounts'] as $acc) {
        foreach ($acc['characters'] ?? [] as $ch) {
            $out[] = [
                'id' => char_id($ch['realm']['slug'], $ch['name']),
                'name' => $ch['name'],
                'realm' => $ch['realm']['name'],
                'realmSlug' => $ch['realm']['slug'],
                'level' => $ch['level'],
                'className' => $ch['playable_class']['name'] ?? null,
                'classId' => $ch['playable_class']['id'] ?? null,
                'raceName' => $ch['playable_race']['name'] ?? null,
                'faction' => $ch['faction']['type'] ?? null,
            ];
        }
    }
    usort($out, fn($a, $b) => $b['level'] <=> $a['level']);
    return chars_with_avatars($out);
}

// Cache key of one character's details, per locale (names are localised).
function char_cache_key(string $realmSlug, string $name, ?string $locale = null): string {
    return 'char:' . ($locale ?: bnet_locale()) . ':' . mb_strtolower(rawurldecode($realmSlug)) . ':' . mb_strtolower($name);
}

// ── one character enriched (real via client token, cached 10 min) ───────────
function get_character_detail(string $realmSlug, string $name, ?string $userToken = null, bool $force = false): ?array {
    $realmSlug = mb_strtolower(rawurldecode($realmSlug)); // normalise (ü etc.)
    if (demo_mode()) return demo_detail_for(char_id($realmSlug, $name)); // demo accounts get demo data
    $key = char_cache_key($realmSlug, $name);
    if (!$force) { $hit = cache_get($key); if ($hit) return $hit; }

    if (!have_bnet_creds()) {
        return demo_detail_for(char_id($realmSlug, $name));
    }
    // Character profiles are PUBLIC game data — always fetch with the client-
    // credentials token, never the user's OAuth token (which may be expired and
    // would otherwise 401 → fall back to demo data, e.g. showing "Magier").
    $base = char_base_path($realmSlug, $name);
    $summary = bnet_get($base);
    if (!$summary) return demo_detail_for(char_id($realmSlug, $name));
    // achievement_points is already in the summary — skip the huge /achievements payload.
    $mplus = bnet_get($base . '/mythic-keystone-profile');
    $media = bnet_get($base . '/character-media');

    $detail = assemble_detail($realmSlug, $name, $summary, null, $mplus, $media);
    cache_set($key, $detail, 10 * 60 * 1000);
    return $detail;
}

function media_assets($media, $realmSlug, $name): array {
    if (empty($media['assets'])) return demo_media_for(char_id($realmSlug, $name));
    $map = [];
    foreach ($media['assets'] as $a) $map[$a['key']] = $a['value'];
    return [
        'avatar' => $map['avatar'] ?? null,
        'inset' => $map['inset'] ?? null,
        'main' => $map['main-raw'] ?? $map['main'] ?? null,
    ];
}

function rgba($c): string {
    if (!is_array($c)) return '';
    return 'rgba(' . ($c['r'] ?? 0) . ',' . ($c['g'] ?? 0) . ',' . ($c['b'] ?? 0) . ',' . ($c['a'] ?? 1) . ')';
}

// ── guild profile summary (name, faction, member count, points, crest) ──────
function get_guild_summary(string $region, string $realmSlug, string $nameSlug): ?array {
    $ck = "guild_summary:{$region}:{$realmSlug}:{$nameSlug}";
    $hit = cache_get($ck);
    if ($hit) return $hit;
    $ns = 'profile-' . $region;
    $d = bnet_get('/data/wow/guild/' . rawurlencode($realmSlug) . '/' . rawurlencode($nameSlug), null, $ns);
    if (!$d) return null;
    // The guild crest emblem is a tintable silhouette PNG behind a media href.
    $emblemUrl = null;
    if (!empty($d['crest']['emblem']['media']['key']['href'])) {
        $mp = parse_url($d['crest']['emblem']['media']['key']['href'], PHP_URL_PATH);
        $m = $mp ? bnet_get($mp, null, 'static-' . $region) : null;
        if (!empty($m['assets'])) $emblemUrl = $m['assets'][0]['value'] ?? null;
    }
    $out = [
        'name' => $d['name'] ?? null,
        'faction' => $d['faction']['type'] ?? null,
        'member_count' => $d['member_count'] ?? null,
        'achievement_points' => $d['achievement_points'] ?? null,
        'crest_bg' => isset($d['crest']['background']['color']['rgba']) ? rgba($d['crest']['background']['color']['rgba']) : null,
        'crest_emblem' => isset($d['crest']['emblem']['color']['rgba']) ? rgba($d['crest']['emblem']['color']['rgba']) : null,
        'crest_emblem_url' => $emblemUrl,
    ];
    cache_set($ck, $out, 6 * 60 * 60 * 1000);
    return $out;
}

// Lazily ensure a guild has its crest emblem URL stored (one-time fill for
// guilds scanned before the crest-image support existed). Returns the URL.
function ensure_guild_crest(array &$guild): ?string {
    if (!empty($guild['crest_emblem_url'])) return $guild['crest_emblem_url'];
    if (!have_bnet_creds()) return null;
    $sum = get_guild_summary($guild['region'], $guild['realm_slug'], $guild['name_slug']);
    if (!$sum) return null;
    db()->prepare('UPDATE ' . tbl('guilds') . ' SET crest_bg=?, crest_emblem=?, crest_emblem_url=? WHERE id=?')
        ->execute([$sum['crest_bg'], $sum['crest_emblem'], $sum['crest_emblem_url'], $guild['id']]);
    $guild['crest_bg'] = $sum['crest_bg'];
    $guild['crest_emblem'] = $sum['crest_emblem'];
    $guild['crest_emblem_url'] = $sum['crest_emblem_url'];
    return $sum['crest_emblem_url'];
}

// ── raw roster: ALL members, no enrichment (used by the full scan) ──────────
function fetch_guild_roster_raw(string $region, string $realmSlug, string $nameSlug): array {
    $ns = 'profile-' . $region;
    $data = bnet_get('/data/wow/guild/' . rawurlencode($realmSlug) . '/' . rawurlencode($nameSlug) . '/roster', null, $ns);
    if (empty($data['members'])) return [];
    $out = [];
    foreach ($data['members'] as $m) {
        $ch = $m['character'];
        $out[] = [
            'name' => $ch['name'],
            'realm' => $ch['realm']['slug'],
            'level' => $ch['level'],
            'classId' => $ch['playable_class']['id'] ?? null,
            'rank' => $m['rank'],
        ];
    }
    return $out;
}

// ── guild roster, enriched (cached 15 min) ──────────────────────────────────
function get_guild_roster(string $region, string $realmSlug, string $nameSlug): array {
    if (demo_mode()) return demo_roster();
    $ck = 'guild_roster:' . bnet_locale() . ":{$region}:{$realmSlug}:{$nameSlug}";
    $hit = cache_get($ck);
    if ($hit) return $hit;
    if (!have_bnet_creds()) return demo_roster();

    $ns = 'profile-' . $region;
    $path = '/data/wow/guild/' . rawurlencode($realmSlug) . '/' . rawurlencode($nameSlug) . '/roster';
    $data = bnet_get($path, null, $ns);
    if (empty($data['members'])) return demo_roster();

    $members = [];
    foreach ($data['members'] as $m) {
        $ch = $m['character'];
        $members[] = [
            'id' => char_id($ch['realm']['slug'], $ch['name']),
            'name' => $ch['name'],
            'realm' => $ch['realm']['slug'],
            'level' => $ch['level'],
            'classId' => $ch['playable_class']['id'] ?? null,
            'rank' => $m['rank'],
        ];
    }
    usort($members, fn($a, $b) => [$a['rank'], -$b['level']] <=> [$b['rank'], -$a['level']]);

    // Enrich the top slice with achievements + M+ + media, all in parallel.
    $limit = 40;
    $slice = array_slice($members, 0, $limit, true);
    $paths = [];
    foreach ($slice as $i => $m) {
        $base = char_base_path($m['realm'], $m['name']);
        $paths["$i|s"] = $base;                                 // summary (incl. achievement_points)
        $paths["$i|m"] = $base . '/mythic-keystone-profile';
        $paths["$i|media"] = $base . '/character-media';
    }
    $res = bnet_multi_get($paths, $ns);
    foreach ($slice as $i => $m) {
        $d = assemble_detail($m['realm'], $m['name'], $res["$i|s"] ?? null, null, $res["$i|m"] ?? null, $res["$i|media"] ?? null);
        if (!$d) continue;
        cache_set(char_cache_key($m['realm'], $m['name']), $d, 10 * 60 * 1000);
        $members[$i]['className'] = $d['className'];
        $members[$i]['achievementPoints'] = $d['achievementPoints'];
        $members[$i]['mythicRating'] = $d['mythicRating'];
        $members[$i]['itemLevel'] = $d['itemLevel'];
        $members[$i]['avatar'] = $d['images']['avatar'] ?? null;
    }
    cache_set($ck, $members, 15 * 60 * 1000);
    return $members;
}

// ── Mythic+: role of a spec, best run per dungeon this season ──────────────
// Tank and healer specialisation ids; everything else deals damage. Ids are
// Blizzard's and do not change with the client's language, unlike spec names.
const SPEC_TANKS = [66, 73, 104, 250, 268, 581];
const SPEC_HEALERS = [65, 105, 256, 257, 264, 270, 1468];

function spec_role(?int $specId): ?string {
    if (!$specId) return null;
    if (in_array($specId, SPEC_TANKS, true)) return 'tank';
    if (in_array($specId, SPEC_HEALERS, true)) return 'healer';
    return 'damage';
}

// The Mythic+ season the game is in, from the game data (cached six hours).
// Not the highest season a character has played: somebody who sat out this
// season would otherwise hand the group planner last season's best runs, which
// are gone from their rating but would still count against every key.
function mplus_current_season(): ?int {
    $ck = 'mplus_season_' . cfg()['bnet_region'];
    $hit = cache_get($ck);
    if ($hit) return (int) $hit;
    $index = bnet_get('/data/wow/mythic-keystone/season/index', null, 'dynamic-' . cfg()['bnet_region']);
    $id = (int) ($index['current_season']['id'] ?? 0);
    if ($id <= 0) return null;
    cache_set($ck, $id, 6 * 3600 * 1000);
    return $id;
}

// The character's best run per dungeon of the running season, with the rating
// each earned - what Raidex Keys' group planner weighs a keystone by. Role and
// item level come along, so one call carries everything about a candidate.
// Cached ten minutes, like the character details are.
function get_mplus_character(string $realmSlug, string $name): ?array {
    $realmSlug = mb_strtolower(rawurldecode($realmSlug));
    $ck = 'mplus:' . bnet_locale() . ':' . $realmSlug . ':' . mb_strtolower($name);
    $hit = cache_get($ck);
    if ($hit) return $hit;
    if (!have_bnet_creds()) return null;

    // The summary is read here rather than through get_character_detail: that
    // one falls back to demo data when Blizzard is silent, and a made-up role
    // or item level would quietly decide who comes along tonight.
    $base = char_base_path($realmSlug, $name);
    $summary = bnet_get($base);
    $profile = bnet_get($base . '/mythic-keystone-profile');
    if (!$summary && !$profile) return null;

    // The running season, and only it. Where the game data does not say, the
    // highest season the character played stands in.
    $seasonId = mplus_current_season() ?? 0;
    if ($seasonId <= 0) {
        foreach ($profile['seasons'] ?? [] as $s) $seasonId = max($seasonId, (int) ($s['id'] ?? 0));
    }
    $runs = [];
    if ($seasonId) {
        $season = bnet_get($base . '/mythic-keystone-profile/season/' . $seasonId);
        foreach ($season['best_runs'] ?? [] as $r) {
            $mapId = (int) ($r['dungeon']['id'] ?? 0);
            if ($mapId <= 0) continue;
            $score = (float) ($r['map_rating']['rating'] ?? $r['mythic_rating']['rating'] ?? 0);
            if (isset($runs[$mapId]) && $runs[$mapId]['score'] >= $score) continue;
            $runs[$mapId] = [
                'mapId' => $mapId,
                'level' => (int) ($r['keystone_level'] ?? 0),
                'durationSec' => (int) round(((float) ($r['duration'] ?? 0)) / 1000),
                'timed' => (bool) ($r['is_completed_within_time'] ?? false),
                'score' => round($score, 1),
            ];
        }
    }
    $specId = isset($summary['active_spec']['id']) ? (int) $summary['active_spec']['id'] : null;
    $itemLevel = $summary['equipped_item_level'] ?? $summary['average_item_level'] ?? null;
    $out = [
        'name' => $summary['name'] ?? $name,
        'realmSlug' => $realmSlug,
        'season' => $seasonId ?: null,
        'rating' => (int) round($profile['current_mythic_rating']['rating'] ?? 0),
        'specId' => $specId,
        'spec' => $summary['active_spec']['name'] ?? null,
        'role' => spec_role($specId),
        'specIcon' => spec_icon_url($specId),
        'itemLevel' => $itemLevel !== null ? (int) $itemLevel : null,
        'best' => array_values($runs),
    ];
    cache_set($ck, $out, 10 * 60 * 1000);
    return $out;
}

// ── WoW Token price (live, dynamic ns), in gold. Cached 20 min. ─────────────
function get_wow_token(string $region): ?array {
    $region = strtolower($region);
    $ck = 'wow_token_' . $region;
    $hit = cache_get($ck);
    if ($hit) return $hit;
    if (!have_bnet_creds()) return null;
    $d = bnet_get('/data/wow/token/index', null, 'dynamic-' . $region);
    if (empty($d['price'])) return null;
    $out = ['gold' => (int) floor($d['price'] / 10000), 'updated' => (int) ($d['last_updated_timestamp'] ?? now_ms())];
    cache_set($ck, $out, 20 * 60 * 1000);
    return $out;
}

// ── currently available Retail raids (Journal API, static ns) ───────────────
function static_ns(): string { return 'static-' . cfg()['bnet_region']; }

// Map a Blizzard journal difficulty type to our internal difficulty key.
function map_raid_difficulty(?string $type): ?string {
    return [
        'LFR' => 'lfr', 'RAID_TOOL' => 'lfr',
        'NORMAL' => 'normal',
        'HEROIC' => 'heroic',
        'MYTHIC' => 'mythic',
        'MYTHIC_KEYSTONE' => 'mplus', 'MYTHIC_PLUS' => 'mplus',
    ][$type] ?? null;
}

// Raids resp. Dungeons across *every* expansion, each with its available
// difficulties + Adventure-Guide tile artwork, grouped by expansion (newest
// first). Cached 7 days — historical content never changes, the live tier at
// most a few times per patch. $kind is 'raids' or 'dungeons'.
// Cache key of a journal list; $locale null = the request's.
function journal_cache_key(string $kind, ?string $locale = null): string {
    return 'journal_' . $kind . '_all_v3_' . cfg()['bnet_region'] . '_' . ($locale ?: bnet_locale());
}

function get_journal_instances(string $kind): array {
    $demo = $kind === 'dungeons' ? demo_dungeon_instances() : demo_raid_instances();
    $ck = journal_cache_key($kind);
    $hit = cache_get($ck);
    if ($hit) return $hit;
    if (!have_bnet_creds()) return $demo;

    $ns = static_ns();
    $idx = bnet_get('/data/wow/journal-expansion/index', null, $ns);
    if (empty($idx['tiers'])) return $demo;

    // Newest expansion first.
    $tiers = $idx['tiers'];
    usort($tiers, fn($a, $b) => ($b['id'] ?? 0) <=> ($a['id'] ?? 0));

    // Each expansion's detail (its raid/dungeon list) in parallel.
    $expPaths = [];
    foreach ($tiers as $i => $e) $expPaths[$i] = '/data/wow/journal-expansion/' . (int) $e['id'];
    $expData = bnet_multi_get($expPaths, $ns);

    // Flatten to one instance list, tagged with its owning expansion. Within an
    // expansion the journal lists oldest→newest, so reverse for newest-first.
    $insts = [];
    foreach ($tiers as $i => $e) {
        foreach (array_reverse($expData[$i][$kind] ?? []) as $r) {
            $insts[] = ['id' => (int) $r['id'], 'name' => $r['name'] ?? null, 'exp' => $e['name'] ?? null, 'expId' => (int) $e['id']];
        }
    }
    if (!$insts) return $demo;

    // Per-instance detail (difficulty modes) AND media (tile artwork), parallel.
    $paths = [];
    foreach ($insts as $i => $it) {
        $paths["$i|inst"] = '/data/wow/journal-instance/' . $it['id'];
        $paths["$i|media"] = '/data/wow/media/journal-instance/' . $it['id'];
    }
    $res = bnet_multi_get($paths, $ns);

    $fallbackDiffs = $kind === 'dungeons' ? ['normal', 'heroic', 'mythic', 'mplus'] : ['normal', 'heroic', 'mythic'];
    $out = [];
    foreach ($insts as $i => $it) {
        $inst = $res["$i|inst"] ?? null;
        $diffs = [];
        foreach ($inst['modes'] ?? [] as $mode) {
            $d = $mode['difficulty'] ?? $mode;
            $type = is_array($d) ? ($d['type'] ?? null) : $d;
            $key = map_raid_difficulty($type);
            if ($key && !in_array($key, $diffs, true)) $diffs[] = $key;
        }
        if (!$diffs) $diffs = $fallbackDiffs;
        // Weltboss-/Gebiets-/Aggregat-Container ("Khaz Algar", "Midnight", "Dracheninseln",
        // "Schlüsselsteindungeons") haben in Blizzards Journal KEIN minimum_level → keine echten
        // Raids/Dungeons, rausfiltern. ($inst===null nur bei fehlgeschlagenem Detail-Fetch → behalten.)
        if ($inst && ($inst['minimum_level'] ?? null) === null) continue;
        $out[] = [
            'id' => $it['id'],
            'name' => $inst['name'] ?? $it['name'],
            'difficulties' => $diffs,
            'image' => journal_tile_url($res["$i|media"] ?? null),
            'expansion' => $it['exp'],
            'expansionId' => $it['expId'],
        ];
    }
    cache_set($ck, $out, 7 * 24 * 60 * 60 * 1000);
    return $out;
}

function get_raid_instances(): array { return get_journal_instances('raids'); }
function get_dungeon_instances(): array { return get_journal_instances('dungeons'); }

// Localised names of playable races and specialisations by id, from the game
// data index (one request per kind and locale, cached 30 days). Lets data that
// is stored once -- the scanned roster -- answer in the reader's language.
function game_name(string $kind, ?int $id, ?string $locale = null): ?string {
    if (!$id || !have_bnet_creds()) return null;
    $locale = $locale ?: bnet_locale();
    static $memo = [];
    $mk = "$kind:$locale";
    if (!isset($memo[$mk])) {
        [$path, $field] = ['race' => ['/data/wow/playable-race/index', 'races'],
            'spec' => ['/data/wow/playable-specialization/index', 'character_specializations']][$kind];
        $ck = 'game_names_' . $kind . '_' . cfg()['bnet_region'] . '_' . $locale;
        $names = cache_get($ck);
        if (!is_array($names)) {
            $idx = bnet_get($path, null, static_ns(), $locale);
            $names = [];
            foreach ($idx[$field] ?? [] as $e) if (!empty($e['id']) && !empty($e['name'])) $names[(string) $e['id']] = $e['name'];
            // An empty answer is cached briefly, so Blizzard being down is not asked again per row.
            cache_set($ck, $names, ($names ? 30 * 24 : 1) * 3600 * 1000);
        }
        $memo[$mk] = $names;
    }
    return $memo[$mk][(string) $id] ?? null;
}

// Pull the "tile" asset (wide Adventure-Guide banner) from a journal-instance
// media response; fall back to the first asset if no tile key is present.
function journal_tile_url(?array $media): ?string {
    if (empty($media['assets'])) return null;
    foreach ($media['assets'] as $a) if (($a['key'] ?? '') === 'tile') return $a['value'] ?? null;
    return $media['assets'][0]['value'] ?? null;
}

// Generic "icon" asset from a Blizzard media endpoint, cached 30 days by path.
function media_icon(string $path): ?string {
    if (!have_bnet_creds()) return null;
    $ck = 'media_icon_' . $path;
    $hit = cache_get($ck);
    if ($hit !== null) return $hit ?: null;
    $m = bnet_get($path, null, static_ns());
    $url = '';
    foreach ($m['assets'] ?? [] as $a) if (($a['key'] ?? '') === 'icon') { $url = $a['value'] ?? ''; break; }
    if (!$url) $url = $m['assets'][0]['value'] ?? '';
    cache_set($ck, $url ?: '', 30 * 24 * 60 * 60 * 1000);
    return $url ?: null;
}
// Klassen- bzw. Spezialisierungs-Icon (Abenteuerführer/Talent-Icons).
function class_icon_url(?int $classId): ?string {
    return $classId ? media_icon('/data/wow/media/playable-class/' . $classId) : null;
}
function spec_icon_url(?int $specId): ?string {
    return $specId ? media_icon('/data/wow/media/playable-specialization/' . $specId) : null;
}

// Tile artwork for a raid *or dungeon* chosen by name (case-insensitive), from
// the cached instance lists. Used to auto-fill raids.image on create/edit and
// to lazily resolve a tile for entries saved without one. Memoised per request
// so a full calendar doesn't re-read the cache for every card.
//
// A raid keeps the instance name in the language of whoever created it, so the
// lists of the other languages are searched too -- from the cache only: a miss
// there must not cost a full journal fetch in a language nobody asked for.
function raid_tile_for_name(?string $name): ?string {
    if (!$name) return null;
    static $map = null;
    if ($map === null) {
        $map = [];
        $lists = [get_raid_instances(), get_dungeon_instances()];
        foreach (I18N_LANGS as $l) {
            $loc = bnet_locale($l);
            if ($loc === bnet_locale()) continue;
            foreach (['raids', 'dungeons'] as $kind) $lists[] = cache_get(journal_cache_key($kind, $loc)) ?: [];
        }
        foreach (array_merge(...$lists) as $ri) {
            $k = mb_strtolower((string) ($ri['name'] ?? ''));
            if ($k !== '' && !empty($ri['image']) && !isset($map[$k])) $map[$k] = $ri['image'];
        }
    }
    return $map[mb_strtolower(trim($name))] ?? null;
}

function demo_raid_instances(): array {
    // Nur Fallback ohne Blizzard-Creds; ohne echtes Tile → Farbverlauf-Cover (image=null).
    return [
        ['id' => 1273, 'name' => 'Manaschmiede Omega', 'difficulties' => ['lfr', 'normal', 'heroic', 'mythic'], 'image' => null, 'expansion' => 'The War Within', 'expansionId' => 505],
        ['id' => 1271, 'name' => 'Befreiung von Lorenhall', 'difficulties' => ['lfr', 'normal', 'heroic', 'mythic'], 'image' => null, 'expansion' => 'The War Within', 'expansionId' => 505],
        ['id' => 1296, 'name' => 'Palast der Nerub\'ar', 'difficulties' => ['lfr', 'normal', 'heroic', 'mythic'], 'image' => null, 'expansion' => 'The War Within', 'expansionId' => 505],
    ];
}

function demo_dungeon_instances(): array {
    // Nur Fallback ohne Blizzard-Creds; ohne echtes Tile → Farbverlauf-Cover (image=null).
    return [
        ['id' => 1274, 'name' => 'Ara-Kara, Stadt der Echos', 'difficulties' => ['normal', 'heroic', 'mythic', 'mplus'], 'image' => null, 'expansion' => 'The War Within', 'expansionId' => 505],
        ['id' => 1210, 'name' => 'Die Stadt der Fäden', 'difficulties' => ['normal', 'heroic', 'mythic', 'mplus'], 'image' => null, 'expansion' => 'The War Within', 'expansionId' => 505],
        ['id' => 1270, 'name' => 'Der Priorat der Heiligen Flamme', 'difficulties' => ['normal', 'heroic', 'mythic', 'mplus'], 'image' => null, 'expansion' => 'The War Within', 'expansionId' => 505],
    ];
}

// German↔English names for the current expansion's raids, matched by journal id.
// Lets us build external guide links in the right language (buffed/Wowhead-DE want
// the German name, Method/Wowhead-EN the English one). Cached 24 h.
function raid_name_pairs(): array {
    $ck = 'raid_name_pairs_' . cfg()['bnet_region'];
    $hit = cache_get($ck);
    if ($hit !== null) return $hit;

    $pairs = [];
    if (have_bnet_creds()) {
        $ns = static_ns();
        $idx = bnet_get('/data/wow/journal-expansion/index', null, $ns, 'en_US');
        $tiers = $idx['tiers'] ?? [];
        // Cover the two newest expansions (current + previous) so both the live
        // tier and the just-past one translate — the journal often already lists
        // an unreleased upcoming expansion as the highest id.
        usort($tiers, fn($a, $b) => ($b['id'] ?? 0) <=> ($a['id'] ?? 0));
        foreach (array_slice($tiers, 0, 2) as $exp) {
            $en = bnet_get('/data/wow/journal-expansion/' . (int) $exp['id'], null, $ns, 'en_US');
            $de = bnet_get('/data/wow/journal-expansion/' . (int) $exp['id'], null, $ns, 'de_DE');
            $deById = []; foreach ($de['raids'] ?? [] as $r) if (!empty($r['id'])) $deById[(int) $r['id']] = $r['name'] ?? null;
            foreach ($en['raids'] ?? [] as $r) {
                $id = (int) ($r['id'] ?? 0);
                if (!$id) continue;
                $enName = $r['name'] ?? null;
                $deName = $deById[$id] ?? $enName;
                if ($enName || $deName) $pairs[] = ['de' => $deName ?: $enName, 'en' => $enName ?: $deName];
            }
        }
    }
    if (!$pairs) {
        // Fallback (demo / no creds): current retail raids, real localized names.
        $pairs = [
            ['de' => 'Manaschmiede Omega', 'en' => 'Manaforge Omega'],
            ['de' => 'Befreiung von Lorenhall', 'en' => 'Liberation of Undermine'],
            ['de' => 'Palast der Nerub\'ar', 'en' => 'Nerub-ar Palace'],
        ];
    }
    cache_set($ck, $pairs, 24 * 60 * 60 * 1000);
    return $pairs;
}

// Resolve any raid instance name (German or English) to both languages.
function translate_raid_name(string $name): array {
    $key = mb_strtolower(trim($name));
    foreach (raid_name_pairs() as $p) {
        if (mb_strtolower($p['de']) === $key || mb_strtolower($p['en']) === $key) return $p;
    }
    return ['de' => $name, 'en' => $name];
}

// ══ DEMO DATA ═══════════════════════════════════════════════════════════════
const CLASS_MAP = [
    1 => ['Krieger', '#C79C6E'], 2 => ['Paladin', '#F58CBA'], 3 => ['Jäger', '#ABD473'],
    4 => ['Schurke', '#FFF569'], 5 => ['Priester', '#F0F0F0'], 6 => ['Todesritter', '#C41F3B'],
    7 => ['Schamane', '#0070DE'], 8 => ['Magier', '#69CCF0'], 9 => ['Hexenmeister', '#9482C9'],
    10 => ['Mönch', '#00FF96'], 11 => ['Druide', '#FF7D0A'], 12 => ['Dämonenjäger', '#A330C9'],
    13 => ['Rufer', '#33937F'],
];
const DEMO_REALM = ['name' => 'Beispielreich', 'slug' => 'beispielreich'];
// The guild every demo character belongs to. It is provisioned like a real one
// (ensure_guild), so it ends up in the guilds table and has to be recognised
// again wherever real guilds are counted - see guild_stats() in stats.php.
const DEMO_GUILD = ['name' => 'Beispielgilde', 'realm_slug' => 'beispielreich', 'name_slug' => 'beispielgilde'];

function svg_avatar(string $name, string $color): string {
    $i = mb_strtoupper(mb_substr($name, 0, 1));
    $svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">'
        . '<defs><radialGradient id="g" cx="50%" cy="35%" r="75%"><stop offset="0%" stop-color="' . $color . '"/>'
        . '<stop offset="100%" stop-color="#2E3440"/></radialGradient></defs>'
        . '<rect width="200" height="200" fill="url(#g)"/>'
        . '<text x="100" y="132" font-family="Georgia,serif" font-size="110" font-weight="700" '
        . 'text-anchor="middle" fill="#ECEFF4" opacity="0.92">' . htmlspecialchars($i) . '</text></svg>';
    return 'data:image/svg+xml;base64,' . base64_encode($svg);
}
function svg_banner(string $name, string $color): string {
    $i = mb_strtoupper(mb_substr($name, 0, 1));
    $svg = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420">'
        . '<defs><linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="' . $color . '"/>'
        . '<stop offset="70%" stop-color="#3B4252"/><stop offset="100%" stop-color="#2E3440"/></linearGradient></defs>'
        . '<rect width="640" height="420" fill="url(#b)"/><circle cx="470" cy="120" r="220" fill="#fff" opacity="0.06"/>'
        . '<text x="40" y="360" font-family="Georgia,serif" font-size="150" font-weight="700" fill="#ECEFF4" opacity="0.85">'
        . htmlspecialchars($i) . '</text></svg>';
    return 'data:image/svg+xml;base64,' . base64_encode($svg);
}
function demo_media(string $name, int $classId): array {
    $color = CLASS_MAP[$classId][1] ?? '#88C0D0';
    return ['avatar' => svg_avatar($name, $color), 'inset' => svg_banner($name, $color), 'main' => svg_banner($name, $color)];
}

function demo_char_defs(): array {
    return [
        ['Grimwald', 11, 80, 22, 'Guardian', 28450, 2841, 639],
        ['Lyriana', 5, 80, 4, 'Holy', 21230, 2610, 636],
        ['Zugzug', 1, 80, 2, 'Fury', 15980, 2455, 641],
    ];
}
function demo_characters(): array {
    $out = [];
    foreach (demo_char_defs() as $d) {
        [$name, $cid, $lvl, $raceId] = $d;
        $race = tr('demo.race.' . $raceId);
        $out[] = [
            'id' => char_id(DEMO_REALM['slug'], $name), 'name' => $name, 'realm' => DEMO_REALM['name'],
            'realmSlug' => DEMO_REALM['slug'], 'level' => $lvl, 'className' => CLASS_MAP[$cid][0],
            'classId' => $cid, 'raceName' => $race, 'faction' => 'ALLIANCE',
        ];
    }
    return $out;
}
function demo_detail_for(string $id): array {
    $name = explode(':', $id)[1] ?? 'X';
    foreach (demo_char_defs() as $d) {
        if (mb_strtolower($d[0]) === $name) {
            [$n, $cid, $lvl, $raceId, $spec, $ap, $mp, $ilvl] = $d;
            $race = tr('demo.race.' . $raceId);
            return [
                'id' => $id, 'name' => $n, 'realm' => DEMO_REALM['name'], 'realmSlug' => DEMO_REALM['slug'],
                'region' => cfg()['bnet_region'],
                'level' => $lvl, 'className' => CLASS_MAP[$cid][0], 'classId' => $cid, 'specName' => $spec,
                'raceName' => $race, 'faction' => 'ALLIANCE', 'itemLevel' => $ilvl,
                'guild' => DEMO_GUILD['name'],
                'guildRealmSlug' => DEMO_GUILD['realm_slug'], 'guildNameSlug' => DEMO_GUILD['name_slug'],
                'guildRealmName' => DEMO_REALM['name'], 'guildFaction' => 'ALLIANCE',
                'title' => null, 'achievementPoints' => $ap, 'mythicRating' => $mp, 'images' => demo_media($n, $cid),
            ];
        }
    }
    return [
        'id' => $id, 'name' => ucfirst($name), 'realmSlug' => DEMO_REALM['slug'], 'region' => cfg()['bnet_region'], 'level' => 80,
        'className' => 'Magier', 'classId' => 8, 'achievementPoints' => 0, 'mythicRating' => 0,
        'images' => demo_media($name, 8),
    ];
}
function demo_media_for(string $id): array {
    $name = explode(':', $id)[1] ?? 'X';
    foreach (demo_char_defs() as $d) if (mb_strtolower($d[0]) === $name) return demo_media($d[0], $d[1]);
    return demo_media($name, 8);
}
function demo_roster(): array {
    $defs = [
        ['Grimwald', 11, 0], ['Lyriana', 5, 1], ['Zugzug', 1, 1], ['Faelith', 12, 2],
        ['Bronzebeard', 8, 2], ['Shadowmend', 9, 3], ['Voidcaller', 9, 4], ['Stormhoof', 7, 3],
        ['Ironbark', 11, 4], ['Sunweaver', 2, 2], ['Nightclaw', 4, 5], ['Frostbite', 6, 3],
        ['Emberfall', 13, 4], ['Willowmere', 10, 5], ['Ravenna', 3, 5], ['Thornheart', 2, 6],
    ];
    $out = [];
    foreach ($defs as $i => [$name, $cid, $rank]) {
        $out[] = [
            'id' => char_id(DEMO_REALM['slug'], $name), 'name' => $name, 'realm' => DEMO_REALM['slug'],
            'level' => 80, 'classId' => $cid, 'className' => CLASS_MAP[$cid][0], 'rank' => $rank,
            'achievementPoints' => 12000 + (($i * 1373) % 18000),
            'mythicRating' => $rank <= 2 ? 2400 + (($i * 91) % 500) : 1200 + (($i * 137) % 1300),
            'itemLevel' => 628 + (($i * 3) % 16), 'avatar' => demo_media($name, $cid)['avatar'],
        ];
    }
    return $out;
}
