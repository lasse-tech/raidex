<?php
// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: AGPL-3.0-or-later
// Sessions (cookie for web, Bearer token for mobile) + Battle.net OAuth.

// Cookie names stay config-overridable so parallel installs on one domain keep
// separate sessions. Nothing needs it right now — production and development
// live on hosts of their own — but the override costs nothing to keep.
define('SESSION_COOKIE', cfg()['session_cookie'] ?? 'mm_sid');
define('STATE_COOKIE', cfg()['state_cookie'] ?? 'mm_oauth_state');

function uuidv4(): string {
    $d = random_bytes(16);
    $d[6] = chr((ord($d[6]) & 0x0f) | 0x40);
    $d[8] = chr((ord($d[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($d), 4));
}

function session_ttl_ms(): int {
    return cfg()['session_ttl_days'] * 86400 * 1000;
}

function create_session(int $userId): string {
    $id = uuidv4();
    $st = db()->prepare('INSERT INTO ' . tbl('sessions') . ' (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)');
    $st->execute([$id, $userId, now_ms(), now_ms() + session_ttl_ms()]);
    return $id;
}

function set_session_cookie(string $sid): void {
    setcookie(SESSION_COOKIE, $sid, [
        'expires' => time() + cfg()['session_ttl_days'] * 86400,
        'path' => '/', 'httponly' => true, 'samesite' => 'Lax', 'secure' => true,
    ]);
}

function read_session_id(): ?string {
    if (!empty($_COOKIE[SESSION_COOKIE])) return $_COOKIE[SESSION_COOKIE];
    $h = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (stripos($h, 'Bearer ') === 0) return trim(substr($h, 7));
    return null;
}

// Returns the current user row (+ isAdmin) or null.
function current_user(): ?array {
    static $u = false;
    if ($u !== false) return $u;
    $u = null;
    $sid = read_session_id();
    if ($sid) {
        $st = db()->prepare(
            'SELECT u.* FROM ' . tbl('users') . ' u JOIN ' . tbl('sessions') . ' s ON s.user_id = u.id
             WHERE s.id = ? AND s.expires_at > ?'
        );
        $st->execute([$sid, now_ms()]);
        $row = $st->fetch();
        if ($row) {
            // Demo accounts are admins of the demo sandbox; no demo_mode() call here (would recurse).
            $row['isAdmin'] = is_admin($row['battletag']) || !empty($row['is_demo']);
            $u = $row;
        }
    }
    return $u;
}

function require_auth(): array {
    $u = current_user();
    if (!$u) json_err('not_authenticated', 401);
    return $u;
}
function require_admin(): array {
    $u = require_auth();
    if (!$u['isAdmin']) json_err('not_admin', 403);
    return $u;
}

function upsert_user(string $sub, string $battletag, ?string $token, int $expires, bool &$isNew = false): int {
    $sel = db()->prepare('SELECT id FROM ' . tbl('users') . ' WHERE bnet_sub = ?');
    $sel->execute([$sub]);
    $existing = $sel->fetch();
    $isNew = !$existing;
    if ($existing) {
        $up = db()->prepare('UPDATE ' . tbl('users') . " SET battletag=?, access_token=?, token_expires=?, provider='bnet', is_demo=0, last_login=? WHERE id=?");
        $up->execute([$battletag, $token, $expires, now_ms(), $existing['id']]);
        return (int) $existing['id'];
    }
    $ins = db()->prepare('INSERT INTO ' . tbl('users') . " (bnet_sub, battletag, access_token, token_expires, provider, is_demo, created_at, last_login) VALUES (?, ?, ?, ?, 'bnet', 0, ?, ?) RETURNING id");
    $ins->execute([$sub, $battletag, $token, $expires, now_ms(), now_ms()]);
    return (int) $ins->fetchColumn();
}

function demo_login_session(): string {
    $admins = cfg()['admin_battletags'];
    $bt = !empty($admins) ? ucfirst($admins[0]) : 'Demo#0000';
    return create_session(upsert_user('demo-user', $bt, null, 0));
}

// Remove a demo account and everything it created (called when the same person
// upgrades to a real Battle.net login, or deletes the demo account: DELETE /me).
function delete_demo_account(int $userId): void {
    foreach (['signups' => 'user_id', 'user_guilds' => 'user_id', 'reloads' => 'user_id', 'sessions' => 'user_id', 'key_routes' => 'user_id', 'account_characters' => 'user_id', 'device_tokens' => 'user_id', 'key_connects' => 'user_id'] as $t => $col) {
        db()->prepare('DELETE FROM ' . tbl($t) . " WHERE $col = ?")->execute([$userId]);
    }
    foreach (['signups', 'raid_shares'] as $t) {
        db()->prepare('DELETE FROM ' . tbl($t) . ' WHERE raid_id IN (SELECT id FROM ' . tbl('raids') . ' WHERE created_by = ?)')->execute([$userId]);
    }
    db()->prepare('DELETE FROM ' . tbl('raids') . ' WHERE created_by = ?')->execute([$userId]);
    db()->prepare('DELETE FROM ' . tbl('users') . ' WHERE id = ? AND is_demo = 1')->execute([$userId]);
}

// ── E-mail / password (→ demo account, with verification) ────────────────────
function register_email_user(string $email, string $password): array {
    $email = mb_strtolower(trim($email));
    $token = bin2hex(random_bytes(24));
    $hash = password_hash($password, PASSWORD_DEFAULT);
    $sel = db()->prepare('SELECT id, email_verified FROM ' . tbl('users') . ' WHERE lower(email) = ?');
    $sel->execute([$email]);
    $existing = $sel->fetch();
    if ($existing) {
        if ((int) $existing['email_verified'] === 1) throw new Exception('email_taken');
        db()->prepare('UPDATE ' . tbl('users') . ' SET password_hash=?, verify_token=?, last_login=? WHERE id=?')
            ->execute([$hash, $token, now_ms(), $existing['id']]);
        return ['id' => (int) $existing['id'], 'verify' => $token];
    }
    $bt = 'Gast#' . str_pad((string) random_int(0, 9999), 4, '0', STR_PAD_LEFT);
    $ins = db()->prepare('INSERT INTO ' . tbl('users') . " (bnet_sub, battletag, provider, email, password_hash, is_demo, email_verified, verify_token, created_at, last_login)
        VALUES (NULL, ?, 'email', ?, ?, 1, 0, ?, ?, ?) RETURNING id");
    $ins->execute([$bt, $email, $hash, $token, now_ms(), now_ms()]);
    return ['id' => (int) $ins->fetchColumn(), 'verify' => $token];
}

function login_email_user(string $email, string $password): array {
    $email = mb_strtolower(trim($email));
    $st = db()->prepare('SELECT * FROM ' . tbl('users') . ' WHERE lower(email) = ?');
    $st->execute([$email]);
    $u = $st->fetch();
    if (!$u || empty($u['password_hash']) || !password_verify($password, $u['password_hash'])) throw new Exception('invalid_credentials');
    if ((int) $u['email_verified'] !== 1) throw new Exception('not_verified');
    db()->prepare('UPDATE ' . tbl('users') . ' SET last_login=? WHERE id=?')->execute([now_ms(), $u['id']]);
    return $u;
}

function verify_email_token(string $token): bool {
    if (!$token) return false;
    $st = db()->prepare('UPDATE ' . tbl('users') . ' SET email_verified=1, verify_token=NULL WHERE verify_token=? RETURNING id');
    $st->execute([$token]);
    return (bool) $st->fetchColumn();
}

function send_verification_email(string $email, string $token): bool {
    $g = cfg();
    $product = $g['product_name'] ?? 'Raidex';
    $link = rtrim($g['site_origin'], '/') . '/api/auth/verify?token=' . urlencode($token);
    $subject = tr('mail.verify.subject', ['product' => $product]);
    $body = tr('mail.verify.body', ['product' => $product, 'link' => $link]);
    $host = parse_url($g['site_origin'], PHP_URL_HOST) ?: 'raidex.app';
    $from = $g['mail_from'] ?? "noreply@$host";
    $headers = "From: $product <$from>\r\nContent-Type: text/plain; charset=utf-8\r\n";
    return @mail($email, $subject, $body, $headers);
}

// ── Battle.net OAuth ────────────────────────────────────────────────────────
function begin_login(string $platform = 'web', bool $forceLogin = false): string {
    $nonce = bin2hex(random_bytes(16));
    setcookie(STATE_COOKIE, "$platform.$nonce", ['expires' => time() + 600, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax', 'secure' => true]);
    $c = cfg();
    return OAUTH_HOST . '/authorize?' . http_build_query(array_filter([
        'prompt' => $forceLogin ? 'login' : null,
    ]) + [
        'client_id' => $c['bnet_client_id'],
        'redirect_uri' => $c['bnet_redirect_uri'],
        'response_type' => 'code',
        'scope' => 'openid wow.profile',
        'state' => "$platform.$nonce",
    ]);
}

// Returns [sid, platform] or throws.
function complete_login(): array {
    $code = $_GET['code'] ?? '';
    $state = $_GET['state'] ?? '';
    $cookie = $_COOKIE[STATE_COOKIE] ?? '';
    setcookie(STATE_COOKIE, '', ['expires' => time() - 1, 'path' => '/']);
    if (!$code || !$state || $state !== $cookie) throw new Exception('invalid_state');
    [$platform] = explode('.', $state);
    $c = cfg();

    $ch = curl_init(OAUTH_HOST . '/token');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true,
        CURLOPT_USERPWD => $c['bnet_client_id'] . ':' . $c['bnet_client_secret'],
        CURLOPT_POSTFIELDS => http_build_query([
            'grant_type' => 'authorization_code', 'code' => $code, 'redirect_uri' => $c['bnet_redirect_uri'],
        ]),
        CURLOPT_TIMEOUT => 15,
    ]);
    $tok = json_decode(curl_exec($ch), true);
    curl_close($ch);
    if (empty($tok['access_token'])) throw new Exception('token_exchange_failed');

    $ch = curl_init(OAUTH_HOST . '/userinfo');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $tok['access_token']],
        CURLOPT_TIMEOUT => 15,
    ]);
    $info = json_decode(curl_exec($ch), true);
    curl_close($ch);
    if (empty($info['sub'])) throw new Exception('userinfo_failed');

    // If the person was in a demo account, this real login replaces it → delete the demo data.
    $demo = current_user();
    $isNew = false;
    $uid = upsert_user((string) $info['sub'], $info['battletag'] ?? 'Unknown', $tok['access_token'], now_ms() + ($tok['expires_in'] ?? 0) * 1000, $isNew);
    if ($demo && !empty($demo['is_demo']) && (int) $demo['id'] !== $uid) delete_demo_account((int) $demo['id']);
    // Notify admins about genuinely new Battle.net users (never let it break login).
    if ($isNew && function_exists('notify_new_user')) {
        try { notify_new_user($info['battletag'] ?? 'Unbekannt'); } catch (Throwable $e) {}
    }
    return [create_session($uid), $platform ?: 'web'];
}
