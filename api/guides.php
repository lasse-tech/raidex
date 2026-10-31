<?php
// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: AGPL-3.0-or-later
// Raid guides. Standard links (Wowhead DE+EN, method.gg, buffed.de) are generated
// globally per raid instance; guilds can add their own (instance-wide or pinned to
// a single calendar entry). GM/raidleads and appointed Quartiermeister may manage
// them, including hiding/rewording the system defaults per instance.

// Slug used by Method/Wowhead guide URLs: drop internal punctuation (apostrophes,
// the "Nerub-ar" hyphen), then turn whitespace into single hyphens.
// "Nerub-ar Palace" → "nerubar-palace", "Manaforge Omega" → "manaforge-omega".
function raid_slug(string $name): string {
    $s = mb_strtolower(trim($name));
    $s = str_replace(['ä', 'ö', 'ü', 'ß'], ['a', 'o', 'u', 'ss'], $s);
    $s = str_replace(["'", "’", '-', '.', ':', ','], '', $s);
    $s = preg_replace('/\s+/', '-', $s);
    return preg_replace('/[^a-z0-9-]/', '', $s);
}

// The global "seed": the usual guide sites for a given raid instance. The raid
// name is translated so each site gets the language it expects — German first
// (Wowhead-DE, buffed), then English (Wowhead-EN, Method).
function default_guides(string $instance): array {
    $t = translate_raid_name($instance);
    $qDe = rawurlencode($t['de']);
    $qEn = rawurlencode($t['en']);
    $slug = raid_slug($t['en']);
    return [
        ['defKey' => 'wowhead:de', 'site' => 'wowhead', 'lang' => 'de', 'title' => 'Wowhead', 'url' => "https://de.wowhead.com/search?q=$qDe", 'global' => true, 'scope' => 'system'],
        ['defKey' => 'buffed:de',  'site' => 'buffed',  'lang' => 'de', 'title' => 'buffed',  'url' => "https://www.buffed.de/?s=$qDe", 'global' => true, 'scope' => 'system'],
        ['defKey' => 'wowhead:en', 'site' => 'wowhead', 'lang' => 'en', 'title' => 'Wowhead', 'url' => "https://www.wowhead.com/search?q=$qEn", 'global' => true, 'scope' => 'system'],
        ['defKey' => 'method:en',  'site' => 'method',  'lang' => 'en', 'title' => 'Method',  'url' => "https://www.method.gg/guides/$slug", 'global' => true, 'scope' => 'system'],
    ];
}

// Favicon for a hand-added guide link, resolved from the site and cached by
// hostname (30 days) so we parse each site's icon only once.
function favicon_for_host(?string $host): ?string {
    if (!$host) return null;
    $host = strtolower(preg_replace('/^www\./', '', $host));
    if (!preg_match('/^[a-z0-9.-]+\.[a-z]{2,}$/', $host)) return null;
    $ck = 'favicon_' . $host;
    $hit = cache_get($ck);
    if ($hit !== null) return $hit ?: null;
    $icon = resolve_favicon($host);
    cache_set($ck, $icon ?: '', 30 * 24 * 60 * 60 * 1000);
    return $icon ?: null;
}

// Parse <link rel="icon"> from the homepage; fall back to /favicon.ico, then to
// Google's favicon service so a chip always has an icon.
function resolve_favicon(string $host): ?string {
    $base = "https://$host/";
    $html = favicon_http_get($base, true);
    if ($html && preg_match_all('/<link\b[^>]*>/i', $html, $tags)) {
        $best = null;
        foreach ($tags[0] as $tag) {
            if (!preg_match('/\brel\s*=\s*["\']?[^"\'>]*icon/i', $tag)) continue;
            if (!preg_match('/\bhref\s*=\s*["\']([^"\']+)["\']/i', $tag, $h)) continue;
            $best = favicon_absolutize(trim($h[1]), $base);
            if (stripos($tag, 'apple-touch') === false) break; // prefer a normal icon
        }
        if ($best) return $best;
    }
    $ico = "https://$host/favicon.ico";
    if (favicon_http_get($ico, false) !== null) return $ico;
    return "https://www.google.com/s2/favicons?sz=64&domain=$host";
}

function favicon_absolutize(string $href, string $base): string {
    if (preg_match('#^https?://#i', $href)) return $href;
    if (str_starts_with($href, '//')) return 'https:' . $href;
    $p = parse_url($base);
    $origin = $p['scheme'] . '://' . $p['host'];
    if (str_starts_with($href, '/')) return $origin . $href;
    return $origin . '/' . ltrim($href, './');
}

// Small guarded HTTP GET (public sites only). $wantBody=false → just probe existence.
function favicon_http_get(string $url, bool $wantBody): ?string {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 3,
        CURLOPT_TIMEOUT => 5,
        CURLOPT_CONNECTTIMEOUT => 4,
        CURLOPT_NOBODY => !$wantBody,
        CURLOPT_USERAGENT => 'RaidexBot/1.0 (+favicon)',
        CURLOPT_RANGE => $wantBody ? '0-200000' : null,
    ]);
    $res = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($code < 200 || $code >= 400) return null;
    return $wantBody ? (is_string($res) ? $res : '') : '';
}

function is_quartermaster_char(int $guildId, string $realmSlug, string $name): bool {
    $st = db()->prepare('SELECT 1 FROM ' . tbl('quartermasters') . ' WHERE guild_id=? AND realm_slug=? AND name_lower=?');
    $st->execute([$guildId, strtolower(rawurldecode($realmSlug)), mb_strtolower($name)]);
    return (bool) $st->fetchColumn();
}

// Whether the user IS an appointed Quartiermeister — the role, resolved from
// their main. Not to be confused with can_manage_guides() below, which is the
// permission and also true for a GM or raidlead.
function is_quartermaster(array $user, ?array $guild): bool {
    if (!$guild || empty($user['active_char_id'])) return false;
    [$rs, $nm] = array_pad(explode(':', $user['active_char_id'], 2), 2, '');
    return is_quartermaster_char((int) $guild['id'], $rs, $nm);
}

// GM, raidleads, and appointed Quartiermeister may manage the guild's guides.
function can_manage_guides(array $user, ?array $guild): bool {
    if (!$guild) return false;
    if (is_guild_admin($user, $guild)) return true; // GM or raidlead
    if (empty($user['active_char_id'])) return false;
    [$rs, $nm] = array_pad(explode(':', $user['active_char_id'], 2), 2, '');
    return is_quartermaster_char((int) $guild['id'], $rs, $nm);
}

// Set of appointed Quartiermeister, keyed "realmslug:namelower".
function quartermaster_keys(int $guildId): array {
    $st = db()->prepare('SELECT realm_slug, name_lower FROM ' . tbl('quartermasters') . ' WHERE guild_id=?');
    $st->execute([$guildId]);
    $set = [];
    foreach ($st->fetchAll() as $r) $set[$r['realm_slug'] . ':' . $r['name_lower']] = true;
    return $set;
}

// Global defaults (with the guild's Quartiermeister overrides applied) + the
// guild's own instance-wide guides; with $raidId also the guides pinned to
// that single calendar entry.
function guides_for_instance(int $guildId, string $instance, ?int $raidId = null): array {
    $ov = [];
    $st = db()->prepare('SELECT def_key, hidden, title, url FROM ' . tbl('guide_defaults') . ' WHERE guild_id=? AND instance=?');
    $st->execute([$guildId, $instance]);
    foreach ($st->fetchAll() as $r) $ov[$r['def_key']] = $r;
    $out = [];
    foreach (default_guides($instance) as $g) {
        $o = $ov[$g['defKey']] ?? null;
        if ($o && (int) $o['hidden']) continue;
        if ($o) {
            if ($o['title'] !== null && $o['title'] !== '') $g['title'] = $o['title'];
            if ($o['url'] !== null && $o['url'] !== '') $g['url'] = $o['url'];
        }
        $out[] = $g;
    }
    // created_by is resolved live through users rather than snapshotted into the
    // guides row (as raids do for their creator): it needs no backfill for rows
    // written before this, and a guide is a standing link, so naming the
    // author's current main is more useful than the one they had that day.
    $sql = 'SELECT g.id, g.site, g.lang, g.title, g.url, g.favicon, g.raid_id, u.active_char_id'
        . ' FROM ' . tbl('guides') . ' g LEFT JOIN ' . tbl('users') . ' u ON u.id = g.created_by'
        . ' WHERE g.guild_id=? AND g.instance=? AND (g.raid_id IS NULL'
        . ($raidId ? ' OR g.raid_id=?' : '') . ') ORDER BY g.id';
    $st = db()->prepare($sql);
    $st->execute($raidId ? [$guildId, $instance, $raidId] : [$guildId, $instance]);
    $rows = $st->fetchAll();

    // Role of each author, for the "Von <Name> <Rolle>" heading the clients
    // render. Resolved in bulk — three queries regardless of how many guides
    // there are — and keyed by active_char_id, which char_id() already shapes
    // as "realmslug:namelower", exactly like the appointment tables.
    //
    // Deliberately not guild_char_rank(): its fallback fetches the live roster
    // from Blizzard, and a label does not justify a round trip per author.
    $gms = [];
    $leads = [];
    $qms = [];
    if ($rows) {
        $st = db()->prepare('SELECT realm_slug, name_lower FROM ' . tbl('characters') . ' WHERE guild_id=? AND rank=0');
        $st->execute([$guildId]);
        foreach ($st->fetchAll() as $g) $gms[$g['realm_slug'] . ':' . $g['name_lower']] = true;
        $leads = guild_raidlead_keys($guildId);
        $qms = quartermaster_keys($guildId);
    }

    foreach ($rows as $r) {
        $icon = $r['favicon'] ?: null;
        if (!$icon) { // legacy rows: resolve + backfill (hostname-cached, cheap)
            $icon = favicon_for_host(parse_url($r['url'], PHP_URL_HOST) ?: null);
            if ($icon) db()->prepare('UPDATE ' . tbl('guides') . ' SET favicon=? WHERE id=?')->execute([$icon, $r['id']]);
        }
        $key = $r['active_char_id'] ?? '';
        // A role can be lost after the fact (roster rescan, an appointment
        // revoked), so an author may legitimately end up with no chip at all.
        $isGM = $key !== '' && isset($gms[$key]);
        $isLead = $key !== '' && isset($leads[$key]);
        $out[] = ['id' => (int) $r['id'], 'site' => $r['site'], 'lang' => $r['lang'], 'title' => $r['title'], 'url' => $r['url'], 'iconUrl' => $icon,
            'global' => false, 'scope' => $r['raid_id'] ? 'raid' : 'instance',
            'createdBy' => char_display_name($r['active_char_id'] ?? null),
            'createdByGM' => $isGM,
            'createdByLead' => !$isGM && $isLead,
            'createdByQM' => !$isGM && !$isLead && $key !== '' && isset($qms[$key])];
    }
    return $out;
}
