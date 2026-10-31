<?php
// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: MIT
// Cross-guild figures for outside displays, and the tokens that unlock them.
//
// GET /stats is the only route here that needs no session. It is opened by a
// token instead: one generated in the app (stats_tokens), or the static
// 'stats_token' from the configuration, which predates the table and still
// works. With neither in place the route does not exist at all.

// A token is stored only as its SHA-256, the way a password is: the plain text
// is shown once, when it is generated, and cannot be read back afterwards. The
// prefix is kept beside it so a token can still be told apart in a list.
define('STATS_TOKEN_PREFIX', 'rdx_');

function stats_tokens(): array {
    $st = db()->query('SELECT id, label, prefix, created_at, last_used_at FROM ' . tbl('stats_tokens')
        . ' ORDER BY created_at DESC');
    return array_map(fn($r) => [
        'id' => (int) $r['id'],
        'label' => $r['label'],
        'prefix' => $r['prefix'],
        'createdAt' => (int) $r['created_at'],
        'lastUsedAt' => $r['last_used_at'] !== null ? (int) $r['last_used_at'] : null,
    ], $st->fetchAll());
}

// Returns the plain token; it is never recoverable after this call.
function create_stats_token(string $label, ?int $userId): array {
    $plain = STATS_TOKEN_PREFIX . bin2hex(random_bytes(24));
    db()->prepare('INSERT INTO ' . tbl('stats_tokens') . ' (label, token_hash, prefix, created_by, created_at)
        VALUES (?,?,?,?,?)')
        ->execute([$label, hash('sha256', $plain), substr($plain, 0, 12), $userId, now_ms()]);
    return ['token' => $plain];
}

function delete_stats_token(int $id): bool {
    $st = db()->prepare('DELETE FROM ' . tbl('stats_tokens') . ' WHERE id = ?');
    $st->execute([$id]);
    return $st->rowCount() > 0;
}

function stats_tokens_exist(): bool {
    return (int) db()->query('SELECT COUNT(*) FROM ' . tbl('stats_tokens'))->fetchColumn() > 0;
}

// Is this endpoint open at all? Without a single token, generated or
// configured, GET /stats answers 404 rather than 403 - an endpoint nobody has
// turned on should not announce itself.
function stats_endpoint_open(): bool {
    return (string) (cfg()['stats_token'] ?? '') !== '' || stats_tokens_exist();
}

// hash_equals against the configured token, then a lookup of the hash. Both
// comparisons are constant-time; the SQL one matches on the digest, which
// carries no secret. A hit stamps last_used_at so a token nothing reads any
// more can be spotted in the list.
// The fixture guild demo logins land in, by the slugs demo_detail_for() hands
// out. Matched on the slugs rather than on the display name: that one is the
// user's to rename, the slugs are what ensure_guild() keys on.
function is_demo_guild(array $g): bool {
    return $g['realm_slug'] === DEMO_GUILD['realm_slug'] && $g['name_slug'] === DEMO_GUILD['name_slug'];
}

function stats_token_valid(string $sent): bool {
    if ($sent === '') return false;

    $configured = (string) (cfg()['stats_token'] ?? '');
    if ($configured !== '' && hash_equals($configured, $sent)) return true;

    $st = db()->prepare('SELECT id FROM ' . tbl('stats_tokens') . ' WHERE token_hash = ?');
    $st->execute([hash('sha256', $sent)]);
    $id = $st->fetchColumn();
    if ($id === false) return false;

    db()->prepare('UPDATE ' . tbl('stats_tokens') . ' SET last_used_at = ? WHERE id = ?')
        ->execute([now_ms(), $id]);
    return true;
}

// ── Cross-guild figures for external displays ───────────────────────────────
// One row per guild: the Blizzard roster's member count, how many characters
// the scanner has on file, and the guild's best Mythic+ rating ("the M+ king").
// Sorted largest first, so a caller that only wants the top few can truncate.
//
// The demo guild is left out, of itself and of every total. It is provisioned
// like a real one the first time anybody logs in without Battle.net, but it is
// a fixture with invented members - counting it would overstate what is
// actually on the instance, and it is the one row nobody reading these figures
// is asking about.
// $withInternals adds the guild's own row id and its live scanning flag. Those
// are the operator's business - the Gilden view scans a guild by id - and no
// business of a statistics token, which is why they are off by default: the
// same figures go out to any display holding a token.
function guild_stats(bool $withInternals = false): array {
    $guilds = db()->query('SELECT id, display_name, realm_name, realm_slug, name_slug, region,
                                  faction, member_count, achievement_points, last_scan_at, scanning
        FROM ' . tbl('guilds'))->fetchAll();
    $guilds = array_values(array_filter($guilds, fn($g) => !is_demo_guild($g)));
    $real = array_flip(array_map(fn($g) => (int) $g['id'], $guilds));

    // Two sweeps over the character table rather than two queries per guild.
    // DISTINCT ON gives the top-rated character of each guild in one pass; the
    // name breaks a tie so the answer does not flip between two calls.
    $scanned = [];
    foreach (db()->query('SELECT guild_id, COUNT(*) c FROM ' . tbl('characters') . ' GROUP BY guild_id') as $r)
        if (isset($real[(int) $r['guild_id']]))
            $scanned[(int) $r['guild_id']] = (int) $r['c'];

    $kings = [];
    foreach (db()->query('SELECT DISTINCT ON (guild_id) guild_id, name, realm_slug, mythic_rating
        FROM ' . tbl('characters') . ' WHERE mythic_rating > 0
        ORDER BY guild_id, mythic_rating DESC, name') as $r)
        $kings[(int) $r['guild_id']] = [
            'name' => $r['name'],
            'realm' => $r['realm_slug'],
            'rating' => (int) $r['mythic_rating'],
        ];

    $list = [];
    $members = 0;
    foreach ($guilds as $g) {
        $id = (int) $g['id'];
        // member_count is null until the guild has been scanned once; it stays
        // null in the answer rather than becoming a 0 that reads as "empty".
        $count = $g['member_count'] !== null ? (int) $g['member_count'] : null;
        $members += $count ?? 0;
        $row = [
            'name' => $g['display_name'],
            'realm' => $g['realm_name'] ?: $g['realm_slug'],
            'region' => $g['region'],
            'faction' => $g['faction'],
            'members' => $count,
            'scanned' => $scanned[$id] ?? 0,
            'achievementPoints' => $g['achievement_points'] !== null ? (int) $g['achievement_points'] : null,
            'lastScanAt' => $g['last_scan_at'] !== null ? (int) $g['last_scan_at'] : null,
            'king' => $kings[$id] ?? null,
        ];
        if ($withInternals) {
            $row['id'] = $id;
            $row['scanning'] = !empty($g['scanning']);
        }
        $list[] = $row;
    }

    usort($list, fn($a, $b) => ($b['members'] ?? -1) <=> ($a['members'] ?? -1)
                            ?: strcasecmp($a['name'], $b['name']));

    return [
        'generatedAt' => now_ms(),
        'guilds' => count($list),
        'members' => $members,
        'scanned' => array_sum($scanned),
        'list' => $list,
    ];
}
