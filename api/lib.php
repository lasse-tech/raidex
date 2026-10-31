<?php
// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: AGPL-3.0-or-later
// Shared helpers: config, JSON I/O, time, admin check, file cache.

function cfg(): array {
    static $c = null;
    if ($c === null) {
        $file = __DIR__ . '/config.php';
        $c = file_exists($file) ? require $file : require __DIR__ . '/config.sample.php';
        // Optional local override (secret, demo_login, admins) — never in git.
        $local = __DIR__ . '/config.local.php';
        if (file_exists($local)) {
            $over = require $local;
            if (is_array($over)) $c = array_replace($c, $over);
        }
    }
    return $c;
}

function now_ms(): int {
    return (int) round(microtime(true) * 1000);
}

// Emit a JSON response WITHOUT terminating (so background work can follow).
function json_emit($data, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

function json_out($data, int $status = 200): void {
    json_emit($data, $status);
    exit;
}

function json_err(string $error, int $status = 400): void {
    json_out(['error' => $error], $status);
}

// Parsed JSON request body.
function body(): array {
    static $b = null;
    if ($b === null) {
        $raw = file_get_contents('php://input');
        $b = $raw ? (json_decode($raw, true) ?: []) : [];
    }
    return $b;
}

function is_admin(?string $battletag): bool {
    if (!$battletag) return false;
    return in_array(strtolower($battletag), array_map('strtolower', cfg()['admin_battletags']), true);
}

// Demo mode is either forced globally (config) or per-user: any account that
// isn't a real Battle.net login (Google/Apple/email → demo) sees demo data.
function demo_mode(): bool {
    if (!empty(cfg()['demo_login'])) return true;
    if (!function_exists('current_user')) return false;
    $u = current_user();
    return $u && !empty($u['is_demo']);
}

// ── creator names ───────────────────────────────────────────────────────────
// The character behind a user's "realmslug:namelower" active_char_id, for
// naming whoever created something. Never the BattleTag: that must not leak to
// third parties, so an account without a main shows as "Mitglied".
//
// mb_convert_case rather than ucfirst, which is byte-based and would leave
// "ätherion" untouched. WoW names are capitalised exactly this way — first
// letter up, the rest down — so title case is the right transform.
function char_display_name(?string $activeCharId): string {
    if (!$activeCharId) return 'Mitglied';
    $name = explode(':', $activeCharId, 2)[1] ?? '';
    if ($name === '') return 'Mitglied';
    return mb_convert_case($name, MB_CASE_TITLE, 'UTF-8');
}

// ── date/time locale ────────────────────────────────────────────────────────
// The locale a client formats dates with. Kept to a whitelist because the value
// is echoed into Intl.DateTimeFormat() on the clients, and because an open text
// field buys nothing here.
const LOCALES = ['de-DE', 'de-AT', 'de-CH', 'en-GB', 'en-US'];
const LOCALE_DEFAULT = 'system'; // no explicit choice: follow the device

// 'system' is a sentinel, not a locale: it tells the client to fall back to the
// device's own locale. It stays a valid stored value, so resolving it is the
// client's job, not this function's.
function normalize_locale(?string $locale): string {
    $locale = trim((string) $locale);
    if ($locale === 'system') return 'system';
    foreach (LOCALES as $known) {
        if (strcasecmp($locale, $known) === 0) return $known;
    }
    return LOCALE_DEFAULT;
}

// ── simple file cache (client tokens, roster, character details) ────────────
function cache_get(string $key) {
    $f = cache_path($key);
    if (!file_exists($f)) return null;
    $j = json_decode(file_get_contents($f), true);
    if (!$j || ($j['exp'] ?? 0) < now_ms()) return null;
    return $j['val'];
}

function cache_set(string $key, $val, int $ttlMs): void {
    $dir = __DIR__ . '/.cache';
    if (!is_dir($dir)) @mkdir($dir, 0770, true);
    @file_put_contents(cache_path($key), json_encode(['exp' => now_ms() + $ttlMs, 'val' => $val]));
}

function cache_path(string $key): string {
    return __DIR__ . '/.cache/' . md5($key) . '.json';
}
