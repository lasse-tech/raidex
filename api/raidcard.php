<?php
// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: AGPL-3.0-or-later
// Öffentliche Raid-Share-Vorschau: OG-HTML + serverseitig gezeichnetes Vorschaubild.
// Discord/Slack/WhatsApp lesen nur Open-Graph-Tags (kein JS) und zeigen als Bild ein
// echtes Rasterbild an — dieses wird hier mit GD als "Raidkasten" gezeichnet, bewusst
// OHNE den "eingeladen von …"-Block. Läuft mit reiner GD-Extension (kein Imagick/Chromium).

// Difficulty colours; the labels are card.diff.<key> in api/i18n, in the guild's language.
const RAIDCARD_DIFFS = [
    'mythic' => '#FF8000',
    'heroic' => '#A335EE',
    'normal' => '#0070DD',
    'lfr'    => '#1EFF00',
    'mplus'  => '#FF8000',
];
const RAIDCARD_ROLES = [
    ['tank',   '#5E81AC'],
    ['healer', '#A3BE8C'],
    ['dps',    '#BF616A'],
];
const RAIDCARD_FONT_B = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
const RAIDCARD_FONT_R = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
// Bei jeder Layout-/Rendering-/Text-Änderung erhöhen → invalidiert Bild-Cache UND
// erzwingt beim nächsten Teilen einen neuen Token (frisches Discord-Unfurl).
const RAIDCARD_VER = 4;

// [label, colour] of a raid's difficulty, label in $lang; unknown → ['', $fallback].
function raidcard_diff(?string $key, string $lang, string $fallback = '#0070DD'): array {
    if (!isset(RAIDCARD_DIFFS[$key ?? ''])) return ['', $fallback];
    return [tr('card.diff.' . $key, [], $lang), RAIDCARD_DIFFS[$key]];
}

// The language of a raid's card and Discord message: its guild's.
function raidcard_lang(array $raid): string {
    return guild_lang((int) ($raid['guild_id'] ?? 0));
}

// Inhalts- + Versions-Hash: Cache-Key fürs gerenderte Bild UND Cache-Buster in der
// og:image-URL. Ändert sich Design (RAIDCARD_VER), Counts, Zeit, Titel, Cover oder
// Schwierigkeit → neuer Hash → Discord/Proxy holen ein frisches Bild.
function raidcard_sig(array $raid): string {
    $c = $raid['counts'] ?? ['tank' => 0, 'healer' => 0, 'dps' => 0];
    return substr(md5(json_encode([
        RAIDCARD_VER, raidcard_lang($raid),
        (int) $raid['id'], $raid['title'] ?? '', $raid['instance'] ?? '', $raid['difficulty'] ?? '',
        $raid['image'] ?? '', (int) ($raid['starts_at'] ?? 0),
        (int) $c['tank'], (int) $c['healer'], (int) $c['dps'],
    ])), 0, 12);
}

// ── HTML mit Open-Graph-Tags ────────────────────────────────────────────────
function render_raid_share_html(array $raid, string $path): void {
    $origin    = rtrim(cfg()['site_origin'] ?? 'https://raidex.app', '/');
    $sharePath = preg_replace('#/card\.png$#', '', $path);              // /r/xxx  |  /dev/r/xxx
    $appBase   = rtrim(preg_replace('#/r/[A-Za-z0-9_-]+$#', '', $sharePath), '/'); // ''  |  /dev
    $shareUrl  = $origin . $sharePath;
    $imgUrl    = $origin . $sharePath . '/card.png?v=' . raidcard_sig($raid);
    $deepUrl   = $origin . $appBase . '/calendar#raid-' . (int) $raid['id'];

    $lang = raidcard_lang($raid);
    [$dLabel] = raidcard_diff($raid['difficulty'] ?? null, $lang);
    $c = $raid['counts'] ?? ['tank' => 0, 'healer' => 0, 'dps' => 0];
    $bits = array_filter([
        $raid['instance'] ?? '',
        $dLabel,
        raidcard_when($raid, $lang),
    ]);
    // og:description ist reiner Text (kein Bild-Icon möglich) → saubere Wortlabels statt Emoji.
    $desc = implode(' · ', $bits) . ' — '
        . tr('card.summary', ['tank' => (int) $c['tank'], 'healer' => (int) $c['healer'], 'dps' => (int) $c['dps']], $lang);

    $h = fn($s) => htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
    $title = $raid['title'] ?: 'Raid';

    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: public, max-age=300');
    echo '<!doctype html><html lang="' . $lang . '"><head><meta charset="utf-8">'
        . '<meta name="viewport" content="width=device-width, initial-scale=1">'
        . '<title>' . $h($title) . ' · Raidex</title>'
        . '<meta property="og:type" content="website">'
        . '<meta property="og:site_name" content="Raidex">'
        . '<meta property="og:title" content="' . $h($title) . '">'
        . '<meta property="og:description" content="' . $h($desc) . '">'
        . '<meta property="og:url" content="' . $h($shareUrl) . '">'
        . '<meta property="og:image" content="' . $h($imgUrl) . '">'
        . '<meta property="og:image:width" content="1200">'
        . '<meta property="og:image:height" content="630">'
        . '<meta property="og:image:type" content="image/png">'
        . '<meta name="twitter:card" content="summary_large_image">'
        . '<meta name="twitter:title" content="' . $h($title) . '">'
        . '<meta name="twitter:description" content="' . $h($desc) . '">'
        . '<meta name="twitter:image" content="' . $h($imgUrl) . '">'
        . '<meta name="theme-color" content="#0e1430">'
        . '<meta name="robots" content="noindex">'
        . '<link rel="canonical" href="' . $h($deepUrl) . '">'
        . '</head>'
        . '<body style="margin:0;background:#0e1430;color:#e8eaf6;font-family:system-ui,-apple-system,sans-serif">'
        . '<script>location.replace(' . json_encode($deepUrl) . ');</script>'
        . '<p style="padding:28px;font-size:15px">' . $h(tr('card.loading', [], $lang)) . ' '
        . '<a href="' . $h($deepUrl) . '" style="color:#8ab4ff">' . $h(tr('card.toCalendar', [], $lang)) . '</a></p>'
        . '</body></html>';
}

// Start of a raid in Europe/Berlin, in $lang: weekday, date and time.
function raidcard_start(array $raid): ?DateTime {
    $ms = (int) ($raid['starts_at'] ?? 0);
    if ($ms <= 0) return null;
    return (new DateTime('@' . intdiv($ms, 1000)))->setTimezone(new DateTimeZone('Europe/Berlin'));
}
function raidcard_weekday(DateTime $dt, string $lang): string {
    return explode(',', tr('card.weekdays', [], $lang))[(int) $dt->format('N') - 1] ?? '';
}
function raidcard_date(DateTime $dt, string $lang): string {
    return $dt->format(tr('card.dateFormat', [], $lang));
}
function raidcard_time(DateTime $dt, string $lang): string {
    return tr('card.time', ['time' => $dt->format('H:i')], $lang);
}

// "Sat 19 Jul · 20:00" / "Sa, 19.07. · 20:00 Uhr"
function raidcard_when(array $raid, string $lang): string {
    $dt = raidcard_start($raid);
    if (!$dt) return '';
    return tr('card.when', ['weekday' => raidcard_weekday($dt, $lang), 'date' => raidcard_date($dt, $lang), 'time' => raidcard_time($dt, $lang)], $lang);
}

// ── Vorschaubild (GD) ───────────────────────────────────────────────────────
function render_raid_card_png(array $raid): void {
    $banner = !empty($_GET['banner']); // ?banner=1 → kürzeres Banner ohne Rollen-Kacheln (Discord-Embed)
    $W = 1200; $H = 630;
    $c = $raid['counts'] ?? ['tank' => 0, 'healer' => 0, 'dps' => 0];

    $cacheDir  = __DIR__ . '/.cache';
    $cacheFile = $cacheDir . '/card_' . ($banner ? 'b' : 'f') . '_' . raidcard_sig($raid) . '.png';
    if (is_file($cacheFile) && filemtime($cacheFile) > time() - 86400) {
        raidcard_emit(file_get_contents($cacheFile));
        return;
    }
    if ($banner) { raidcard_draw_banner($raid, $cacheFile); return; }
    $lang = raidcard_lang($raid);

    $im = imagecreatetruecolor($W, $H);
    imagealphablending($im, true);

    // Grundfläche: indigofarbener Vertikalverlauf wie die App.
    raidcard_vgrad($im, 0, 0, $W, $H, '#141b3d', '#0b1026');

    // Cover-Band (oben) — echtes Blizzard-Tile, sonst Difficulty-Verlauf mit Emblem.
    $coverH = 300;
    [$dLabel, $dHex] = raidcard_diff($raid['difficulty'] ?? null, $lang);
    $src = raidcard_load_image($raid['image'] ?? null);
    if ($src) {
        raidcard_cover($im, $src, 0, 0, $W, $coverH);
        imagedestroy($src);
    } else {
        raidcard_vgrad($im, 0, 0, $W, $coverH, raidcard_mix($dHex, '#0b1026', 0.35), '#0b1026');
        $emblem = (stripos($raid['instance'] ?? '', 'omega') !== false) ? '⚙' : '';
    }
    // Scrim unten im Cover für Textlesbarkeit.
    for ($i = 0; $i < 210; $i++) {
        $a = (int) (112 - 112 * $i / 210); // unten kräftig, nach oben transparent
        $col = imagecolorallocatealpha($im, 8, 12, 32, $a);
        imageline($im, 0, $coverH - 1 - $i, $W, $coverH - 1 - $i, $col);
    }

    // Difficulty-Badge oben links.
    if ($dLabel !== '') {
        $bx = 40; $by = 34; $pad = 18; $fs = 20;
        $bb = imagettfbbox($fs, 0, RAIDCARD_FONT_B, mb_strtoupper($dLabel));
        $bw = $bb[2] - $bb[0]; $bh = $bb[1] - $bb[7];
        raidcard_roundrect($im, $bx, $by, $bw + $pad * 2, $bh + $pad, 10, raidcard_col($im, $dHex));
        imagettftext($im, $fs, 0, $bx + $pad, $by + $bh + $pad / 2 - 2, raidcard_col($im, '#ffffff'), RAIDCARD_FONT_B, mb_strtoupper($dLabel));
    }

    // Datum/Uhrzeit unten links im Cover — groß und prominent.
    $when = raidcard_when($raid, $lang);
    if ($when !== '') {
        imagettftext($im, 44, 0, 46, $coverH - 32, raidcard_col($im, '#ffffff'), RAIDCARD_FONT_B, $when);
    }

    // Titel.
    $title = raidcard_fit($raid['title'] ?: 'Raid', 40, RAIDCARD_FONT_B, $W - 96);
    imagettftext($im, 40, 0, 48, $coverH + 76, raidcard_col($im, '#f3f5ff'), RAIDCARD_FONT_B, $title);

    // Instanz-Zeile.
    if (!empty($raid['instance'])) {
        $inst = raidcard_fit($raid['instance'], 22, RAIDCARD_FONT_R, $W - 96);
        imagettftext($im, 22, 0, 48, $coverH + 122, raidcard_col($im, '#aeb6df'), RAIDCARD_FONT_R, $inst);
    }

    // Rollen-Zeile: Tank / Heiler / DD als drei Kacheln (ohne "eingeladen von").
    // Zahl oben, darunter WoW-Rollen-Icon + Label — Icon und Text vertikal zentriert.
    $cellY = $coverH + 150; $cellH = 128; $gap = 22; $mx = 48;
    $cellW = (int) (($W - $mx * 2 - $gap * 2) / 3);
    $icoSize = 34; $lblSize = 20; $iconGap = 10;
    $i = 0;
    foreach (RAIDCARD_ROLES as [$key, $hex]) {
        $label = tr('card.role.' . $key, [], $lang);
        $cx = $mx + $i * ($cellW + $gap);
        raidcard_roundrect($im, $cx, $cellY, $cellW, $cellH, 16, raidcard_col($im, '#171e42'));
        // Zahl (groß, in Rollenfarbe).
        $num = (string) (int) ($c[$key] ?? 0);
        $nb  = imagettfbbox(48, 0, RAIDCARD_FONT_B, $num);
        imagettftext($im, 48, 0, $cx + (int) (($cellW - ($nb[2] - $nb[0])) / 2), $cellY + 60, raidcard_col($im, $hex), RAIDCARD_FONT_B, $num);
        // Icon + Label als zentrierte, vertikal ausgerichtete Zeile.
        $lb = imagettfbbox($lblSize, 0, RAIDCARD_FONT_R, $label);
        $lblW = $lb[2] - $lb[0];
        $rowW = $icoSize + $iconGap + $lblW;
        $rowX = $cx + (int) (($cellW - $rowW) / 2);
        $icoTop = $cellY + 78;
        $icoMid = $icoTop + $icoSize / 2;
        raidcard_draw_icon($im, $key, $rowX, $icoTop, $icoSize);
        // Textmitte exakt auf die Icon-Mitte legen.
        $baseline = (int) round($icoMid - ($lb[7] + $lb[1]) / 2);
        imagettftext($im, $lblSize, 0, $rowX + $icoSize + $iconGap, $baseline, raidcard_col($im, '#c2c9ea'), RAIDCARD_FONT_R, $label);
        $i++;
    }

    // Wortmarke unten rechts.
    $wm = 'raidex.app';
    $wb = imagettfbbox(20, 0, RAIDCARD_FONT_B, $wm);
    imagettftext($im, 20, 0, $W - ($wb[2] - $wb[0]) - 44, $H - 34, raidcard_col($im, '#6b74a8'), RAIDCARD_FONT_B, $wm);

    ob_start();
    imagepng($im);
    $png = ob_get_clean();
    imagedestroy($im);

    if (!is_dir($cacheDir)) @mkdir($cacheDir, 0770, true);
    @file_put_contents($cacheFile, $png);
    raidcard_emit($png);
}

// Kürzeres Banner fürs Discord-Embed: Cover + Difficulty-Badge + Datum + „Titel — Instanz".
// KEINE Rollen-Kacheln (die Rollenzahlen stehen im Embed als Felder).
function raidcard_draw_banner(array $raid, string $cacheFile): void {
    $W = 1200; $H = 440;
    $im = imagecreatetruecolor($W, $H);
    imagealphablending($im, true);
    $lang = raidcard_lang($raid);
    [$dLabel, $dHex] = raidcard_diff($raid['difficulty'] ?? null, $lang);
    $src = raidcard_load_image($raid['image'] ?? null);
    if ($src) { raidcard_cover($im, $src, 0, 0, $W, $H); imagedestroy($src); }
    else { raidcard_vgrad($im, 0, 0, $W, $H, raidcard_mix($dHex, '#0b1026', 0.4), '#0b1026'); }
    // Scrim unten für zwei gut lesbare Textzeilen (Alpha max. 127 in GD).
    for ($i = 0; $i < 300; $i++) {
        $a = (int) (120 - 120 * $i / 300);
        imageline($im, 0, $H - 1 - $i, $W, $H - 1 - $i, imagecolorallocatealpha($im, 8, 12, 32, $a));
    }
    // Difficulty-Badge oben links.
    if ($dLabel !== '') {
        $bx = 40; $by = 34; $pad = 18; $fs = 20;
        $bb = imagettfbbox($fs, 0, RAIDCARD_FONT_B, mb_strtoupper($dLabel));
        raidcard_roundrect($im, $bx, $by, ($bb[2] - $bb[0]) + $pad * 2, ($bb[1] - $bb[7]) + $pad, 10, raidcard_col($im, $dHex));
        imagettftext($im, $fs, 0, $bx + $pad, $by + ($bb[1] - $bb[7]) + $pad / 2 - 2, raidcard_col($im, '#ffffff'), RAIDCARD_FONT_B, mb_strtoupper($dLabel));
    }
    // Datum groß, „Titel — Instanz" darunter.
    $when = raidcard_when($raid, $lang);
    if ($when !== '') imagettftext($im, 52, 0, 46, $H - 84, raidcard_col($im, '#ffffff'), RAIDCARD_FONT_B, $when);
    $sub = ($raid['title'] ?: 'Raid') . (!empty($raid['instance']) ? ' — ' . $raid['instance'] : '');
    imagettftext($im, 25, 0, 48, $H - 42, raidcard_col($im, '#c7ccd6'), RAIDCARD_FONT_R, raidcard_fit($sub, 25, RAIDCARD_FONT_R, $W - 320));
    // Wortmarke unten rechts.
    $wm = 'raidex.app';
    $wb = imagettfbbox(20, 0, RAIDCARD_FONT_B, $wm);
    imagettftext($im, 20, 0, $W - ($wb[2] - $wb[0]) - 40, $H - 34, raidcard_col($im, '#d6dae6'), RAIDCARD_FONT_B, $wm);

    ob_start(); imagepng($im); $png = ob_get_clean(); imagedestroy($im);
    if (!is_dir(dirname($cacheFile))) @mkdir(dirname($cacheFile), 0770, true);
    @file_put_contents($cacheFile, $png);
    raidcard_emit($png);
}

function raidcard_emit(string $png): void {
    header('Content-Type: image/png');
    header('Cache-Control: public, max-age=3600');
    header('Content-Length: ' . strlen($png));
    echo $png;
}

// ── GD-Helfer ───────────────────────────────────────────────────────────────
function raidcard_hex(string $hex): array {
    $hex = ltrim($hex, '#');
    return [hexdec(substr($hex, 0, 2)), hexdec(substr($hex, 2, 2)), hexdec(substr($hex, 4, 2))];
}
function raidcard_col($im, string $hex) {
    [$r, $g, $b] = raidcard_hex($hex);
    return imagecolorallocate($im, $r, $g, $b);
}
function raidcard_mix(string $a, string $b, float $t): string {
    $x = raidcard_hex($a); $y = raidcard_hex($b);
    return sprintf('#%02x%02x%02x',
        (int) ($x[0] * (1 - $t) + $y[0] * $t),
        (int) ($x[1] * (1 - $t) + $y[1] * $t),
        (int) ($x[2] * (1 - $t) + $y[2] * $t));
}
function raidcard_vgrad($im, int $x, int $y, int $w, int $h, string $top, string $bot): void {
    $t = raidcard_hex($top); $b = raidcard_hex($bot);
    for ($i = 0; $i < $h; $i++) {
        $f = $i / max(1, $h - 1);
        $col = imagecolorallocate($im,
            (int) ($t[0] + ($b[0] - $t[0]) * $f),
            (int) ($t[1] + ($b[1] - $t[1]) * $f),
            (int) ($t[2] + ($b[2] - $t[2]) * $f));
        imageline($im, $x, $y + $i, $x + $w, $y + $i, $col);
    }
}
function raidcard_roundrect($im, int $x, int $y, int $w, int $h, int $r, $color): void {
    imagefilledrectangle($im, $x + $r, $y, $x + $w - $r, $y + $h, $color);
    imagefilledrectangle($im, $x, $y + $r, $x + $w, $y + $h - $r, $color);
    imagefilledellipse($im, $x + $r, $y + $r, $r * 2, $r * 2, $color);
    imagefilledellipse($im, $x + $w - $r, $y + $r, $r * 2, $r * 2, $color);
    imagefilledellipse($im, $x + $r, $y + $h - $r, $r * 2, $r * 2, $color);
    imagefilledellipse($im, $x + $w - $r, $y + $h - $r, $r * 2, $r * 2, $color);
}
// Text auf maxW kürzen (mit … am Ende).
function raidcard_fit(string $text, float $size, string $font, int $maxW): string {
    $bb = imagettfbbox($size, 0, $font, $text);
    if (($bb[2] - $bb[0]) <= $maxW) return $text;
    while (mb_strlen($text) > 1) {
        $text = mb_substr($text, 0, mb_strlen($text) - 1);
        $bb = imagettfbbox($size, 0, $font, $text . '…');
        if (($bb[2] - $bb[0]) <= $maxW) break;
    }
    return $text . '…';
}
// Cover-Bild geladen? Mit Datei-Cache (7 Tage) und kurzem Timeout.
function raidcard_load_image(?string $url): ?\GdImage {
    if (!$url || !preg_match('#^https?://#', $url)) return null;
    $dir = __DIR__ . '/.cache';
    if (!is_dir($dir)) @mkdir($dir, 0770, true);
    $cf = $dir . '/img_' . md5($url);
    $bytes = (is_file($cf) && filemtime($cf) > time() - 86400 * 7) ? file_get_contents($cf) : null;
    if ($bytes === null || $bytes === false) {
        $ctx = stream_context_create(['http' => ['timeout' => 4, 'header' => "User-Agent: RaidexCard/1\r\n"]]);
        $bytes = @file_get_contents($url, false, $ctx);
        if ($bytes !== false && strlen($bytes) > 100) @file_put_contents($cf, $bytes);
    }
    if (!$bytes) return null;
    $img = @imagecreatefromstring($bytes);
    return $img ?: null;
}
// WoW-Rollen-Icon (mit Alpha) skaliert auf die Fläche compositen.
function raidcard_draw_icon($im, string $roleKey, int $x, int $y, int $size): void {
    $f = $roleKey === 'healer' ? 'heal' : $roleKey; // Dateien: role-tank/heal/dps.png
    $file = __DIR__ . '/img/role-' . $f . '.png';
    if (!is_file($file)) return;
    $src = @imagecreatefrompng($file);
    if (!$src) return;
    imagecopyresampled($im, $src, $x, $y, 0, 0, $size, $size, imagesx($src), imagesy($src));
    imagedestroy($src);
}

// Quellbild formatfüllend (cover) in den Zielbereich zeichnen, mittig beschnitten.
function raidcard_cover($im, $src, int $dx, int $dy, int $dw, int $dh): void {
    $sw = imagesx($src); $sh = imagesy($src);
    if ($sw < 1 || $sh < 1) return;
    $scale = max($dw / $sw, $dh / $sh);
    $cw = (int) ($dw / $scale); $ch = (int) ($dh / $scale);
    $sx = (int) (($sw - $cw) / 2); $sy = (int) (($sh - $ch) / 2);
    imagecopyresampled($im, $src, $dx, $dy, $sx, $sy, $dw, $dh, $cw, $ch);
}
