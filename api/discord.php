<?php
// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: AGPL-3.0-or-later
// Discord-Benachrichtigung via Webhook: EINE Live-Nachricht pro Raid, die bei jeder
// Anmelde-/Raid-Änderung editiert wird (kein Spam). Reiner curl-POST/PATCH — kein
// Bot/Gateway. Fehler dürfen die Anmeldung nie brechen (alles in try/catch, best effort).

function discord_valid_webhook(?string $url): bool {
    return is_string($url) && preg_match(
        '#^https://(?:ptb\.|canary\.)?discord(?:app)?\.com/api/(?:v\d+/)?webhooks/\d+/[\w-]+$#', $url) === 1;
}

function discord_webhook_for_guild(int $guildId): ?string {
    $st = db()->prepare('SELECT discord_webhook_url FROM ' . tbl('guilds') . ' WHERE id = ?');
    $st->execute([$guildId]);
    $url = trim((string) ($st->fetchColumn() ?: ''));
    return discord_valid_webhook($url) ? $url : null;
}

// App-Basis aus dem aktuellen Request ableiten (prod '' vs dev '/dev') → korrekte Links/Bilder.
function discord_app_base(): string {
    $p = (string) (parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH) ?? '');
    return str_starts_with($p, '/dev/') ? '/dev' : '';
}

function discord_request(string $method, string $url, string $json, int $retries = 1): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method, CURLOPT_POSTFIELDS => $json,
        CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 8,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
    ]);
    $body = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($code === 429 && $retries > 0) { // Rate-Limit: einmal warten + erneut.
        $wait = min(5.0, (float) (json_decode((string) $body, true)['retry_after'] ?? 1));
        usleep((int) ($wait * 1e6));
        return discord_request($method, $url, $json, $retries - 1);
    }
    return ['code' => $code, 'body' => is_string($body) ? (string) $body : ''];
}

// Discord-Feld-Werte sind auf 1024 Zeichen begrenzt.
function discord_trunc(string $s, int $max = 1024): string {
    if ($s === '') return '—';
    return mb_strlen($s) <= $max ? $s : mb_substr($s, 0, $max - 1) . '…';
}

// Ersatzbank-Zählung pro Rolle (Twinks).
function discord_bench_counts(array $raid): array {
    $bc = ['tank' => 0, 'healer' => 0, 'dps' => 0];
    foreach ($raid['bench'] ?? [] as $g) foreach ($g['alts'] ?? [] as $a)
        if (isset($bc[$a['role']])) $bc[$a['role']]++;
    return $bc;
}

// Kompakte Rollen-Zeile „🛡️ 0   💚 1   ⚔️ 0" (Icons + Zahl, keine Textlabels).
// NBSP nach jeder Zahl, weil Discord normale Leerzeichen zu einem einzigen kollabiert.
function discord_counts_line(array $c): string {
    $gap = "\u{00A0}\u{00A0}\u{00A0}";
    return '🛡️ **' . (int) ($c['tank'] ?? 0) . '**' . $gap
        . '💚 **' . (int) ($c['healer'] ?? 0) . '**' . $gap
        . '⚔️ **' . (int) ($c['dps'] ?? 0) . '**';
}

// Farbiges Quadrat-Emoji je Schwierigkeit (für die Meta-Zeile).
const DISCORD_DIFF_SQUARE = ['mythic' => '🟧', 'heroic' => '🟪', 'normal' => '🟦', 'lfr' => '🟩', 'mplus' => '🟧'];

// Fortschrittsbalken ▰▱ Richtung Mindestgröße.
function discord_progress_bar(int $have, int $need): string {
    $need = max(1, $need);
    $seg = min(20, $need);
    $filled = max(0, min($seg, (int) round($have / $need * $seg)));
    return str_repeat('▰', $filled) . str_repeat('▱', $seg - $filled);
}

function discord_embed(array $raid, bool $cancelled = false): array {
    require_once __DIR__ . '/raidcard.php';
    $lang = raidcard_lang($raid); // the guild's language, like the card
    $diff = raidcard_diff($raid['difficulty'] ?? null, $lang, '#4f8ff7');
    $origin = rtrim(cfg()['site_origin'] ?? 'https://raidex.app', '/');
    $base = discord_app_base();
    $deep = $origin . $base . '/calendar#raid-' . (int) $raid['id'];
    $icon = $origin . $base . '/api/img/raidex-icon.png'; // 8-bit PNG (Discord verträgt kein 16-bit favicon)
    $title = $raid['title'] ?: 'Raid';
    $instance = (string) ($raid['instance'] ?? '');

    if ($cancelled) {
        return [
            'author' => ['name' => 'Raidex · ' . $title, 'icon_url' => $icon],
            'title' => '❌ ' . tr('discord.cancelled', ['name' => $instance ?: $title], $lang),
            'url' => $deep,
            'color' => hexdec('992d22'),
            'description' => discord_trunc(trim($instance . ' · ' . raidcard_when($raid, $lang), ' ·'), 4096),
            'footer' => ['text' => 'raidex.app'],
        ];
    }

    $c = $raid['counts'] ?? ['tank' => 0, 'healer' => 0, 'dps' => 0];
    $have = (int) array_sum($c);
    $min = max(1, (int) ($raid['min_size'] ?? 10));

    // Datum + Zeit getrennt (Europe/Berlin), wie im Design.
    $dt = raidcard_start($raid) ?? new DateTime('@0');
    $sq = DISCORD_DIFF_SQUARE[$raid['difficulty'] ?? ''] ?? '⬜';
    $g2 = "\u{00A0}\u{00A0}"; // echter Abstand zwischen Datum / Uhrzeit / Schwierigkeit
    $meta = '📅 ' . tr('discord.date', ['weekday' => raidcard_weekday($dt, $lang), 'date' => raidcard_date($dt, $lang)], $lang)
        . $g2 . '🕒 ' . raidcard_time($dt, $lang) . $g2 . $sq . ' ' . ($diff[0] ?: '—');

    // Aufstellung Richtung Mindestgröße; erreicht → grüner Haken statt Balken.
    $lineup = '**' . tr('discord.lineup', [], $lang) . '**';
    $aufHead = $have >= $min
        ? $lineup . "\n✔️ **" . tr('discord.signedUp', ['count' => $have], $lang) . '**'
        : $lineup . ' · ' . tr('discord.signedUpOf', ['have' => $have, 'min' => $min], $lang) . "\n" . discord_progress_bar($have, $min);

    $desc = $meta . "\n\n" . $aufHead . "\n" . discord_counts_line($c);

    return [
        'author' => ['name' => 'Raidex · ' . $title, 'icon_url' => $icon],
        'title' => $instance ?: $title,
        'url' => $deep,
        'color' => hexdec(ltrim($diff[1], '#')),
        'description' => discord_trunc($desc, 4096),
        'image' => ['url' => $origin . $base . '/r/' . raid_share_token($raid) . '/card.png?banner=1&v=' . raidcard_sig($raid)],
        'footer' => ['text' => 'raidex.app · ' . tr('discord.autoUpdate', [], $lang), 'icon_url' => $icon],
    ];
}

// Live-Nachricht posten oder editieren. Idempotent: existiert schon eine message_id,
// wird editiert; ist sie gelöscht (404), wird neu gepostet und die neue ID gespeichert.
function discord_sync_raid(int $raidId): void {
    try {
        $st = db()->prepare('SELECT * FROM ' . tbl('raids') . ' WHERE id = ?');
        $st->execute([$raidId]);
        $raid = $st->fetch();
        if (!$raid) return;
        $webhook = discord_webhook_for_guild((int) $raid['guild_id']);
        if (!$webhook) return; // Feature für diese Gilde aus.
        $raid = raid_with_signups($raid, 0, false); // roster/bench/counts
        $payload = json_encode(['embeds' => [discord_embed($raid)], 'allowed_mentions' => ['parse' => []]],
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        $msgId = $raid['discord_message_id'] ?? null;
        if ($msgId) {
            $res = discord_request('PATCH', $webhook . '/messages/' . rawurlencode($msgId), $payload);
            if ($res['code'] >= 200 && $res['code'] < 300) return;
            if ($res['code'] !== 404) return; // anderer Fehler → nicht duplizieren
            $msgId = null; // 404: Nachricht gelöscht → neu posten
        }
        $res = discord_request('POST', $webhook . '?wait=true', $payload);
        if ($res['code'] >= 200 && $res['code'] < 300) {
            $newId = json_decode($res['body'], true)['id'] ?? null;
            if ($newId) db()->prepare('UPDATE ' . tbl('raids') . ' SET discord_message_id = ? WHERE id = ?')
                ->execute([$newId, $raidId]);
        }
    } catch (Throwable $e) { /* Discord darf die Anmeldung nie brechen */ }
}

// Beim Löschen eines Raids: die (bereits gelöschte) Zeile wird übergeben, damit die
// Live-Nachricht auf „abgesagt" editiert werden kann.
function discord_cancel_message(array $raid): void {
    try {
        $msgId = $raid['discord_message_id'] ?? null;
        if (!$msgId) return;
        $webhook = discord_webhook_for_guild((int) $raid['guild_id']);
        if (!$webhook) return;
        $payload = json_encode(['embeds' => [discord_embed($raid, true)], 'allowed_mentions' => ['parse' => []]],
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        discord_request('PATCH', $webhook . '/messages/' . rawurlencode($msgId), $payload);
    } catch (Throwable $e) { /* best effort */ }
}

// Antwort sofort ausliefern, DANN (nach fastcgi_finish_request) Discord aktualisieren —
// die Anmelde-API bleibt schnell, der Webhook-Call blockiert den Client nicht.
function respond_and_sync_discord($data, int $raidId, int $status = 200): void {
    json_emit($data, $status);
    if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
    discord_sync_raid($raidId);
    exit;
}
