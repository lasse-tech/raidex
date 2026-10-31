<?php
// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: AGPL-3.0-or-later
// Keys and libraries outside the web root: shared_dir in config.php (required;
// without it push stays off and the error log says why).
function shared_dir(): string {
    $dir = cfg()['shared_dir'] ?? '';
    if ($dir === '') {
        static $logged = false;
        if (!$logged) error_log('raidex: shared_dir is not set in config.php, push is off');
        $logged = true;
        return '/nonexistent';
    }
    return rtrim($dir, '/');
}

// Apple Push (APNs) via token-based auth (ES256 JWT signed with the .p8 key).
// Non-secret identifiers default here; the private key lives OUTSIDE the web root
// and is referenced by path. Override any of these in config.php if needed.
function apns_cfg(): array {
    $c = cfg();
    return [
        'keyId'      => $c['apns_key_id']    ?? 'UB2DKCA349',
        'teamId'     => $c['apns_team_id']   ?? 'ZPY7FC8GVK',
        'bundle'     => $c['apns_bundle_id'] ?? 'de.iguild.raidex',
        'keyPath'    => $c['apns_key_path']  ?? shared_dir() . '/apns/AuthKey_UB2DKCA349.p8',
        'production' => $c['apns_production'] ?? true,
    ];
}

function apns_b64url(string $d): string { return rtrim(strtr(base64_encode($d), '+/', '-_'), '='); }

// ECDSA DER signature → raw R||S (64 bytes), as JWT ES256 requires.
function apns_der2raw(string $der): ?string {
    $o = 0;
    if (($der[$o++] ?? '') !== "\x30") return null;
    $len = ord($der[$o++]); if ($len & 0x80) $o += ($len & 0x7f);
    $rs = [];
    for ($i = 0; $i < 2; $i++) {
        if (($der[$o++] ?? '') !== "\x02") return null;
        $l = ord($der[$o++]); $v = substr($der, $o, $l); $o += $l;
        $v = ltrim($v, "\x00"); $v = str_pad($v, 32, "\x00", STR_PAD_LEFT);
        $rs[] = $v;
    }
    return $rs[0] . $rs[1];
}

// Provider JWT, cached ~40 min (APNs accepts a token for up to 60 min).
function apns_jwt(): ?string {
    static $cached = null; static $exp = 0;
    if ($cached && $exp > time()) return $cached;
    $a = apns_cfg();
    if (!is_readable($a['keyPath'])) return null;
    $h = apns_b64url(json_encode(['alg' => 'ES256', 'kid' => $a['keyId']]));
    $c = apns_b64url(json_encode(['iss' => $a['teamId'], 'iat' => time()]));
    $pk = openssl_pkey_get_private(file_get_contents($a['keyPath']));
    if (!$pk) return null;
    openssl_sign("$h.$c", $der, $pk, OPENSSL_ALGO_SHA256);
    $raw = apns_der2raw($der); if (!$raw) return null;
    $cached = "$h.$c." . apns_b64url($raw); $exp = time() + 2400;
    return $cached;
}

function apns_post(string $host, string $deviceToken, string $jwt, string $bundle, string $payload): array {
    $ch = curl_init("$host/3/device/$deviceToken");
    curl_setopt_array($ch, [
        CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_2_0,
        CURLOPT_POST => true, CURLOPT_POSTFIELDS => $payload,
        CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10,
        CURLOPT_HTTPHEADER => [
            "authorization: bearer $jwt", "apns-topic: $bundle",
            'apns-push-type: alert', 'apns-priority: 10',
        ],
    ]);
    $res = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    return [$code, (string) $res];
}

// Send one alert. Tries the configured APNs environment, then the other (a
// dev-signed build's token is sandbox-only, an App Store build's is production).
// Prunes the token only if both environments reject it as bad. Returns [code,res].
function apns_send(string $deviceToken, string $title, string $body, array $data = []): array {
    $a = apns_cfg();
    $jwt = apns_jwt();
    if (!$jwt) return [0, 'no_jwt'];
    $payload = json_encode(['aps' => ['alert' => ['title' => $title, 'body' => $body], 'sound' => 'default']] + $data);
    $prod = 'https://api.push.apple.com'; $sand = 'https://api.sandbox.push.apple.com';
    $order = $a['production'] ? [$prod, $sand] : [$sand, $prod];
    $bad = fn($c, $r) => $c === 400 && str_contains($r, 'BadDeviceToken');
    [$code, $res] = apns_post($order[0], $deviceToken, $jwt, $a['bundle'], $payload);
    if ($bad($code, $res)) [$code, $res] = apns_post($order[1], $deviceToken, $jwt, $a['bundle'], $payload);
    if ($code === 410 || $bad($code, $res)) {
        db()->prepare('DELETE FROM ' . tbl('device_tokens') . ' WHERE token = ?')->execute([$deviceToken]);
    }
    return [$code, (string) $res];
}

// ── Android push via FCM HTTP v1 (OAuth from the service-account key) ──────────
function fcm_cfg(): array {
    $c = cfg();
    $path = $c['fcm_service_account'] ?? shared_dir() . '/fcm/service-account.json';
    $sa = is_readable($path) ? json_decode(file_get_contents($path), true) : null;
    return ['sa' => $sa, 'projectId' => $c['fcm_project_id'] ?? ($sa['project_id'] ?? null)];
}

function fcm_access_token(): ?string {
    static $tok = null; static $exp = 0;
    if ($tok && $exp > time()) return $tok;
    $sa = fcm_cfg()['sa'];
    if (!$sa || empty($sa['private_key']) || empty($sa['client_email'])) return null;
    $now = time();
    $h = apns_b64url(json_encode(['alg' => 'RS256', 'typ' => 'JWT']));
    $c = apns_b64url(json_encode([
        'iss' => $sa['client_email'], 'scope' => 'https://www.googleapis.com/auth/firebase.messaging',
        'aud' => 'https://oauth2.googleapis.com/token', 'iat' => $now, 'exp' => $now + 3600,
    ]));
    $pk = openssl_pkey_get_private($sa['private_key']);
    if (!$pk) return null;
    openssl_sign("$h.$c", $sig, $pk, OPENSSL_ALGO_SHA256);
    $jwt = "$h.$c." . apns_b64url($sig);
    $ch = curl_init('https://oauth2.googleapis.com/token');
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10,
        CURLOPT_POSTFIELDS => http_build_query(['grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer', 'assertion' => $jwt])]);
    $res = json_decode(curl_exec($ch), true); curl_close($ch);
    if (empty($res['access_token'])) return null;
    $tok = $res['access_token']; $exp = $now + ($res['expires_in'] ?? 3600) - 60;
    return $tok;
}

function fcm_send(string $token, string $title, string $body, array $data = []): array {
    $f = fcm_cfg();
    if (!$f['projectId']) return [0, 'no_project'];
    $at = fcm_access_token();
    if (!$at) return [0, 'no_token'];
    $strData = []; foreach ($data as $k => $v) $strData[$k] = (string) $v;
    $payload = json_encode(['message' => ['token' => $token, 'notification' => ['title' => $title, 'body' => $body], 'data' => $strData]]);
    $ch = curl_init("https://fcm.googleapis.com/v1/projects/{$f['projectId']}/messages:send");
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10,
        CURLOPT_HTTPHEADER => ["Authorization: Bearer $at", 'Content-Type: application/json'], CURLOPT_POSTFIELDS => $payload]);
    $res = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    if ($code === 404 || ($code === 400 && str_contains((string) $res, 'registration-token-not-registered'))) {
        db()->prepare('DELETE FROM ' . tbl('device_tokens') . ' WHERE token = ?')->execute([$token]);
    }
    return [$code, (string) $res];
}

// ── Web Push (browser notifications) via VAPID + Minishlink/web-push ───────────
function vapid_cfg(): array {
    $c = cfg();
    $path = $c['vapid_file'] ?? shared_dir() . '/webpush/vapid.json';
    $v = is_readable($path) ? json_decode(file_get_contents($path), true) : null;
    return [
        'public'   => $v['publicKey'] ?? null,
        'private'  => $v['privateKey'] ?? null,
        'subject'  => $c['vapid_subject'] ?? 'mailto:lars@lasse-tech.de',
        'autoload' => $c['webpush_autoload'] ?? shared_dir() . '/webpush/vendor/autoload.php',
    ];
}

function web_send(string $subJson, string $title, string $body, array $data = []): array {
    $v = vapid_cfg();
    if (!$v['public'] || !$v['private'] || !is_readable($v['autoload'])) return [0, 'no_vapid'];
    require_once $v['autoload'];
    try {
        $webPush = new \Minishlink\WebPush\WebPush(['VAPID' => [
            'subject' => $v['subject'], 'publicKey' => $v['public'], 'privateKey' => $v['private'],
        ]]);
        $sub = \Minishlink\WebPush\Subscription::create(json_decode($subJson, true));
        $report = $webPush->sendOneNotification($sub, json_encode(['title' => $title, 'body' => $body, 'data' => $data]));
        if ($report->isSubscriptionExpired()) {
            db()->prepare('DELETE FROM ' . tbl('device_tokens') . ' WHERE token = ?')->execute([$subJson]);
        }
        return [$report->isSuccess() ? 201 : 0, $report->isSuccess() ? 'ok' : $report->getReason()];
    } catch (\Throwable $e) { return [0, $e->getMessage()]; }
}

// $lang: the UI language of the device, which its pushes are written in.
function register_device_token(int $userId, string $token, string $platform, string $lang): void {
    db()->prepare('INSERT INTO ' . tbl('device_tokens') . ' (user_id, token, platform, lang, created_at) VALUES (?,?,?,?,?)
        ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, lang = EXCLUDED.lang, created_at = EXCLUDED.created_at')
        ->execute([$userId, $token, $platform, $lang, now_ms()]);
}

// Push to every device a user registered, each in its own language:
// title and body are push.<$msg>.title/.body in api/i18n (NULL lang: English).
function push_to_user(int $userId, string $msg, array $params = [], array $data = []): int {
    $st = db()->prepare('SELECT token, platform, lang FROM ' . tbl('device_tokens') . ' WHERE user_id = ?');
    $st->execute([$userId]);
    $sent = 0;
    foreach ($st->fetchAll() as $r) {
        $lang = normalize_lang($r['lang'] ?? null) ?? I18N_FALLBACK;
        $title = tr("push.$msg.title", $params, $lang);
        $body = tr("push.$msg.body", $params, $lang);
        if ($r['platform'] === 'ios') [$code] = apns_send($r['token'], $title, $body, $data);
        elseif ($r['platform'] === 'android') [$code] = fcm_send($r['token'], $title, $body, $data);
        elseif ($r['platform'] === 'web') [$code] = web_send($r['token'], $title, $body, $data);
        else $code = 0;
        if ($code >= 200 && $code < 300) $sent++;
    }
    return $sent;
}

// Notify the global admin(s) that a new Battle.net user joined.
function notify_new_user(string $battletag): void {
    $admins = cfg()['admin_battletags'] ?? [];
    if (!$admins) return;
    $in = implode(',', array_fill(0, count($admins), '?'));
    $st = db()->prepare('SELECT id FROM ' . tbl('users') . " WHERE battletag IN ($in)");
    $st->execute($admins);
    foreach ($st->fetchAll() as $r) {
        push_to_user((int) $r['id'], 'newUser', ['battletag' => $battletag], ['type' => 'new_user']);
    }
}
