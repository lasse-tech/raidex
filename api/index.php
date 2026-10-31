<?php
// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: MIT
// Front controller / router for the Raidex API (multi-tenant, PostgreSQL).
@set_time_limit(120);
@ini_set('memory_limit', '256M');
require __DIR__ . '/lib.php';
require __DIR__ . '/i18n.php';
require __DIR__ . '/db.php';
require __DIR__ . '/blizzard.php';
require __DIR__ . '/auth.php';
require __DIR__ . '/guilds.php';
require __DIR__ . '/stats.php';
require __DIR__ . '/guides.php';
require __DIR__ . '/push.php';
require __DIR__ . '/scan.php';
require __DIR__ . '/discord.php';
require __DIR__ . '/keys.php';

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Credentials: true');
    header('Vary: Origin');
}
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

// The schema is NOT applied here. It used to be -- db_init() before routing, on
// every request, the whole statement list whether or not the request went
// anywhere near the database. It belongs to api/migrate.php now, and db()
// checks on connecting that the database matches what this code expects.
//
// Consequence worth knowing: a request that opens no connection -- /health
// without a session cookie, for one -- now touches PostgreSQL not at all.
//
// Whatever escapes a handler leaves here as JSON. Without this it would be
// PHP's HTML error page, in an API where every caller parses JSON, so a server
// fault would arrive as a parse error and be blamed on the wrong thing. Only
// the schema guard's message is passed through, because it is addressed to
// whoever deploys; anything else says server_error and stays in the log.
set_exception_handler(function (Throwable $e) {
    if (str_starts_with($e->getMessage(), SCHEMA_OUTDATED)) {
        json_err($e->getMessage(), 503);
    }
    error_log('raidex: uncaught ' . get_class($e) . ': ' . $e->getMessage());
    json_err('server_error', 500);
});

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$route = $path;
foreach ([cfg()['base_path'], '/api'] as $b) {
    if (str_starts_with($path, $b)) { $route = substr($path, strlen($b)); break; }
}
$route = '/' . trim($route, '/');
$method = $_SERVER['REQUEST_METHOD'];
$g = cfg();

// ── Öffentliche Raid-Share-Vorschau (OG-Preview für Discord etc.) — keine Auth ──
// /r/{token}          → serverseitiges HTML mit Open-Graph-Tags (Crawler lesen die
//                       Tags, echte Browser werden per JS in die App weitergeleitet)
// /r/{token}/card.png → das Vorschaubild (GD-gezeichneter Raidkasten). Beides läuft
//                       auf dem Roh-Pfad, damit prod (/r/…) und dev (/dev/r/…) greifen.
if ($method === 'GET' && preg_match('#/r/([A-Za-z0-9_-]{8,64})(/card\.png)?$#', $path, $sm)) {
    require_once __DIR__ . '/raidcard.php';
    // Frische Per-Share-Tokens zuerst; alte raids.share_token als Fallback (bereits gepostete Links).
    $st = db()->prepare('SELECT r.* FROM ' . tbl('raid_shares') . ' s JOIN ' . tbl('raids') . ' r ON r.id = s.raid_id WHERE s.token = ?');
    $st->execute([$sm[1]]);
    $raid = $st->fetch();
    if (!$raid) {
        $st = db()->prepare('SELECT * FROM ' . tbl('raids') . ' WHERE share_token = ?');
        $st->execute([$sm[1]]);
        $raid = $st->fetch();
    }
    if (!$raid) {
        http_response_code(404);
        header('Content-Type: text/html; charset=utf-8');
        echo '<!doctype html><meta charset="utf-8"><title>' . htmlspecialchars(tr('card.notFound')) . '</title><p>' . htmlspecialchars(tr('card.gone')) . '</p>';
        exit;
    }
    $raid = raid_with_signups($raid, 0, false); // reichert counts + image an
    if (!empty($sm[2])) render_raid_card_png($raid);        // /card.png
    else render_raid_share_html($raid, $path);              // OG-HTML
    exit;
}

function match_route(string $pattern, string $route, ?array &$m): bool {
    $regex = '#^' . preg_replace('#\{[^}]+\}#', '([^/]+)', $pattern) . '$#';
    if (preg_match($regex, $route, $mm)) { array_shift($mm); $m = $mm; return true; }
    return false;
}
function guild_or_null(array $u): ?array { return current_guild($u); }
// The global admin BattleTag from the configuration - the same gate
// /docs/internal uses. Statistics tokens unlock figures that span every guild,
// so they are an operator's business, not a single guild's GM's.
function require_superadmin(): array {
    $u = require_auth();
    if (!is_admin($u['battletag'] ?? '')) json_err('not_allowed', 403);
    return $u;
}
function require_guild_admin(array $u): array {
    $guild = current_guild($u);
    if (!$guild) json_err('no_active_guild', 400);
    if (!is_guild_admin($u, $guild)) json_err('not_admin', 403);
    return $guild;
}
// GM, Raidleads und Quartiermeister dürfen Inhalte pflegen (Guides, "Aktuelles").
function require_content_manager(array $u): array {
    $guild = current_guild($u);
    if (!$guild) json_err('no_active_guild', 400);
    if (!can_manage_guides($u, $guild)) json_err('not_allowed', 403);
    return $guild;
}
// A raid may be managed by its creator OR any raidlead. Returns [guild, isAdmin].
function require_raid_manage(array $u, int $raidId): array {
    $guild = current_guild($u);
    if (!$guild) json_err('no_active_guild', 400);
    $st = db()->prepare('SELECT * FROM ' . tbl('raids') . ' WHERE id = ? AND guild_id = ?');
    $st->execute([$raidId, $guild['id']]);
    $raid = $st->fetch();
    if (!$raid) json_err('not_found', 404);
    $isAdmin = is_guild_admin($u, $guild);
    if (!$isAdmin && (int) ($raid['created_by'] ?? 0) !== (int) $u['id']) json_err('not_allowed', 403);
    return [$guild, $isAdmin];
}

// The signed-in user's own characters, with a dead Battle.net link reported as
// such. Without this the caller cannot tell "no characters" from "we could not
// ask", and the UI showed an empty roster to people who own dozens.
function account_characters(array $u): array {
    $expires = (int) ($u['token_expires'] ?? 0);
    // Check the stored expiry first: a token we know is stale needs no request
    // to Blizzard, and the answer is the same either way.
    if (!demo_mode() && ($u['provider'] ?? '') === 'bnet'
        && (empty($u['access_token']) || ($expires > 0 && $expires <= now_ms()))) {
        json_err('bnet_reauth_required', 409);
    }
    try {
        return get_account_characters($u['access_token'] ?? null);
    } catch (BnetProfileError $e) {
        json_err($e->getMessage(), $e->getMessage() === 'bnet_reauth_required' ? 409 : 503);
    }
}

// Character reload budget: at most once every 6 h per user (→ 4×/day, evenly
// spaced — no bursting 4 in a row).
function reload_status(int $userId): array {
    $spacing = 6 * 60 * 60 * 1000; $now = now_ms();
    $st = db()->prepare('SELECT MAX(at) AS m FROM ' . tbl('reloads') . ' WHERE user_id=?');
    $st->execute([$userId]);
    $last = $st->fetch()['m'] ?? null;
    $last = $last !== null ? (int) $last : null;
    $ready = $last === null || ($now - $last) >= $spacing;
    return ['limit' => 1, 'remaining' => $ready ? 1 : 0, 'nextAt' => $ready ? null : ($last + $spacing), 'spacingHours' => 6];
}

// ── AUTH ────────────────────────────────────────────────────────────────────
if ($route === '/auth/login' && $method === 'GET') {
    $platform = ($_GET['platform'] ?? '') === 'mobile' ? 'mobile' : 'web';
    $deep = fn($sid) => $g['app_scheme'] . '://auth?sid=' . urlencode($sid);
    if (demo_mode()) {
        $sid = demo_login_session();
        if ($platform === 'mobile') { header('Location: ' . $deep($sid)); exit; }
        set_session_cookie($sid);
        header('Location: ' . $g['site_origin'] . ($g['app_path'] ?? '') . '/'); exit;
    }
    header('Location: ' . begin_login($platform, !empty($_GET['switch']))); exit;
}
if ($route === '/auth/callback' && $method === 'GET') {
    try {
        [$sid, $platform] = complete_login();
        if ($platform === 'mobile') { header('Location: ' . $g['app_scheme'] . '://auth?sid=' . urlencode($sid)); exit; }
        set_session_cookie($sid);
        header('Location: ' . $g['site_origin'] . ($g['app_path'] ?? '') . '/'); exit;
    } catch (Throwable $e) {
        header('Location: ' . $g['site_origin'] . ($g['app_path'] ?? '') . '/?login_error=1'); exit;
    }
}
if ($route === '/auth/demo-token' && $method === 'POST') {
    if (!demo_mode()) json_err('not_demo', 404);
    json_out(['token' => demo_login_session()]);
}
// E-mail/password registration → demo account + verification mail.
if ($route === '/auth/register' && $method === 'POST') {
    $b = body();
    $email = trim($b['email'] ?? '');
    $pw = (string) ($b['password'] ?? '');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) json_err('invalid_email');
    if (strlen($pw) < 8) json_err('weak_password');
    try { $r = register_email_user($email, $pw); }
    catch (Throwable $e) { json_err($e->getMessage() === 'email_taken' ? 'email_taken' : 'register_failed', $e->getMessage() === 'email_taken' ? 409 : 500); }
    $mailed = send_verification_email($email, $r['verify']);
    $out = ['ok' => true, 'mailed' => $mailed];
    if (!$mailed) $out['verifyUrl'] = rtrim($g['site_origin'], '/') . '/api/auth/verify?token=' . urlencode($r['verify']);
    json_out($out);
}
// E-mail/password login (POST; the GET /auth/login is the Battle.net redirect).
if ($route === '/auth/login' && $method === 'POST') {
    $b = body();
    try { $u = login_email_user($b['email'] ?? '', (string) ($b['password'] ?? '')); }
    catch (Throwable $e) { json_err($e->getMessage() === 'not_verified' ? 'not_verified' : 'invalid_credentials', $e->getMessage() === 'not_verified' ? 403 : 401); }
    $sid = create_session((int) $u['id']);
    // The app sends the token as Bearer; a cookie in its native jar would win over it (read_session_id).
    if (($b['platform'] ?? '') !== 'mobile') set_session_cookie($sid);
    json_out(['ok' => true, 'token' => $sid]);
}
if ($route === '/auth/verify' && $method === 'GET') {
    $ok = verify_email_token($_GET['token'] ?? '');
    header('Location: ' . rtrim($g['site_origin'], '/') . ($g['app_path'] ?? '') . '/?verified=' . ($ok ? '1' : '0'));
    exit;
}
if ($route === '/auth/logout' && $method === 'POST') {
    $sid = read_session_id();
    if ($sid) db()->prepare('DELETE FROM ' . tbl('sessions') . ' WHERE id = ?')->execute([$sid]);
    setcookie(SESSION_COOKIE, '', ['expires' => time() - 1, 'path' => '/']);
    json_out(['ok' => true]);
}
// Delete the signed-in demo account (app: e-mail registration needs an in-app way out).
if ($route === '/me' && $method === 'DELETE') {
    $u = require_auth();
    if (empty($u['is_demo'])) json_err('not_demo', 400);
    delete_demo_account((int) $u['id']);
    setcookie(SESSION_COOKIE, '', ['expires' => time() - 1, 'path' => '/']);
    json_out(['ok' => true]);
}
if ($route === '/health') json_out(['ok' => true, 'demoMode' => demo_mode()]);

// ── Cross-guild figures for external displays (desklets, dashboards) ────────
// GET /stats — how many guilds are on Raidex, their member counts and each
// guild's M+ king. No session: the caller identifies itself with a token, one
// generated under Profil → Statistik-Tokens or the static 'stats_token' from
// the configuration. Until the first one exists the route does not either.
if ($route === '/stats' && $method === 'GET') {
    if (!stats_endpoint_open()) json_err('not_found: GET /stats', 404);
    // Apache hands Authorization through as REDIRECT_HTTP_AUTHORIZATION once a
    // rewrite has run; nginx/PHP-FPM uses the plain name. Accept both.
    $auth = trim($_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
    $sent = preg_match('/^Bearer\s+(.+)$/i', $auth, $am) ? trim($am[1]) : (string) ($_GET['token'] ?? '');
    if (!stats_token_valid($sent)) json_err('not_allowed', 403);
    json_out(guild_stats());
}

// The same figures, for the operator's own eyes rather than for a machine: the
// Gilden view is where a desklet's "... n more" line lands, and asking its
// reader to carry a token to their own app would be absurd. Session-gated, so
// it is unaffected by whether the token endpoint above is open at all.
if ($route === '/stats/guilds' && $method === 'GET') {
    require_superadmin();
    json_out(guild_stats(true));
}
if ($route === '/stats/tokens' && $method === 'GET') {
    require_superadmin();
    json_out(['tokens' => stats_tokens(), 'configured' => (string) (cfg()['stats_token'] ?? '') !== '']);
}
if ($route === '/stats/tokens' && $method === 'POST') {
    $u = require_superadmin();
    $label = trim((string) (body()['label'] ?? ''));
    if ($label === '') json_err('label_required');
    if (mb_strlen($label) > 120) $label = mb_substr($label, 0, 120);
    // The plain token travels in this one response and is never stored, so a
    // caller that loses it has to generate another one.
    json_out(create_stats_token($label, (int) $u['id']));
}
if (match_route('/stats/tokens/{id}', $route, $m) && $method === 'DELETE') {
    require_superadmin();
    if (!delete_stats_token((int) $m[0])) json_err('not_found', 404);
    json_out(['ok' => true]);
}

// ── /me ─────────────────────────────────────────────────────────────────────
if ($route === '/me' && $method === 'GET') {
    $u = current_user();
    if (!$u) json_out(['user' => null, 'demoMode' => demo_mode(), 'product' => $g['product_name'] ?? 'Raidex']);

    // Demo convenience: auto-pick a character so the guild context is populated.
    if (demo_mode() && empty($u['active_char_id'])) {
        $chars = get_account_characters(null);
        if ($chars) {
            db()->prepare('UPDATE ' . tbl('users') . ' SET active_char_id=? WHERE id=?')->execute([$chars[0]['id'], $u['id']]);
            $u['active_char_id'] = $chars[0]['id'];
        }
    }

    $active = null;
    if (!empty($u['active_char_id'])) {
        [$rs, $nm] = explode(':', $u['active_char_id']);
        $active = get_character_detail($rs, $nm, $u['access_token'] ?? null);
    }
    // Keep the active guild in sync with the active character.
    $guild = current_guild($u);
    if ($active && (!$guild || $guild['name_slug'] !== ($active['guildNameSlug'] ?? null))) {
        $guild = set_active_guild_from_char($u, $active);
    }
    if ($guild) associate_user_guild((int) $u['id'], (int) $guild['id'], $active['name'] ?? null, $active['realmSlug'] ?? null);
    if ($guild) ensure_guild_crest($guild); // make the crest image available app-wide
    $isAdmin = is_guild_admin($u, $guild);
    json_emit([
        // isSuperadmin is not a guild role: it is the operator's BattleTag from
        // the configuration, and the only thing the UI hangs on it is the
        // statistics-token card.
        'user' => ['battletag' => $u['battletag'], 'isAdmin' => $isAdmin, 'isGM' => is_guild_gm($u, $guild),
            // The appointed role, not the permission: a GM may manage guides as
            // well, but reporting him as a Quartiermeister is simply wrong, and
            // the field is named "is…". Whether someone MAY edit guides already
            // rides on /guides/{instance} as canManage.
            'isQuartermaster' => is_quartermaster($u, $guild), 'isDemo' => !empty($u['is_demo']),
            'isSuperadmin' => is_admin($u['battletag'] ?? null),
            'locale' => normalize_locale($u['locale'] ?? null)],
        'activeCharacter' => $active,
        'activeGuild' => $guild ? guild_public($guild) : null,
        'guilds' => user_guilds((int) $u['id']),
        // Whether a main has been PICKED, which is not the same as whether it
        // resolved: get_character_detail() can come back empty on a Blizzard
        // hiccup, and the clients gate their onboarding on this flag so such a
        // user keeps their stored guild instead of being sent back to pick one.
        'needsMain' => empty($u['active_char_id']),
        'demoMode' => demo_mode(),
        'product' => $g['product_name'] ?? 'Raidex',
    ]);
    // First visit → scan the whole guild in the background (non-blocking).
    // Scan darf auch der globale Superadmin anstoßen (Betriebsfunktion ohne UI-Rolle).
    //
    // The FIRST scan may additionally be triggered by any member. That is not
    // generosity, it breaks a deadlock: is_guild_admin() reads the character's
    // rank out of the very table a scan fills, so a guild whose GM and raidleads
    // never log in stays empty for everybody, forever. The guild comes from the
    // visitor's own active character, so it is never a stranger's guild, and
    // guild_needs_scan() + try_start_scan() still cap this at one run per guild
    // per day.
    $firstScan = $guild && (int) ($guild['last_scan_at'] ?? 0) === 0;
    if (!demo_mode() && $guild && ($isAdmin || $firstScan || is_admin($u['battletag'] ?? null)) && guild_needs_scan($guild) && try_start_scan((int) $guild['id'])) {
        if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
        @set_time_limit(0);
        try { run_guild_scan((int) $guild['id']); }
        catch (Throwable $e) { db()->prepare('UPDATE ' . tbl('guilds') . ' SET scanning=0 WHERE id=?')->execute([$guild['id']]); }
    }
    exit;
}

// Date/time locale. Stored per user because no client can read the device's
// format settings: a browser only exposes its own UI language, so a host with
// LANG=en_US but LC_TIME=de_DE still reports en-US and would render 9/3/2026.
if ($route === '/me/locale' && $method === 'POST') {
    $u = require_auth();
    $locale = normalize_locale(body()['locale'] ?? null);
    db()->prepare('UPDATE ' . tbl('users') . ' SET locale = ? WHERE id = ?')->execute([$locale, $u['id']]);
    json_out(['ok' => true, 'locale' => $locale]);
}

// ── characters ───────────────────────────────────────────────────────────────
if ($route === '/characters' && $method === 'GET') {
    $u = require_auth();
    json_out(account_characters($u));
}
// Reload budget: status (GET) + consume one slot (POST). 4 per rolling 24 h.
if ($route === '/characters/reload-status' && $method === 'GET') {
    $u = require_auth();
    json_out(reload_status((int) $u['id']));
}
if ($route === '/characters/reload' && $method === 'POST') {
    $u = require_auth();
    $s = reload_status((int) $u['id']);
    if ($s['remaining'] <= 0) json_out(['ok' => false] + $s, 429);
    // Fetch BEFORE booking the slot: a reload that never reached Blizzard must
    // not cost the user six hours of waiting for a list it could not deliver.
    $chars = account_characters($u);
    db()->prepare('INSERT INTO ' . tbl('reloads') . ' (user_id, at) VALUES (?, ?)')->execute([$u['id'], now_ms()]);
    // Frisch laden + Gilden-Discovery über den ganzen Account (ownership-sicher,
    // weil die Liste vom eigenen OAuth-Token stammt). Füllt den Gilden-Picker.
    foreach ($chars as $c) {
        if ((int) ($c['level'] ?? 0) < 10 || empty($c['realmSlug'])) continue;
        $d = get_character_detail($c['realmSlug'], $c['name'], $u['access_token'] ?? null, (int) ($c['level'] ?? 0) >= 70);
        if ($d && !empty($d['guildNameSlug'])) {
            $gg = ensure_guild(cfg()['bnet_region'], $d['guildRealmSlug'], $d['guildNameSlug'], $d['guild'] ?? $d['guildNameSlug'], $d['guildRealmName'] ?? null, $d['guildFaction'] ?? null);
            if ($gg) associate_user_guild((int) $u['id'], (int) $gg['id'], $d['name'], $d['realmSlug'] ?? null);
        }
    }
    json_out(['ok' => true] + reload_status((int) $u['id']));
}
if (match_route('/characters/{realm}/{name}', $route, $m) && $method === 'GET') {
    $u = require_auth();
    $force = !empty($_GET['refresh']);
    $d = get_character_detail(rawurldecode($m[0]), rawurldecode($m[1]), $u['access_token'] ?? null, $force);
    if (!$d) json_err('not_found', 404);
    // On a forced reload, also refresh this character's scanned roster row(s).
    if ($force && !empty($d['name'])) {
        db()->prepare('UPDATE ' . tbl('characters') . ' SET class_id=?, level=?, spec=?, spec_id=?, race=?, race_id=?, faction=?, item_level=?, mythic_rating=?, mythic_rating_color=?, achievement_points=?, avatar=?, title=?, updated_at=?
            WHERE realm_slug=? AND name_lower=?')->execute([
            $d['classId'] ?? null, $d['level'] ?? null, $d['specName'] ?? null, $d['specId'] ?? null, $d['raceName'] ?? null, $d['raceId'] ?? null, $d['faction'] ?? null,
            $d['itemLevel'] ?? null, $d['mythicRating'] ?? null, $d['mythicRatingColor'] ?? null, $d['achievementPoints'] ?? null,
            $d['images']['avatar'] ?? null, $d['title'] ?? null, now_ms(),
            mb_strtolower($d['realmSlug'] ?? $m[0]), mb_strtolower($d['name']),
        ]);
    }
    // Gilden-Discovery läuft jetzt beim Charakter-Reload (ownership-geprüft) —
    // hier nicht mehr, sonst landen Gilden fremder Roster-Charaktere im Picker.
    $d['classIcon'] = class_icon_url($d['classId'] ?? null);   // Blizzard-Media, gecacht
    $d['specIcon'] = spec_icon_url($d['specId'] ?? null);
    json_out($d);
}

// All raids across every expansion (for the raid-form dropdowns).
if ($route === '/wow/raids' && $method === 'GET') {
    require_auth();
    json_out(get_raid_instances());
}

// All dungeons across every expansion (for the dungeon toggle in the form).
if ($route === '/wow/dungeons' && $method === 'GET') {
    require_auth();
    json_out(get_dungeon_instances());
}

// Guilds the current user belongs to (multi-guild picker).
if ($route === '/guilds' && $method === 'GET') {
    $u = require_auth();
    json_out([
        'guilds' => user_guilds((int) $u['id']),
        'activeGuildId' => $u['active_guild_id'] ? (int) $u['active_guild_id'] : null,
    ]);
}
// Switch active guild = switch to the user's character in that guild (keeps char↔guild consistent).
if ($route === '/guilds/select' && $method === 'POST') {
    $u = require_auth();
    $gid = (int) (body()['guildId'] ?? 0);
    $chk = db()->prepare('SELECT char_name, char_realm FROM ' . tbl('user_guilds') . ' WHERE user_id=? AND guild_id=?');
    $chk->execute([$u['id'], $gid]);
    $row = $chk->fetch();
    if (!$row) json_err('not_member', 403);
    $updates = ['active_guild_id' => $gid];
    if (!empty($row['char_name']) && !empty($row['char_realm'])) {
        $updates['active_char_id'] = mb_strtolower($row['char_realm']) . ':' . mb_strtolower($row['char_name']);
    }
    $set = implode(', ', array_map(fn($k) => "$k = :$k", array_keys($updates)));
    $st = db()->prepare('UPDATE ' . tbl('users') . " SET $set WHERE id = :id");
    $st->execute($updates + ['id' => $u['id']]);
    $g = db()->prepare('SELECT * FROM ' . tbl('guilds') . ' WHERE id=?'); $g->execute([$gid]);
    json_out(['ok' => true, 'activeGuild' => guild_public($g->fetch())]);
}
if ($route === '/characters/select' && $method === 'POST') {
    $u = require_auth();
    $id = body()['id'] ?? '';
    if (!$id || !str_contains($id, ':')) json_err('bad_id');
    db()->prepare('UPDATE ' . tbl('users') . ' SET active_char_id = ? WHERE id = ?')->execute([$id, $u['id']]);
    [$rs, $nm] = explode(':', $id, 2);
    $detail = get_character_detail($rs, $nm, $u['access_token'] ?? null);
    $u['active_char_id'] = $id;
    $guild = set_active_guild_from_char($u, $detail);
    json_out(['ok' => true, 'activeCharId' => $id, 'activeGuild' => $guild ? guild_public($guild) : null]);
}

// ── guild roster (active guild) ───────────────────────────────────────────────
if ($route === '/guild/roster' && $method === 'GET') {
    $u = require_auth();
    $guild = current_guild($u);
    if (!$guild) json_out(['guild' => null, 'members' => []]);
    ensure_guild_crest($guild); // one-time fill of the crest emblem image
    // Full scanned roster from the DB; before the first scan, live top-40 fallback.
    $members = db_roster((int) $guild['id']);
    if (!$members) $members = get_guild_roster($guild['region'], $guild['realm_slug'], $guild['name_slug']);
    // Flag GM + appointed raidleads + Quartiermeister so the roster can badge them.
    $rlSet = guild_raidlead_keys((int) $guild['id']);
    $qmSet = quartermaster_keys((int) $guild['id']);
    // For the global admin only: which characters belong to a real Battle.net app-user.
    $isGlobalAdmin = is_admin($u['battletag'] ?? null);
    $appChars = [];
    if ($isGlobalAdmin) {
        $st = db()->prepare('SELECT ug.char_name, ug.char_realm FROM ' . tbl('user_guilds') . ' ug
            JOIN ' . tbl('users') . ' us ON us.id = ug.user_id
            WHERE ug.guild_id = ? AND us.is_demo = 0 AND us.bnet_sub IS NOT NULL');
        $st->execute([$guild['id']]);
        foreach ($st->fetchAll() as $r) {
            if (!empty($r['char_name']) && !empty($r['char_realm'])) {
                $appChars[strtolower($r['char_realm']) . ':' . mb_strtolower($r['char_name'])] = true;
            }
        }
    }
    foreach ($members as &$m) {
        $isGM = isset($m['rank']) && (int) $m['rank'] === 0;
        $m['isGM'] = $isGM;
        $m['isRaidlead'] = $isGM || isset($rlSet[$m['id']]);
        $m['isQuartermaster'] = isset($qmSet[$m['id']]);
        // Legacy alias: shipped app versions still read isGuideManager. Drop it
        // once no released client does.
        $m['isGuideManager'] = $m['isQuartermaster'];
        if ($isGlobalAdmin) $m['hasApp'] = isset($appChars[$m['id']]);
    }
    unset($m);
    json_out([
        'guild' => guild_public($guild),
        'members' => $members,
        'canManageRaidleads' => is_guild_gm($u, $guild),
        'canManageQuartermasters' => is_guild_admin($u, $guild),
        'canManageGuideAssistants' => is_guild_admin($u, $guild), // legacy alias, see above
        'canSeeAppUsers' => $isGlobalAdmin,
    ]);
}
// Appoint / revoke a raidlead (GM only).
if ($route === '/guild/raidleads' && $method === 'POST') {
    $u = require_auth();
    $guild = current_guild($u);
    if (!$guild) json_err('no_active_guild', 400);
    if (!is_guild_gm($u, $guild)) json_err('not_gm', 403);
    $b = body();
    $realm = strtolower(rawurldecode($b['realm'] ?? ''));
    $name = trim($b['name'] ?? '');
    if (!$realm || $name === '') json_err('realm_and_name_required');
    $on = !array_key_exists('on', $b) || !empty($b['on']);
    if ($on) {
        db()->prepare('INSERT INTO ' . tbl('raidleads') . ' (guild_id, realm_slug, name_lower, display_name, appointed_by, appointed_at)
            VALUES (?,?,?,?,?,?) ON CONFLICT (guild_id, realm_slug, name_lower) DO NOTHING')
            ->execute([$guild['id'], $realm, mb_strtolower($name), $name, $u['id'], now_ms()]);
    } else {
        db()->prepare('DELETE FROM ' . tbl('raidleads') . ' WHERE guild_id=? AND realm_slug=? AND name_lower=?')
            ->execute([$guild['id'], $realm, mb_strtolower($name)]);
    }
    json_out(['ok' => true, 'on' => $on]);
}
// ── Discord-Webhook der Gilde (GM) ────────────────────────────────────────────
if ($route === '/guild/discord' && $method === 'GET') {
    $u = require_auth();
    $guild = current_guild($u);
    if (!$guild) json_err('no_active_guild', 400);
    if (!is_guild_gm($u, $guild)) json_err('not_gm', 403);
    $st = db()->prepare('SELECT discord_webhook_url FROM ' . tbl('guilds') . ' WHERE id = ?');
    $st->execute([$guild['id']]);
    json_out(['webhookUrl' => (string) ($st->fetchColumn() ?: '')]);
}
if ($route === '/guild/discord' && $method === 'POST') {
    $u = require_auth();
    $guild = current_guild($u);
    if (!$guild) json_err('no_active_guild', 400);
    if (!is_guild_gm($u, $guild)) json_err('not_gm', 403);
    $url = trim((string) (body()['webhookUrl'] ?? ''));
    if ($url !== '' && !discord_valid_webhook($url)) json_err('invalid_webhook');
    db()->prepare('UPDATE ' . tbl('guilds') . ' SET discord_webhook_url = ? WHERE id = ?')
        ->execute([$url !== '' ? $url : null, $guild['id']]);
    json_out(['ok' => true, 'configured' => $url !== '']);
}
// ── Sprache der Gilde (GM): Discord, Raidkarte, Demo-Raids ───────────────────
if ($route === '/guild/lang' && $method === 'POST') {
    $u = require_auth();
    $guild = current_guild($u);
    if (!$guild) json_err('no_active_guild', 400);
    if (!is_guild_gm($u, $guild)) json_err('not_gm', 403);
    $lang = normalize_lang((string) (body()['lang'] ?? ''));
    if ($lang === null) json_err('invalid_lang');
    db()->prepare('UPDATE ' . tbl('guilds') . ' SET lang = ? WHERE id = ?')->execute([$lang, $guild['id']]);
    json_out(['ok' => true, 'lang' => $lang]);
}
if ($route === '/guild/discord/test' && $method === 'POST') {
    $u = require_auth();
    $guild = current_guild($u);
    if (!$guild) json_err('no_active_guild', 400);
    if (!is_guild_gm($u, $guild)) json_err('not_gm', 403);
    $webhook = discord_webhook_for_guild((int) $guild['id']);
    if (!$webhook) json_err('no_webhook');
    $lang = guild_lang((int) $guild['id']);
    $payload = json_encode(['embeds' => [[
        'title' => '✅ ' . tr('discord.testTitle', [], $lang),
        'description' => tr('discord.testBody', [], $lang),
        'color' => hexdec('22e6ff'),
        'footer' => ['text' => 'raidex.app'],
    ]]], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $res = discord_request('POST', $webhook, $payload);
    ($res['code'] >= 200 && $res['code'] < 300) ? json_out(['ok' => true]) : json_err('discord_http_' . $res['code'], 502);
}
// Manual re-scan (raidlead) — runs the full guild scan in the background.
if ($route === '/guild/scan' && $method === 'POST') {
    $u = require_auth();
    $guild = require_guild_admin($u);
    if (try_start_scan((int) $guild['id'])) {
        json_emit(['ok' => true, 'started' => true]);
        if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
        @set_time_limit(0);
        try { run_guild_scan((int) $guild['id']); }
        catch (Throwable $e) { db()->prepare('UPDATE ' . tbl('guilds') . ' SET scanning=0 WHERE id=?')->execute([$guild['id']]); }
        exit;
    }
    json_out(['ok' => true, 'started' => false, 'reason' => 'already_scanning_or_recent']);
}

// Operator re-scan of ANY guild, by id - the button in the Gilden view. The
// route above scans the caller's own guild and needs a rank inside it; this one
// needs no membership at all, which is the whole point: the operator has to be
// able to fill a guild nobody has opened without waiting for the nightly cron.
// Like the route above it skips the daily TTL and only refuses an overlap.
if (match_route('/guilds/{id}/scan', $route, $m) && $method === 'POST') {
    require_superadmin();
    $st = db()->prepare('SELECT * FROM ' . tbl('guilds') . ' WHERE id=?');
    $st->execute([(int) $m[0]]);
    $guild = $st->fetch();
    if (!$guild) json_err('not_found', 404);
    // The demo guild's members are invented; a scan would ask Blizzard about a
    // realm and a name that do not exist there.
    if (is_demo_guild($guild)) json_err('demo_guild', 400);
    if (!try_start_scan((int) $guild['id'])) {
        json_out(['ok' => true, 'started' => false, 'reason' => 'already_scanning']);
    }
    json_emit(['ok' => true, 'started' => true]);
    if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
    @set_time_limit(0);
    try { run_guild_scan((int) $guild['id']); }
    catch (Throwable $e) { db()->prepare('UPDATE ' . tbl('guilds') . ' SET scanning=0 WHERE id=?')->execute([$guild['id']]); }
    exit;
}

// ── raids (scoped to active guild) ────────────────────────────────────────────
function raid_with_signups(array $raid, $userId, bool $canAdmin = false): array {
    $st = db()->prepare('SELECT s.id, s.user_id, s.char_name, s.char_realm, s.char_class, s.role, s.status, s.note, s.is_alt, u.battletag
        FROM ' . tbl('signups') . ' s LEFT JOIN ' . tbl('users') . ' u ON u.id = s.user_id
        WHERE s.raid_id = ? ORDER BY s.created_at');
    $st->execute([$raid['id']]);
    $rows = $st->fetchAll();

    // Main character per user (for labelling the bench tree).
    $mainNameByUser = [];
    foreach ($rows as $r) if (!$r['is_alt']) $mainNameByUser[(int) $r['user_id']] = $r['char_name'];

    $counts = ['tank' => 0, 'healer' => 0, 'dps' => 0];
    $roster = []; $benchByUser = []; $myMain = null; $myAlts = [];
    foreach ($rows as $r) {
        $uid = (int) $r['user_id'];
        $item = [
            'id' => (int) $r['id'], 'userId' => $uid, 'name' => $r['char_name'], 'realm' => $r['char_realm'],
            'className' => $r['char_class'], 'role' => $r['role'], 'status' => $r['status'], 'note' => $r['note'],
            'isAlt' => !empty($r['is_alt']), 'mine' => $uid === (int) $userId,
        ];
        if (empty($r['is_alt'])) {
            $roster[] = $item;
            if ($r['status'] !== 'absent' && isset($counts[$r['role']])) $counts[$r['role']]++;
            if ($item['mine']) $myMain = $item;
        } else {
            if (!isset($benchByUser[$uid])) {
                // BattleTag-Fallback nur für den Nutzer selbst oder den Superadmin.
                static $superView = null;
                if ($superView === null) { $cu = current_user(); $superView = is_admin($cu['battletag'] ?? ''); }
                $fallback = ($uid === (int) $userId || $superView) ? ($r['battletag'] ?? '—') : '—';
                $benchByUser[$uid] = ['userId' => $uid, 'mainName' => $mainNameByUser[$uid] ?? $fallback, 'alts' => []];
            }
            $benchByUser[$uid]['alts'][] = $item;
            if ($item['mine']) $myAlts[] = $item;
        }
    }
    // Aufstellung: tanks & healers first, then DD, each alphabetical.
    $ord = ['tank' => 0, 'healer' => 1, 'dps' => 2];
    $roleSort = fn($a, $b) => (($ord[$a['role']] ?? 9) <=> ($ord[$b['role']] ?? 9)) ?: strcasecmp($a['name'], $b['name']);
    usort($roster, $roleSort);
    foreach ($benchByUser as &$g) usort($g['alts'], $roleSort);
    unset($g);
    $bench = array_values($benchByUser);
    usort($bench, fn($a, $b) => strcasecmp($a['mainName'], $b['mainName']));

    $raid['roster'] = $roster;              // signed-up mains
    $raid['bench'] = $bench;                 // Ersatzbank: [{userId, mainName, alts:[…]}]
    $raid['signups'] = $roster;              // legacy alias (mains)
    $raid['counts'] = $counts;
    $raid['mySignup'] = $myMain;
    $raid['myAlts'] = $myAlts;
    $raid['createdByName'] = $raid['created_by_name'] ?? null;
    $raid['createdByLead'] = !empty($raid['created_by_is_lead']);
    $raid['createdByGM'] = !empty($raid['created_by_is_gm']);
    $raid['createdByQM'] = !empty($raid['created_by_is_qm']);
    $raid['canManage'] = $canAdmin || ((int) ($raid['created_by'] ?? 0) === (int) $userId);
    $raid['shareToken'] = raid_share_token($raid);
    // Ältere Raids ohne gespeichertes Bild: Tile aus dem Instanznamen nachziehen.
    if (empty($raid['image']) && !empty($raid['instance'])) $raid['image'] = raid_tile_for_name($raid['instance']);
    return $raid;
}

// Stabiler, unratbarer öffentlicher Share-Token — beim ersten Bedarf erzeugt.
function raid_share_token(array $raid): string {
    if (!empty($raid['share_token'])) return $raid['share_token'];
    $tok = bin2hex(random_bytes(8)); // 16 Hex-Zeichen, 64 Bit
    db()->prepare('UPDATE ' . tbl('raids') . ' SET share_token = ? WHERE id = ?')->execute([$tok, (int) $raid['id']]);
    return $tok;
}

if ($route === '/raids' && $method === 'GET') {
    $u = require_auth();
    $guild = current_guild($u);
    if (!$guild) json_out([]);
    $canAdmin = is_guild_admin($u, $guild);
    // A raid counts as past once it has *ended*, not once it has started — a
    // raid in progress is still the one people are looking for.
    // Upcoming ascending (the next raid first, it is the one that matters),
    // past descending (the most recent one first).
    $past = ($_GET['scope'] ?? 'upcoming') === 'past';
    $sql = 'SELECT * FROM ' . tbl('raids') . ' WHERE guild_id = ? AND starts_at + duration_min * 60000 '
         . ($past ? '<  ? ORDER BY starts_at DESC' : '>= ? ORDER BY starts_at ASC');
    $st = db()->prepare($sql);
    $st->execute([$guild['id'], now_ms()]);
    json_out(array_map(fn($r) => raid_with_signups($r, $u['id'], $canAdmin), $st->fetchAll()));
}
if ($route === '/raids' && $method === 'POST') {
    // Every guild member may create raids — the card shows whether the creator is a raidlead.
    $u = require_auth();
    $guild = current_guild($u);
    if (!$guild) json_err('no_active_guild', 400);
    $b = body();
    if (empty($b['title']) || empty($b['starts_at'])) json_err('title_and_start_required');
    $isLead = is_guild_admin($u, $guild);
    $isGM = is_guild_gm($u, $guild);
    // The role, not the permission — can_manage_guides() would also be true for
    // the GM and every raidlead, which the "&& !$isLead" below then had to
    // subtract again. Same three stored flags, stated directly.
    $isQM = is_quartermaster($u, $guild);
    $creatorName = char_display_name($u['active_char_id'] ?? null); // never the BattleTag
    // Blizzard-Tile der gewählten Instanz automatisch übernehmen, sofern kein Bild mitgegeben.
    $image = $b['image'] ?? raid_tile_for_name($b['instance'] ?? null);
    $st = db()->prepare('INSERT INTO ' . tbl('raids') . ' (guild_id, title, instance, difficulty, image, starts_at, duration_min, description, max_size, min_size, created_by, created_by_name, created_by_is_lead, created_by_is_gm, created_by_is_qm, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *');
    $st->execute([$guild['id'], $b['title'], $b['instance'] ?? null, $b['difficulty'] ?? null, $image,
        (int) $b['starts_at'], (int) ($b['duration_min'] ?? 120), $b['description'] ?? null,
        max(0, (int) ($b['max_size'] ?? 0)), max(1, (int) ($b['min_size'] ?? 10)),
        $u['id'], $creatorName, ($isLead && !$isGM) ? 1 : 0, $isGM ? 1 : 0, ($isQM && !$isLead) ? 1 : 0, now_ms()]);
    $newRaid = raid_with_signups($st->fetch(), $u['id'], $isLead);
    respond_and_sync_discord($newRaid, (int) $newRaid['id'], 201);
}
// Share-Link erzeugen: bei gleichem Inhalt denselben Key wiederverwenden, bei geändertem
// Inhalt (content_sig) einen neuen minten → Discord unfurlt nach Änderungen frisch.
if (match_route('/raids/{id}/share', $route, $m) && $method === 'POST') {
    $u = require_auth();
    $guild = current_guild($u);
    if (!$guild) json_err('no_active_guild', 400);
    $rid = (int) $m[0];
    $r = db()->prepare('SELECT * FROM ' . tbl('raids') . ' WHERE id = ? AND guild_id = ?');
    $r->execute([$rid, $guild['id']]);
    $raid = $r->fetch();
    if (!$raid) json_err('not_found', 404);
    require_once __DIR__ . '/raidcard.php';
    $sig = raidcard_sig(raid_with_signups($raid, (int) $u['id'], false));
    $ex = db()->prepare('SELECT token FROM ' . tbl('raid_shares') . ' WHERE raid_id = ? AND content_sig = ? ORDER BY created_at DESC LIMIT 1');
    $ex->execute([$rid, $sig]);
    $token = $ex->fetchColumn();
    if (!$token) {
        $token = bin2hex(random_bytes(8));
        db()->prepare('INSERT INTO ' . tbl('raid_shares') . ' (token, raid_id, content_sig, created_at) VALUES (?,?,?,?)')
            ->execute([$token, $rid, $sig, now_ms()]);
    }
    json_out(['token' => $token]);
}
if (match_route('/raids/{id}', $route, $m) && $method === 'PATCH') {
    $u = require_auth();
    [$guild, $canAdmin] = require_raid_manage($u, (int) $m[0]);
    $id = (int) $m[0];
    $b = body();
    // Instanz gewechselt ohne explizites Bild → passendes Blizzard-Tile nachziehen.
    if (array_key_exists('instance', $b) && !array_key_exists('image', $b)) $b['image'] = raid_tile_for_name($b['instance'] ?? null);
    if (array_key_exists('min_size', $b)) $b['min_size'] = max(1, (int) $b['min_size']); // >0
    if (array_key_exists('max_size', $b)) $b['max_size'] = max(0, (int) $b['max_size']); // 0 = kein Limit
    $fields = ['title', 'instance', 'difficulty', 'image', 'starts_at', 'duration_min', 'description', 'max_size', 'min_size'];
    $set = []; $vals = [];
    foreach ($fields as $f) if (array_key_exists($f, $b)) { $set[] = "$f = ?"; $vals[] = $b[$f]; }
    if ($set) { $vals[] = $id; $vals[] = $guild['id']; db()->prepare('UPDATE ' . tbl('raids') . ' SET ' . implode(', ', $set) . ' WHERE id = ? AND guild_id = ?')->execute($vals); }
    $r = db()->prepare('SELECT * FROM ' . tbl('raids') . ' WHERE id = ? AND guild_id = ?');
    $r->execute([$id, $guild['id']]);
    respond_and_sync_discord(raid_with_signups($r->fetch(), $u['id'], $canAdmin), $id);
}
if (match_route('/raids/{id}', $route, $m) && $method === 'DELETE') {
    $u = require_auth();
    [$guild] = require_raid_manage($u, (int) $m[0]);
    $rid = (int) $m[0];
    // Vor dem Löschen alle Angemeldeten benachrichtigen — eine Push pro BattleTag.
    // Volle Zeile merken (für die Discord-„abgesagt"-Editierung nach dem Löschen).
    $rt = db()->prepare('SELECT * FROM ' . tbl('raids') . ' WHERE id=?');
    $rt->execute([$rid]);
    $raidRow = $rt->fetch() ?: [];
    $rtitle = (string) ($raidRow['title'] ?? 'Raid');
    $su = db()->prepare('SELECT DISTINCT s.user_id, u.battletag FROM ' . tbl('signups') . ' s JOIN ' . tbl('users') . ' u ON u.id = s.user_id WHERE s.raid_id = ?');
    $su->execute([$rid]);
    $seen = [];
    foreach ($su->fetchAll() as $row) {
        $bt = (string) ($row['battletag'] ?? '');
        if ($bt !== '' && isset($seen[$bt])) continue;
        $seen[$bt] = true;
        push_to_user((int) $row['user_id'], 'raidCancelled', ['title' => $rtitle], ['type' => 'raid_cancelled', 'raidId' => $rid]);
    }
    db()->prepare('DELETE FROM ' . tbl('signups') . ' WHERE raid_id = ?')->execute([$rid]);
    db()->prepare('DELETE FROM ' . tbl('raids') . ' WHERE id = ? AND guild_id = ?')->execute([$rid, $guild['id']]);
    json_emit(['ok' => true]);
    if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
    if ($raidRow) discord_cancel_message($raidRow);
    exit;
}
// A raid of the caller's active guild, or 404 - the same answer as for a raid
// that does not exist, so a raid id of another guild gives nothing away.
// Every signup route goes through here. Before, they took the raid id from the
// path as it came: anyone logged in could sign up to any guild's raid and read
// its roster, and a raidlead of any guild could clear signups there (#14).
function require_guild_raid(array $u, int $raidId): array {
    $guild = current_guild($u);
    if (!$guild) json_err('no_active_guild', 400);
    $st = db()->prepare('SELECT * FROM ' . tbl('raids') . ' WHERE id = ? AND guild_id = ?');
    $st->execute([$raidId, $guild['id']]);
    $raid = $st->fetch();
    if (!$raid) json_err('not_found', 404);
    return [$guild, $raid];
}
// The raid as it stands after a signup change, for the caller - or {ok} if it went meanwhile.
function signup_answer(array $u, array $guild, int $raidId, bool $canAdmin): void {
    $r = db()->prepare('SELECT * FROM ' . tbl('raids') . ' WHERE id = ? AND guild_id = ?');
    $r->execute([$raidId, $guild['id']]);
    $row = $r->fetch();
    $row ? respond_and_sync_discord(raid_with_signups($row, $u['id'], $canAdmin), $raidId) : json_out(['ok' => true]);
}
if (match_route('/raids/{id}/signup', $route, $m) && $method === 'PUT') {
    $u = require_auth();
    $id = (int) $m[0];
    [$guild] = require_guild_raid($u, $id);
    $b = body();
    $role = $b['role'] ?? '';
    if (!in_array($role, ['tank', 'healer', 'dps'], true)) json_err('bad_role');
    $status = $b['status'] ?? 'confirmed';
    // Only the three states the clients know; anything else would count as coming.
    if (!in_array($status, ['confirmed', 'tentative', 'absent'], true)) json_err('bad_status');
    $charId = $b['charId'] ?? ($u['active_char_id'] ?? null);
    if (!is_string($charId) || !str_contains($charId, ':')) json_err('char_required');
    [$charRealm, $nameLower] = explode(':', mb_strtolower(rawurldecode($charId)), 2);
    if ($charRealm === '' || $nameLower === '') json_err('char_required');
    $char = signup_character($u, $charRealm, $nameLower);
    $charName = $char['name'];
    // The class is shown, not trusted for anything; for an own character the
    // roster has not scanned, the one the client sends has to do.
    $charClass = $char['className'] ?? (is_string($b['charClass'] ?? null) ? mb_substr($b['charClass'], 0, 32) : null);
    $isAlt = !empty($b['isAlt']) ? 1 : 0;
    // A user has at most one main; signing a new main replaces the previous one.
    if (!$isAlt) {
        db()->prepare('DELETE FROM ' . tbl('signups') . ' WHERE raid_id=? AND user_id=? AND is_alt=0 AND NOT (char_name=? AND char_realm=?)')
            ->execute([$id, $u['id'], $charName, $charRealm]);
    }
    db()->prepare('INSERT INTO ' . tbl('signups') . ' (raid_id, user_id, char_name, char_realm, char_class, role, status, note, is_alt, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT (raid_id, user_id, char_name, char_realm) DO UPDATE SET
        char_class=EXCLUDED.char_class, role=EXCLUDED.role, status=EXCLUDED.status, note=EXCLUDED.note, is_alt=EXCLUDED.is_alt')
        ->execute([$id, $u['id'], $charName, $charRealm, $charClass, $role, $status, $b['note'] ?? null, $isAlt, now_ms()]);
    signup_answer($u, $guild, $id, is_guild_admin($u, $guild));
}
// The character a signup is for: it has to be on the caller's Battle.net
// account, and its name and class come from Raidex, never from the request
// (#15). The account's characters are the ones Raidex Keys' reports check,
// stored at each successful fetch - Blizzard's user token lives a day, a
// session a month, and signing up must not stop when the token ages out.
function signup_character(array $u, string $realmSlug, string $nameLower): array {
    $own = key_account_chars($u);
    if (!$own) {
        $tokenOk = demo_mode() || (!empty($u['access_token']) && (int) ($u['token_expires'] ?? 0) > now_ms());
        // Nothing stored and no way to ask: only a new login helps. With a
        // working token the account simply has no characters.
        json_err($tokenOk ? 'char_required' : 'bnet_reauth_required', $tokenOk ? 400 : 409);
    }
    if (!isset($own[realm_key($realmSlug) . ':' . $nameLower])) json_err('not_your_character', 403);
    // The roster knows how the game writes the name and which class it is.
    $st = db()->prepare('SELECT name, class_id FROM ' . tbl('characters') . ' WHERE realm_slug = ? AND name_lower = ? LIMIT 1');
    $st->execute([$realmSlug, $nameLower]);
    $row = $st->fetch();
    return [
        // The game capitalises the first letter of every name and nothing else.
        'name' => $row['name'] ?? mb_convert_case($nameLower, MB_CASE_TITLE, 'UTF-8'),
        'className' => $row ? (CLASS_MAP[(int) $row['class_id']][0] ?? null) : null,
    ];
}
// Remove one specific signup (main or alt). Owner or raid admin only.
if (match_route('/raids/{id}/signup/{signupId}', $route, $m) && $method === 'DELETE') {
    $u = require_auth();
    $id = (int) $m[0];
    $sid = (int) $m[1];
    [$guild] = require_guild_raid($u, $id);
    $canAdmin = is_guild_admin($u, $guild);
    $sql = 'DELETE FROM ' . tbl('signups') . ' WHERE id=? AND raid_id=?' . ($canAdmin ? '' : ' AND user_id=?');
    $args = $canAdmin ? [$sid, $id] : [$sid, $id, $u['id']];
    db()->prepare($sql)->execute($args);
    signup_answer($u, $guild, $id, $canAdmin);
}
if (match_route('/raids/{id}/signup', $route, $m) && $method === 'DELETE') {
    $u = require_auth();
    $id = (int) $m[0];
    [$guild] = require_guild_raid($u, $id);
    // Withdraw = remove the user's main signup (alts are removed individually).
    db()->prepare('DELETE FROM ' . tbl('signups') . ' WHERE raid_id = ? AND user_id = ? AND is_alt = 0')->execute([$id, $u['id']]);
    signup_answer($u, $guild, $id, is_guild_admin($u, $guild));
}

// ── dashboard + widgets (active guild) ────────────────────────────────────────
// Weekly lockout reset differs per region (day + local time, DST-aware).
//   EU : Wednesday 07:00 CET/CEST      US/OCE: Tuesday 08:00 PT      KR/TW: Wednesday 08:00 KST
function next_weekly_reset(string $region = 'eu'): int {
    $region = strtolower($region);
    if (in_array($region, ['us', 'oce', 'oc'], true)) {
        $tz = new DateTimeZone('America/Los_Angeles'); $dow = 2; $hour = 8;
    } elseif (in_array($region, ['kr', 'tw'], true)) {
        $tz = new DateTimeZone('Asia/Seoul'); $dow = 3; $hour = 8;
    } else {
        $tz = new DateTimeZone('Europe/Paris'); $dow = 3; $hour = 7; // EU
    }
    $now = new DateTime('now', $tz);
    $d = clone $now; $d->setTime($hour, 0, 0);
    $add = ($dow - (int) $d->format('N') + 7) % 7; // N: 1=Mon … 7=Sun
    if ($add === 0 && $now >= $d) $add = 7;
    $d->modify("+$add day");
    return $d->getTimestamp() * 1000;
}
// Weekly bonus event (Timewalking et al.). Blizzard exposes no event calendar,
// so this is COMPUTED from the fixed weekly rotation. Adjust BONUS_ANCHOR_MS if
// it drifts out of sync with the game (one row per patch, at most).
function current_bonus_event(string $region): array {
    $events = [
        ['icon' => '⏳', 'id' => 'timewalking'],
        ['icon' => '⚔️', 'id' => 'battleground'],
        ['icon' => '🐾', 'id' => 'petBattle'],
        ['icon' => '🗺️', 'id' => 'worldQuest'],
        ['icon' => '🏟️', 'id' => 'arena'],
        ['icon' => '🔑', 'id' => 'mythicDungeon'],
    ];
    $weekMs = 7 * 24 * 3600 * 1000;
    $periodStart = next_weekly_reset($region) - $weekMs;      // start of the current lockout week
    $anchor = 1751500800000;                                  // Wed 03 Jul 2025 — index 0 (Zeitwanderung)
    $n = count($events);
    $idx = (int) ((((int) floor(($periodStart - $anchor) / $weekMs)) % $n + $n) % $n);
    $ev = $events[$idx];
    return ['icon' => $ev['icon'], 'title' => tr("event.{$ev['id']}.title"), 'body' => tr("event.{$ev['id']}.body"), 'computed' => true];
}

// Auto-populated "Aktuelles" cards (live token price + computed weekly event).
function dashboard_events(string $region): array {
    $out = [];
    $tok = get_wow_token($region);
    if ($tok) {
        $de = request_lang() === 'de';
        $out[] = ['key' => 'token', 'icon' => '🪙', 'title' => tr('dashboard.token'),
            'body' => tr('dashboard.gold', ['amount' => number_format($tok['gold'], 0, $de ? ',' : '.', $de ? '.' : ',')]),
            'accent' => '#F5C451', 'computed' => false];
    }
    $ev = current_bonus_event($region);
    $out[] = ['key' => 'bonus', 'icon' => $ev['icon'], 'title' => tr('dashboard.weeklyEvent', ['title' => $ev['title']]),
        'body' => $ev['body'], 'accent' => '#22E6FF', 'computed' => true];
    return $out;
}

// Gespeichertes Layout/Sichtbarkeit der Systemkarten (Key 'sys:<eventkey>').
function system_card_layout(int $guildId): array {
    $st = db()->prepare('SELECT "key", sort, col, hidden FROM ' . tbl('widgets') . ' WHERE guild_id=? AND system=1');
    $st->execute([$guildId]);
    $map = [];
    foreach ($st->fetchAll() as $r) $map[preg_replace('/^sys:/', '', $r['key'])] = $r;
    return $map;
}
// Live-Systemkarten mit gespeichertem Layout/Sichtbarkeit anreichern. $withHidden=true
// behält ausgeblendete (für den Bearbeiten-Modus), sonst werden sie herausgefiltert.
function dashboard_events_laid_out(string $region, int $guildId, bool $withHidden): array {
    $lay = system_card_layout($guildId);
    $out = [];
    foreach (dashboard_events($region) as $i => $ev) {
        $l = $lay[$ev['key']] ?? null;
        $ev['sort'] = $l ? (int) $l['sort'] : (-1000 + $i);   // ohne Layout: standardmäßig oben
        $ev['col'] = $l ? (int) $l['col'] : 0;
        $ev['hidden'] = $l ? (bool) (int) $l['hidden'] : false;  // echtes JSON-Boolean für die App
        if (!$withHidden && $ev['hidden']) continue;
        $out[] = $ev;
    }
    return $out;
}

if ($route === '/dashboard' && $method === 'GET') {
    $u = require_auth();
    $guild = current_guild($u);
    $region = cfg()['bnet_region'] ?? 'eu';
    $withHidden = !empty($_GET['withHidden']);
    if (!$guild) json_out(['guild' => null, 'nextRaid' => null, 'weeklyResetAt' => next_weekly_reset($region), 'events' => dashboard_events($region), 'widgets' => []]);
    $st = db()->prepare('SELECT * FROM ' . tbl('raids') . ' WHERE guild_id = ? AND starts_at > ? ORDER BY starts_at ASC LIMIT 1');
    $st->execute([$guild['id'], now_ms()]);
    $next = $st->fetch();
    // Nur echte Themen-Karten (system=0); Systemkarten kommen live über 'events'.
    $w = db()->prepare('SELECT "key", title, body, icon, accent, sort, col, markdown, updated_at FROM ' . tbl('widgets') . ' WHERE guild_id = ? AND system = 0 ORDER BY sort, col, "key"');
    $w->execute([$guild['id']]);
    // Gescannte Charaktere + beste M+-Wertung (König) für die Statboxen.
    $gs = db()->prepare('SELECT COUNT(*) c, MAX(mythic_rating) mx FROM ' . tbl('characters') . ' WHERE guild_id=?');
    $gs->execute([$guild['id']]);
    $gsr = $gs->fetch(); $bestMplus = (int) ($gsr['mx'] ?? 0);
    $king = null;
    if ($bestMplus > 0) {
        $kq = db()->prepare('SELECT name, realm_slug, mythic_rating, mythic_rating_color FROM ' . tbl('characters') . ' WHERE guild_id=? AND mythic_rating=? ORDER BY name LIMIT 1');
        $kq->execute([$guild['id'], $bestMplus]);
        if ($kr = $kq->fetch()) $king = ['name' => $kr['name'], 'realm' => $kr['realm_slug'], 'rating' => (int) $kr['mythic_rating'], 'color' => $kr['mythic_rating_color']];
    }
    // Zahlen/Booleans typkorrekt für die App (PG liefert INT teils als String).
    $widgets = array_map(function ($r) {
        $r['sort'] = (int) $r['sort']; $r['col'] = (int) $r['col']; $r['markdown'] = (bool) (int) $r['markdown'];
        return $r;
    }, $w->fetchAll());
    json_out([
        'guild' => guild_public($guild),
        'nextRaid' => $next ? raid_with_signups($next, $u['id'], is_guild_admin($u, $guild)) : null,
        'weeklyResetAt' => next_weekly_reset($guild['region'] ?? $region),
        'events' => dashboard_events_laid_out($guild['region'] ?? $region, (int) $guild['id'], $withHidden),
        'widgets' => $widgets,
        'scannedChars' => (int) ($gsr['c'] ?? 0),
        'bestMplus' => $bestMplus,
        'mplusKing' => $king,
    ]);
}
if (match_route('/widgets/{key}', $route, $m) && $method === 'PUT') {
    $u = require_auth();
    $guild = require_content_manager($u);
    $b = body();
    if (empty($b['title'])) json_err('title_required');
    $sort = array_key_exists('sort', $b) ? (int) $b['sort'] : null;
    if ($sort === null) { // neue Themen hinten anstellen, bestehende Position behalten
        $st = db()->prepare('SELECT sort FROM ' . tbl('widgets') . ' WHERE guild_id=? AND "key"=?');
        $st->execute([$guild['id'], $m[0]]);
        $cur = $st->fetchColumn();
        if ($cur !== false) $sort = (int) $cur;
        else {
            $st = db()->prepare('SELECT COALESCE(MAX(sort),0)+1 FROM ' . tbl('widgets') . ' WHERE guild_id=?');
            $st->execute([$guild['id']]);
            $sort = (int) $st->fetchColumn();
        }
    }
    $md = !empty($b['markdown']) ? 1 : 0;
    db()->prepare('INSERT INTO ' . tbl('widgets') . ' (guild_id, "key", title, body, icon, accent, sort, markdown, updated_by, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT (guild_id, "key") DO UPDATE SET title=EXCLUDED.title, body=EXCLUDED.body, icon=EXCLUDED.icon, accent=EXCLUDED.accent, sort=EXCLUDED.sort, markdown=EXCLUDED.markdown, updated_by=EXCLUDED.updated_by, updated_at=EXCLUDED.updated_at')
        ->execute([$guild['id'], $m[0], $b['title'], $b['body'] ?? null, $b['icon'] ?? null, $b['accent'] ?? null, $sort, $md, $u['id'], now_ms()]);
    json_out(['ok' => true]);
}
if (match_route('/widgets/{key}', $route, $m) && $method === 'DELETE') {
    $u = require_auth();
    $guild = require_content_manager($u);
    db()->prepare('DELETE FROM ' . tbl('widgets') . ' WHERE guild_id = ? AND "key" = ?')->execute([$guild['id'], $m[0]]);
    json_out(['ok' => true]);
}
// Reihenfolge der "Aktuelles"-Themen: Array von keys in gewünschter Reihenfolge.
if ($route === '/widgets/reorder' && $method === 'POST') {
    $u = require_auth();
    $guild = require_content_manager($u);
    $keys = body()['keys'] ?? null;
    if (!is_array($keys) || !$keys) json_err('keys_required');
    $st = db()->prepare('UPDATE ' . tbl('widgets') . ' SET sort=? WHERE guild_id=? AND "key"=?');
    foreach (array_values($keys) as $i => $k) $st->execute([$i + 1, $guild['id'], (string) $k]);
    json_out(['ok' => true]);
}
// 2D-Layout der "Aktuelles"-Karten: [{key,row,col,sys}], sys=1 → Systemkarte (max 3 Spalten/Zeile).
if ($route === '/widgets/layout' && $method === 'POST') {
    $u = require_auth();
    $guild = require_content_manager($u);
    $items = body()['layout'] ?? null;
    if (!is_array($items)) json_err('layout_required');
    $topic = db()->prepare('UPDATE ' . tbl('widgets') . ' SET sort=?, col=? WHERE guild_id=? AND "key"=? AND system=0');
    $sys = db()->prepare('INSERT INTO ' . tbl('widgets') . ' (guild_id,"key",title,sort,col,system,updated_by,updated_at) VALUES (?,?,?,?,?,1,?,?)
        ON CONFLICT (guild_id,"key") DO UPDATE SET sort=EXCLUDED.sort,col=EXCLUDED.col,updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at');
    foreach ($items as $it) {
        $key = preg_replace('/[^a-z0-9_:-]/i', '', (string) ($it['key'] ?? ''));
        if ($key === '') continue;
        $row = (int) ($it['row'] ?? 0);
        $col = min(2, max(0, (int) ($it['col'] ?? 0)));
        if (!empty($it['sys'])) $sys->execute([$guild['id'], 'sys:' . $key, '', $row, $col, $u['id'], now_ms()]);
        else $topic->execute([$row, $col, $guild['id'], $key]);
    }
    json_out(['ok' => true]);
}
// Systemkarte aus-/einblenden (nicht löschbar) — Layout unter Key 'sys:<eventkey>'.
if ($route === '/widgets/system-visibility' && $method === 'POST') {
    $u = require_auth();
    $guild = require_content_manager($u);
    $b = body();
    $key = preg_replace('/[^a-z0-9_-]/i', '', $b['key'] ?? '');
    if ($key === '') json_err('key_required');
    db()->prepare('INSERT INTO ' . tbl('widgets') . ' (guild_id,"key",title,hidden,system,updated_by,updated_at) VALUES (?,?,?,?,1,?,?)
        ON CONFLICT (guild_id,"key") DO UPDATE SET hidden=EXCLUDED.hidden,updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at')
        ->execute([$guild['id'], 'sys:' . $key, '', !empty($b['hidden']) ? 1 : 0, $u['id'], now_ms()]);
    json_out(['ok' => true]);
}

// ── raid guides (per instance: global defaults + guild custom) ────────────────
if (match_route('/guides/{instance}', $route, $m) && $method === 'GET') {
    $u = require_auth();
    $guild = current_guild($u);
    $instance = rawurldecode($m[0]);
    $raidId = isset($_GET['raid_id']) ? (int) $_GET['raid_id'] : null;
    if (!$guild) json_out(['guides' => default_guides($instance), 'canManage' => false]);
    json_out(['guides' => guides_for_instance((int) $guild['id'], $instance, $raidId), 'canManage' => can_manage_guides($u, $guild)]);
}
if ($route === '/guild/guides' && $method === 'POST') {
    $u = require_auth();
    $guild = current_guild($u);
    if (!$guild) json_err('no_active_guild', 400);
    if (!can_manage_guides($u, $guild)) json_err('not_allowed', 403);
    $b = body();
    $instance = trim($b['instance'] ?? '');
    $url = trim($b['url'] ?? '');
    if ($instance === '' || !filter_var($url, FILTER_VALIDATE_URL)) json_err('instance_and_url_required');
    $site = in_array($b['site'] ?? '', ['method', 'wowhead', 'buffed', 'custom'], true) ? $b['site'] : 'custom';
    $lang = in_array($b['lang'] ?? '', ['de', 'en'], true) ? $b['lang'] : null;
    $title = trim($b['title'] ?? '') ?: 'Guide';
    $raidId = !empty($b['raid_id']) ? (int) $b['raid_id'] : null;
    if ($raidId) { // Termin muss zur Gilde gehören
        $st = db()->prepare('SELECT 1 FROM ' . tbl('raids') . ' WHERE id=? AND guild_id=?');
        $st->execute([$raidId, $guild['id']]);
        if (!$st->fetchColumn()) json_err('raid_not_found', 404);
    }
    $favicon = favicon_for_host(parse_url($url, PHP_URL_HOST) ?: null); // parsed + cached by hostname
    $st = db()->prepare('INSERT INTO ' . tbl('guides') . ' (guild_id, instance, site, lang, title, url, favicon, raid_id, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?) RETURNING id');
    $st->execute([$guild['id'], $instance, $site, $lang, $title, $url, $favicon, $raidId, $u['id'], now_ms()]);
    json_out(['ok' => true, 'id' => (int) $st->fetchColumn(), 'iconUrl' => $favicon], 201);
}
// Eigenen Guide bearbeiten (Titel/URL); bei neuer URL wird das Favicon neu aufgelöst.
if (match_route('/guild/guides/{id}', $route, $m) && $method === 'PUT') {
    $u = require_auth();
    $guild = require_content_manager($u);
    $b = body();
    $title = trim($b['title'] ?? '') ?: 'Guide';
    $url = trim($b['url'] ?? '');
    if (!filter_var($url, FILTER_VALIDATE_URL)) json_err('url_required');
    $favicon = favicon_for_host(parse_url($url, PHP_URL_HOST) ?: null);
    db()->prepare('UPDATE ' . tbl('guides') . ' SET title=?, url=?, favicon=? WHERE id=? AND guild_id=?')
        ->execute([$title, $url, $favicon, (int) $m[0], $guild['id']]);
    json_out(['ok' => true, 'iconUrl' => $favicon]);
}
if (match_route('/guild/guides/{id}', $route, $m) && $method === 'DELETE') {
    $u = require_auth();
    $guild = require_content_manager($u);
    db()->prepare('DELETE FROM ' . tbl('guides') . ' WHERE id=? AND guild_id=?')->execute([(int) $m[0], $guild['id']]);
    json_out(['ok' => true]);
}
// System-Guides (Wowhead/buffed/Method) je Instanz überschreiben: ausblenden,
// Titel/URL ersetzen oder mit reset=true wieder auf den Standard zurücksetzen.
if ($route === '/guild/guide-defaults' && $method === 'POST') {
    $u = require_auth();
    $guild = require_content_manager($u);
    $b = body();
    $instance = trim($b['instance'] ?? '');
    $defKey = trim($b['def_key'] ?? '');
    $known = array_column(default_guides($instance ?: 'x'), 'defKey');
    if ($instance === '' || !in_array($defKey, $known, true)) json_err('instance_and_def_key_required');
    if (!empty($b['reset'])) {
        db()->prepare('DELETE FROM ' . tbl('guide_defaults') . ' WHERE guild_id=? AND instance=? AND def_key=?')
            ->execute([$guild['id'], $instance, $defKey]);
        json_out(['ok' => true]);
    }
    $hidden = !empty($b['hidden']) ? 1 : 0;
    $title = trim($b['title'] ?? '') ?: null;
    $url = trim($b['url'] ?? '') ?: null;
    if ($url !== null && !filter_var($url, FILTER_VALIDATE_URL)) json_err('invalid_url');
    db()->prepare('INSERT INTO ' . tbl('guide_defaults') . ' (guild_id, instance, def_key, hidden, title, url, updated_by, updated_at)
        VALUES (?,?,?,?,?,?,?,?)
        ON CONFLICT (guild_id, instance, def_key) DO UPDATE SET hidden=EXCLUDED.hidden, title=EXCLUDED.title, url=EXCLUDED.url, updated_by=EXCLUDED.updated_by, updated_at=EXCLUDED.updated_at')
        ->execute([$guild['id'], $instance, $defKey, $hidden, $title, $url, $u['id'], now_ms()]);
    json_out(['ok' => true]);
}
// Appoint / revoke a Quartiermeister (GM or raidlead). The guide-managers path
// is what shipped app versions call; keep it until none of them are in use.
if (($route === '/guild/quartermasters' || $route === '/guild/guide-managers') && $method === 'POST') {
    $u = require_auth();
    $guild = current_guild($u);
    if (!$guild) json_err('no_active_guild', 400);
    if (!is_guild_admin($u, $guild)) json_err('not_allowed', 403);
    $b = body();
    $realm = strtolower(rawurldecode($b['realm'] ?? ''));
    $name = trim($b['name'] ?? '');
    if (!$realm || $name === '') json_err('realm_and_name_required');
    $on = !array_key_exists('on', $b) || !empty($b['on']);
    if ($on) {
        db()->prepare('INSERT INTO ' . tbl('quartermasters') . ' (guild_id, realm_slug, name_lower, display_name, appointed_by, appointed_at)
            VALUES (?,?,?,?,?,?) ON CONFLICT (guild_id, realm_slug, name_lower) DO NOTHING')
            ->execute([$guild['id'], $realm, mb_strtolower($name), $name, $u['id'], now_ms()]);
    } else {
        db()->prepare('DELETE FROM ' . tbl('quartermasters') . ' WHERE guild_id=? AND realm_slug=? AND name_lower=?')->execute([$guild['id'], $realm, mb_strtolower($name)]);
    }
    json_out(['ok' => true, 'on' => $on]);
}

// Register a device push token for the logged-in user.
if ($route === '/push/register' && $method === 'POST') {
    $u = require_auth();
    $b = body();
    $token = trim($b['token'] ?? '');
    $platform = in_array($b['platform'] ?? '', ['ios', 'android', 'web'], true) ? $b['platform'] : 'ios';
    if ($token === '') json_err('token_required');
    register_device_token((int) $u['id'], $token, $platform, normalize_lang($b['lang'] ?? null) ?? request_lang());
    json_out(['ok' => true]);
}
// VAPID public key for the web push subscription.
if ($route === '/push/vapid-public' && $method === 'GET') {
    json_out(['key' => vapid_cfg()['public']]);
}
// Admin-only: send a test push to your own devices.
if ($route === '/push/test' && $method === 'POST') {
    $u = require_auth();
    if (!is_admin($u['battletag'] ?? '')) json_err('not_allowed', 403);
    $n = push_to_user((int) $u['id'], 'test', [], ['type' => 'test']);
    json_out(['ok' => true, 'sent' => $n]);
}

// ── Raidex Keys: connecting the app, its routes and keystones (keys.php) ───
if ($route === '/keys/connect' && $method === 'POST') json_out(key_connect_start());
if ($route === '/keys/connect/poll' && $method === 'POST') json_out(key_connect_poll(body()));
if (match_route('/keys/connect/{code}', $route, $m) && $method === 'GET') {
    require_auth();
    json_out(key_connect_info($m[0]));
}
if (match_route('/keys/connect/{code}/approve', $route, $m) && $method === 'POST') json_out(key_connect_decide(require_auth(), $m[0], true));
if (match_route('/keys/connect/{code}/deny', $route, $m) && $method === 'POST') json_out(key_connect_decide(require_auth(), $m[0], false));
if ($route === '/keys/routes' && $method === 'GET') {
    $u = require_auth();
    json_out(['routes' => key_routes_visible($u)]);
}
if ($route === '/keys/routes' && $method === 'POST') {
    $u = require_auth();
    json_out(['route' => key_route_save($u, body())]);
}
if (match_route('/keys/routes/{id}', $route, $m) && $method === 'PATCH') {
    $u = require_auth();
    json_out(['route' => key_route_share($u, (int) $m[0], body())]);
}
if ($route === '/keys/report' && $method === 'POST') {
    $u = require_auth();
    json_out(key_report($u, body()));
}
if ($route === '/keys/guild' && $method === 'GET') {
    $u = require_auth();
    json_out(key_guild($u));
}
if (match_route('/mplus/character/{realm}/{name}', $route, $m) && $method === 'GET') {
    json_out(key_mplus_character(require_auth(), $m[0], $m[1]));
}
if (match_route('/keys/routes/{id}', $route, $m) && $method === 'DELETE') {
    $u = require_auth();
    key_route_delete($u, (int) $m[0]);
    json_out(['ok' => true]);
}

// Internal operator docs — restricted to the global admin BattleTag. The HTML lives
// outside the web root (…/current/internal-docs.html) so it is only reachable here.
if ($route === '/docs/internal' && $method === 'GET') {
    $u = require_auth();
    if (!is_admin($u['battletag'] ?? '')) json_err('not_allowed', 403);
    $f = __DIR__ . '/../../internal-docs.html';
    if (!is_file($f)) json_err('docs_not_found', 404);
    header('Content-Type: text/html; charset=utf-8');
    readfile($f);
    exit;
}

json_err('not_found: ' . $method . ' ' . $route, 404);
