<?php
// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: MIT
// Raidex Keys - the desktop companion (lasse-tech/raidex-keys): connecting it to
// an account, the MDT routes and the keystones it stores here.

// ── connecting the app ─────────────────────────────────────────────────────
// Raidex Keys connects to a Raidex account the way a TV does: it asks for a
// code, opens /verbinden?code=… on the Raidex website, and the user - logged
// in there the normal way - confirms the code shown in the app. Meanwhile the
// app asks every few seconds whether it was; then it gets a session of its
// own. Nothing listens on the user's machine, no session travels in a URL,
// and the only login is Raidex's own.

const KEY_CONNECT_TTL_MS = 10 * 60 * 1000;
const KEY_CONNECT_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no 0/O, 1/I

function key_connect_user_code(): string {
    $c = '';
    for ($i = 0; $i < 8; $i++) $c .= KEY_CONNECT_ALPHABET[random_int(0, strlen(KEY_CONNECT_ALPHABET) - 1)];
    return substr($c, 0, 4) . '-' . substr($c, 4);
}

// POST /keys/connect: a new code pair. The device code is the app's secret -
// only its hash is kept; the user code is what the website shows.
function key_connect_start(): array {
    $now = now_ms();
    db()->prepare('DELETE FROM ' . tbl('key_connects') . ' WHERE expires_at < ?')->execute([$now - 3600 * 1000]);
    $ip = substr((string) ($_SERVER['REMOTE_ADDR'] ?? ''), 0, 64);
    $st = db()->prepare('SELECT COUNT(*) FROM ' . tbl('key_connects') . ' WHERE ip = ? AND created_at > ?');
    $st->execute([$ip, $now - KEY_CONNECT_TTL_MS]);
    if ((int) $st->fetchColumn() >= 10) json_err('too_many', 429);

    $device = bin2hex(random_bytes(32));
    for ($try = 0; $try < 5; $try++) {
        $user = key_connect_user_code();
        try {
            db()->prepare('INSERT INTO ' . tbl('key_connects') . ' (device_hash, user_code, ip, status, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
                ->execute([hash('sha256', $device), $user, $ip, 'pending', $now, $now + KEY_CONNECT_TTL_MS]);
            $g = cfg();
            return [
                'deviceCode' => $device,
                'userCode' => $user,
                'verifyUrl' => rtrim($g['site_origin'], '/') . ($g['app_path'] ?? '') . '/verbinden?code=' . $user,
                'interval' => 3,
                'expiresIn' => KEY_CONNECT_TTL_MS / 1000,
            ];
        } catch (PDOException $e) {
            // The rare user code taken twice: draw again.
        }
    }
    json_err('server_error', 500);
}

function key_connect_row(string $userCode): ?array {
    $st = db()->prepare('SELECT * FROM ' . tbl('key_connects') . ' WHERE user_code = ? AND expires_at > ?');
    $st->execute([strtoupper(trim($userCode)), now_ms()]);
    return $st->fetch() ?: null;
}

// GET /keys/connect/{code}: what the website shows before asking.
function key_connect_info(string $userCode): array {
    $r = key_connect_row($userCode);
    if (!$r) json_err('not_found', 404);
    return ['userCode' => $r['user_code'], 'status' => $r['status']];
}

// POST /keys/connect/{code}/approve|deny: the logged-in user decides. An
// approval opens the session the app will fetch.
function key_connect_decide(array $u, string $userCode, bool $approve): array {
    $r = key_connect_row($userCode);
    if (!$r) json_err('not_found', 404);
    if ($r['status'] !== 'pending') json_err('already_decided', 409);
    if ($approve) {
        db()->prepare('UPDATE ' . tbl('key_connects') . ' SET status = ?, user_id = ?, session_id = ? WHERE device_hash = ?')
            ->execute(['approved', (int) $u['id'], create_session((int) $u['id']), $r['device_hash']]);
    } else {
        db()->prepare('UPDATE ' . tbl('key_connects') . ' SET status = ? WHERE device_hash = ?')->execute(['denied', $r['device_hash']]);
    }
    return ['status' => $approve ? 'approved' : 'denied'];
}

// POST /keys/connect/poll: the app asks. The session goes out once.
function key_connect_poll(array $b): array {
    $st = db()->prepare('SELECT * FROM ' . tbl('key_connects') . ' WHERE device_hash = ?');
    $st->execute([hash('sha256', (string) ($b['deviceCode'] ?? ''))]);
    $r = $st->fetch();
    if (!$r || ($r['status'] === 'pending' && (int) $r['expires_at'] < now_ms())) return ['status' => 'expired'];
    if ($r['status'] === 'pending') return ['status' => 'pending'];
    db()->prepare('DELETE FROM ' . tbl('key_connects') . ' WHERE device_hash = ?')->execute([$r['device_hash']]);
    return $r['status'] === 'approved' ? ['status' => 'approved', 'session' => $r['session_id']] : ['status' => 'denied'];
}

// ── routes ──────────────────────────────────────────────────────────────────
// A route pasted in the app, stored as the MDT export string it came as, with
// what the app read from it. The server decodes nothing: the string is the
// route, the rest is for lists. Per route its owner decides who sees it - the
// owner alone, or the guild that was active when it was shared.

const KEY_ROUTE_MAX = 262144;   // bytes of MDT string; a route is a few KB

function key_route_public(array $r, int $viewerId): array {
    return [
        'id' => (int) $r['id'],
        'mapId' => (int) $r['map_id'],
        'name' => $r['name'],
        'uid' => $r['uid'],
        'pulls' => (int) $r['pulls'],
        'forces' => (float) $r['forces'],
        'mdt' => $r['mdt'],
        'visibility' => $r['guild_id'] !== null ? 'guild' : 'me',
        'guildName' => $r['guild_name'] ?? null,
        'mine' => (int) $r['user_id'] === $viewerId,
        // A character's name, never the BattleTag (see char_display_name).
        'owner' => char_display_name($r['active_char_id'] ?? null),
        'updatedAt' => (int) $r['updated_at'],
    ];
}

function key_route_select(): string {
    return 'SELECT r.*, u.active_char_id, g.display_name AS guild_name FROM ' . tbl('key_routes') . ' r
            JOIN ' . tbl('users') . ' u ON u.id = r.user_id
            LEFT JOIN ' . tbl('guilds') . ' g ON g.id = r.guild_id';
}

// The caller's own routes and those shared with a guild the caller is in.
function key_routes_visible(array $u): array {
    $uid = (int) $u['id'];
    $st = db()->prepare(key_route_select() . '
        WHERE r.user_id = ? OR r.guild_id IN (SELECT guild_id FROM ' . tbl('user_guilds') . ' WHERE user_id = ?)
        ORDER BY r.map_id, r.name, r.id');
    $st->execute([$uid, $uid]);
    return array_map(fn($r) => key_route_public($r, $uid), $st->fetchAll());
}

function key_route_find(int $id): ?array {
    $st = db()->prepare(key_route_select() . ' WHERE r.id = ?');
    $st->execute([$id]);
    return $st->fetch() ?: null;
}

// The guild a route is shared with: the caller's active one, for 'guild'.
function key_route_guild(array $u, string $visibility): ?int {
    if ($visibility === 'me') return null;
    $guild = current_guild($u);
    if (!$guild) json_err('no_active_guild', 400);
    return (int) $guild['id'];
}

function key_route_visibility(array $b): string {
    $v = (string) ($b['visibility'] ?? 'me');
    if (!in_array($v, ['me', 'guild'], true)) json_err('bad_visibility', 400);
    return $v;
}

// Stores a route; the same MDT uid again updates the owner's copy.
function key_route_save(array $u, array $b): array {
    $mdt = trim((string) ($b['mdt'] ?? ''));
    $name = trim((string) ($b['name'] ?? ''));
    $uid = isset($b['uid']) && $b['uid'] !== '' ? (string) $b['uid'] : null;
    $mapId = (int) ($b['mapId'] ?? 0);
    $pulls = (int) ($b['pulls'] ?? -1);
    $forces = is_numeric($b['forces'] ?? null) ? (float) $b['forces'] : -1;
    if ($mdt === '' || $mdt[0] !== '!' || strlen($mdt) > KEY_ROUTE_MAX) json_err('bad_mdt', 400);
    if ($name === '' || mb_strlen($name) > 128) json_err('bad_name', 400);
    if ($uid !== null && !preg_match('/^[A-Za-z0-9()_-]{1,64}$/', $uid)) json_err('bad_uid', 400);
    if ($mapId <= 0 || $pulls < 0 || $pulls > 200 || $forces < 0 || $forces > 1000) json_err('bad_route', 400);
    $guildId = key_route_guild($u, key_route_visibility($b));

    $now = now_ms();
    $existing = null;
    if ($uid !== null) {
        $st = db()->prepare('SELECT id FROM ' . tbl('key_routes') . ' WHERE user_id = ? AND uid = ?');
        $st->execute([(int) $u['id'], $uid]);
        $existing = $st->fetchColumn() ?: null;
    }
    if ($existing) {
        db()->prepare('UPDATE ' . tbl('key_routes') . ' SET guild_id=?, map_id=?, name=?, pulls=?, forces=?, mdt=?, updated_at=? WHERE id=?')
            ->execute([$guildId, $mapId, $name, $pulls, $forces, $mdt, $now, (int) $existing]);
        $id = (int) $existing;
    } else {
        $st = db()->prepare('INSERT INTO ' . tbl('key_routes') . ' (user_id, guild_id, uid, map_id, name, pulls, forces, mdt, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id');
        $st->execute([(int) $u['id'], $guildId, $uid, $mapId, $name, $pulls, $forces, $mdt, $now, $now]);
        $id = (int) $st->fetchColumn();
    }
    return key_route_public(key_route_find($id), (int) $u['id']);
}

// The owner's own route, or a 404 - also for a route of someone else, which the
// caller may be able to see but not change.
function key_route_owned(array $u, int $id): array {
    $r = key_route_find($id);
    if (!$r || (int) $r['user_id'] !== (int) $u['id']) json_err('not_found', 404);
    return $r;
}

function key_route_share(array $u, int $id, array $b): array {
    key_route_owned($u, $id);
    $guildId = key_route_guild($u, key_route_visibility($b));
    db()->prepare('UPDATE ' . tbl('key_routes') . ' SET guild_id=?, updated_at=? WHERE id=?')->execute([$guildId, now_ms(), $id]);
    return key_route_public(key_route_find($id), (int) $u['id']);
}

function key_route_delete(array $u, int $id): void {
    key_route_owned($u, $id);
    db()->prepare('DELETE FROM ' . tbl('key_routes') . ' WHERE id = ?')->execute([$id]);
}

// ── keystones ───────────────────────────────────────────────────────────────
// What the app reports from its SavedVariables (its plan, 7.1-7.3): the key of
// every character of the reporter's own ('self'), and the keys of guild members
// the addon heard through LibKeystone ('guild'). One row per character; the
// newest observation wins, at equal age 'self' beats 'guild'. A key expires at
// the weekly reset after it was seen - the addon knows that moment exactly and
// sends it along, so no Blizzard call is needed to know the week.

const KEY_WEEK_MS = 7 * 86400 * 1000;

// Realms come as "Festung der Stürme" (the addon, own characters), as
// "FestungderStürme" (guild keys: "Name-Realm", spaces removed) and as
// "festung-der-stürme" (Blizzard's slug). All three reduce to one key.
function realm_key(string $realm): string {
    return mb_strtolower(preg_replace("/[\\s'’\\-.]/u", '', $realm));
}

// The reset after an observation, given the reset the report came with.
function key_expiry(int $observedMs, int $resetMs): int {
    if ($observedMs < $resetMs) return $resetMs - intdiv($resetMs - $observedMs - 1, KEY_WEEK_MS) * KEY_WEEK_MS;
    return $resetMs + (intdiv($observedMs - $resetMs, KEY_WEEK_MS) + 1) * KEY_WEEK_MS;
}

// The characters on the reporter's Battle.net account, as realm_key:name_lower.
// Stored at each successful fetch, since Blizzard's user token lives about a
// day while a session lives a month; fetched anew while the token still
// works and the stored copy is a day old or missing.
function key_account_chars(array $u): array {
    $uid = (int) $u['id'];
    $st = db()->prepare('SELECT realm_key, name_lower, updated_at FROM ' . tbl('account_characters') . ' WHERE user_id = ?');
    $st->execute([$uid]);
    $rows = $st->fetchAll();
    $fresh = $rows && max(array_column($rows, 'updated_at')) > now_ms() - 86400 * 1000;
    $tokenOk = demo_mode() || (!empty($u['access_token']) && (int) ($u['token_expires'] ?? 0) > now_ms());
    if (!$fresh && $tokenOk) {
        try {
            $chars = get_account_characters($u['access_token'] ?? null);
            $now = now_ms();
            db()->prepare('DELETE FROM ' . tbl('account_characters') . ' WHERE user_id = ?')->execute([$uid]);
            $ins = db()->prepare('INSERT INTO ' . tbl('account_characters') . ' (user_id, realm_key, name_lower, updated_at) VALUES (?, ?, ?, ?)
                                  ON CONFLICT DO NOTHING');
            $rows = [];
            foreach ($chars as $c) {
                $row = ['realm_key' => realm_key($c['realmSlug']), 'name_lower' => mb_strtolower($c['name'])];
                $ins->execute([$uid, $row['realm_key'], $row['name_lower'], $now]);
                $rows[] = $row;
            }
        } catch (Throwable $e) {
            // Blizzard unreachable or the link aged out: the stored copy stands.
        }
    }
    return array_fill_keys(array_map(fn($r) => $r['realm_key'] . ':' . $r['name_lower'], $rows), true);
}

// The rosters of the guilds the reporter is in, as realm_key:name_lower.
function key_guild_roster(int $userId): array {
    $st = db()->prepare('SELECT c.realm_slug, c.name_lower FROM ' . tbl('characters') . ' c
        WHERE c.guild_id IN (SELECT guild_id FROM ' . tbl('user_guilds') . ' WHERE user_id = ?)');
    $st->execute([$userId]);
    $out = [];
    foreach ($st->fetchAll() as $r) $out[realm_key($r['realm_slug']) . ':' . mb_strtolower($r['name_lower'])] = true;
    return $out;
}

// Stores one observation unless a newer one - or an equally old 'self' over a
// 'guild' - is already there.
function key_store(array $k, int $userId): bool {
    $st = db()->prepare('SELECT observed_at, source FROM ' . tbl('keystones') . ' WHERE realm_key = ? AND name_lower = ?');
    $st->execute([$k['realm_key'], $k['name_lower']]);
    $old = $st->fetch();
    if ($old) {
        $newer = $k['observed_at'] > (int) $old['observed_at']
            || ($k['observed_at'] === (int) $old['observed_at'] && $k['source'] === 'self' && $old['source'] === 'guild');
        if (!$newer) return false;
    }
    $sql = $old
        ? 'UPDATE ' . tbl('keystones') . ' SET name=?, realm=?, map_id=?, level=?, rating=?, source=?, reported_by=?, observed_at=?, expires_at=?, received_at=?
           WHERE realm_key=? AND name_lower=?'
        : 'INSERT INTO ' . tbl('keystones') . ' (name, realm, map_id, level, rating, source, reported_by, observed_at, expires_at, received_at, realm_key, name_lower)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
    db()->prepare($sql)->execute([$k['name'], $k['realm'], $k['map_id'], $k['level'], $k['rating'], $k['source'], $userId,
        $k['observed_at'], $k['expires_at'], now_ms(), $k['realm_key'], $k['name_lower']]);
    return true;
}

// POST /keys/report: one parsed RaidexKeys.lua. Says what it took and what not.
function key_report(array $u, array $b): array {
    $resetMs = (int) ($b['resetAt'] ?? 0) * 1000;
    if ($resetMs <= 0) json_err('bad_report', 400);
    $now = now_ms();
    $own = key_account_chars($u);
    $roster = key_guild_roster((int) $u['id']);
    $stored = 0;
    $refused = ['notOnAccount' => [], 'notInGuild' => []];

    $entries = [];
    foreach (array_slice((array) ($b['characters'] ?? []), 0, 100) as $c) {
        $entries[] = ['source' => 'self', 'name' => (string) ($c['name'] ?? ''), 'realm' => (string) ($c['realm'] ?? '')] + (array) $c;
    }
    foreach (array_slice((array) ($b['guildKeys'] ?? []), 0, 1000) as $g) {
        // "Name-Realm", the realm without spaces; the name holds no '-'.
        [$name, $realm] = array_pad(explode('-', (string) ($g['character'] ?? ''), 2), 2, '');
        $entries[] = ['source' => 'guild', 'name' => $name, 'realm' => $realm] + (array) $g;
    }
    foreach ($entries as $e) {
        $name = trim($e['name']);
        $observed = (int) ($e['observedAt'] ?? 0) * 1000;
        // Nameless, from the future or older than a week and a day: nothing to keep.
        if ($name === '' || $e['realm'] === '' || mb_strlen($name) > 64 || $observed > $now + 600000 || $observed < $now - 8 * 86400 * 1000) continue;
        $key = realm_key($e['realm']) . ':' . mb_strtolower($name);
        if ($e['source'] === 'self' && !isset($own[$key])) { $refused['notOnAccount'][] = "$name-{$e['realm']}"; continue; }
        if ($e['source'] === 'guild' && !isset($roster[$key])) { $refused['notInGuild'][] = "$name-{$e['realm']}"; continue; }
        $mapId = isset($e['mapId']) ? (int) $e['mapId'] : 0;
        $level = isset($e['level']) ? (int) $e['level'] : 0;
        $hasKey = $mapId > 0 && $level > 0 && $level <= 40;
        $stored += key_store([
            'realm_key' => realm_key($e['realm']), 'name_lower' => mb_strtolower($name), 'name' => $name,
            'realm' => mb_substr($e['realm'], 0, 128), 'map_id' => $hasKey ? $mapId : null, 'level' => $hasKey ? $level : null,
            'rating' => isset($e['rating']) ? max(0, (int) $e['rating']) : null, 'source' => $e['source'],
            'observed_at' => $observed, 'expires_at' => key_expiry($observed, $resetMs),
        ], (int) $u['id']) ? 1 : 0;
    }
    return ['stored' => $stored, 'refused' => $refused];
}

// GET /keys/guild: the keys of the caller's active guild this week, with what
// the roster knows of each member - class, spec, role, its icon, item level. The role
// comes from the specialisation id, so no language is involved; it is null
// until the guild has been scanned again since spec_id was added.
function key_guild(array $u): array {
    $guild = current_guild($u);
    if (!$guild) json_err('no_active_guild', 400);
    $st = db()->prepare('SELECT c.name, c.realm_slug, c.class_id, c.spec, c.spec_id, c.item_level, c.mythic_rating FROM ' . tbl('characters') . ' c WHERE c.guild_id = ?');
    $st->execute([(int) $guild['id']]);
    $roster = [];
    foreach ($st->fetchAll() as $c) $roster[realm_key($c['realm_slug']) . ':' . mb_strtolower($c['name'])] = $c;
    if (!$roster) return ['guild' => $guild['display_name'], 'keys' => []];

    $st = db()->prepare('SELECT k.*, u.active_char_id FROM ' . tbl('keystones') . ' k JOIN ' . tbl('users') . ' u ON u.id = k.reported_by
        WHERE k.expires_at > ? AND k.map_id IS NOT NULL');
    $st->execute([now_ms()]);
    $keys = [];
    foreach ($st->fetchAll() as $k) {
        $c = $roster[$k['realm_key'] . ':' . $k['name_lower']] ?? null;
        if (!$c) continue;   // only this guild's members
        $keys[] = [
            'name' => $c['name'], 'realmSlug' => $c['realm_slug'], 'classId' => $c['class_id'] !== null ? (int) $c['class_id'] : null,
            'spec' => game_name('spec', $c['spec_id'] !== null ? (int) $c['spec_id'] : null) ?? $c['spec'], 'itemLevel' => $c['item_level'] !== null ? (int) $c['item_level'] : null,
            // Derived here, not stored: a fix to the table then needs no rescan.
            'role' => spec_role($c['spec_id'] !== null ? (int) $c['spec_id'] : null),
            // Blizzard's own icon for the specialisation, off their CDN - the
            // media lookup is cached a month, and there are 39 of them.
            'specIcon' => spec_icon_url($c['spec_id'] !== null ? (int) $c['spec_id'] : null),
            'mapId' => (int) $k['map_id'], 'level' => (int) $k['level'],
            'rating' => $k['rating'] !== null ? (int) $k['rating'] : ($c['mythic_rating'] !== null ? (int) $c['mythic_rating'] : null),
            'source' => $k['source'], 'observedAt' => intdiv((int) $k['observed_at'], 1000),
            'reportedBy' => char_display_name($k['active_char_id'] ?? null),
        ];
    }
    usort($keys, fn($a, $b) => [$b['level'], $b['rating']] <=> [$a['level'], $a['rating']]);
    return ['guild' => $guild['display_name'], 'keys' => $keys];
}

// GET /mplus/character/{realm}/{name}: the best run per dungeon of this
// season, with role and item level - what the app's group planner (its plan,
// 7.2b) weighs a guild mate's keystone by. Served only for the caller's own
// characters and for members of a guild the caller is in, the audience that
// already sees each other's keys (7.3).
function key_mplus_character(array $u, string $realm, string $name): array {
    $realm = mb_strtolower(rawurldecode($realm));
    $name = trim(rawurldecode($name));
    if ($name === '' || mb_strlen($name) > 64) json_err('bad_character', 400);
    $who = realm_key($realm) . ':' . mb_strtolower($name);
    if (!isset(key_guild_roster((int) $u['id'])[$who]) && !isset(key_account_chars($u)[$who])) {
        json_err('not_in_guild', 403);
    }
    $out = get_mplus_character(key_realm_slug($realm, $name), $name);
    if (!$out) json_err('unavailable', 502);
    return $out;
}

// Blizzard's profile API takes the realm as its slug and nothing else, while
// the app names a realm as the game shows it ("Festung der Stürme"), without
// spaces ("FestungderStürme", how guild keys carry it) or as the slug already.
// The roster knows the slug for everyone in it, so it decides; failing that,
// a display name still slugifies, and only the spaceless form has nothing to
// go on.
function key_realm_slug(string $realm, string $name): string {
    $wanted = realm_key($realm);
    $st = db()->prepare('SELECT DISTINCT realm_slug FROM ' . tbl('characters') . ' WHERE name_lower = ?');
    $st->execute([mb_strtolower($name)]);
    foreach ($st->fetchAll() as $r) {
        if (realm_key($r['realm_slug']) === $wanted) return $r['realm_slug'];
    }
    return str_contains($realm, ' ') ? str_replace(' ', '-', $realm) : $realm;
}
