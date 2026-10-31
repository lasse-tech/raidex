#!/usr/bin/env php
<?php
// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: MIT
// Backfill / nightly guild scan.
//
// The web app only ever scans a guild while somebody is looking at it: /me
// triggers a background scan for the visitor's active guild. That leaves two
// gaps this script closes — guilds nobody has opened since they were created,
// and guilds whose scan has gone stale because the members stopped logging in.
//
//   php api/scan-pending.php                  # every guild that was never scanned
//   php api/scan-pending.php --stale          # …plus every scan older than the TTL
//   php api/scan-pending.php --limit=25       # stop after 25 guilds (API budget)
//   php api/scan-pending.php --dry-run        # list what would run, scan nothing
//
// Exit code is 0 unless a guild scan threw, so cron mails only on real trouble.

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("scan-pending.php is a CLI script.\n");
}

require __DIR__ . '/lib.php';
require __DIR__ . '/db.php';
require __DIR__ . '/blizzard.php';
require __DIR__ . '/guilds.php';
require __DIR__ . '/stats.php';   // is_demo_guild()
require __DIR__ . '/scan.php';

@set_time_limit(0);
@ini_set('memory_limit', '512M');

$opt = getopt('', ['stale', 'limit::', 'dry-run', 'help']);
if (isset($opt['help'])) {
    exit("Usage: php scan-pending.php [--stale] [--limit=N] [--dry-run]\n");
}
$stale = isset($opt['stale']);
$dry = isset($opt['dry-run']);
$limit = isset($opt['limit']) ? max(0, (int) $opt['limit']) : 0;

function say(string $msg): void {
    fwrite(STDOUT, date('Y-m-d H:i:s') . '  ' . $msg . "\n");
}

// Connect up front and say what is actually wrong. Run as anyone but the
// php-fpm pool user and the database password — kept in a file only that user
// can read — is simply not there, which surfaces as a PDO stack trace about a
// missing password rather than as the permission problem it is.
try {
    db();
} catch (PDOException $e) {
    fwrite(STDERR, 'Database connection failed: ' . $e->getMessage() . "\n\n");
    fwrite(STDERR, "This script has to run as the php-fpm pool user — it owns the credentials\n");
    fwrite(STDERR, "and api/.cache. Try:\n\n");
    fwrite(STDERR, '  sudo -u www-data php ' . __FILE__ . ' ' . implode(' ', array_slice($argv, 1)) . "\n");
    exit(2);
}

// Never scanned first, then the longest-stale — a capped run should spend its
// budget on the guilds that have nothing at all before it refreshes the rest.
$rows = db()->query('SELECT * FROM ' . tbl('guilds') . ' ORDER BY last_scan_at ASC NULLS FIRST, id ASC')->fetchAll();

$queue = [];
foreach ($rows as $g) {
    if (is_demo_guild($g)) continue;
    $never = (int) ($g['last_scan_at'] ?? 0) === 0;
    if (!$never && !$stale) continue;
    if (!guild_needs_scan($g)) continue;   // scanned recently, or a live scan is still running
    $queue[] = $g;
    if ($limit && count($queue) >= $limit) break;
}

if (!$queue) {
    say('Nothing to scan' . ($stale ? '' : ' (add --stale to include outdated guilds)') . '.');
    exit(0);
}

say(sprintf('%d guild(s) queued%s.', count($queue), $dry ? ' (dry run)' : ''));

$failed = 0;
foreach ($queue as $g) {
    $id = (int) $g['id'];
    $label = sprintf('%s · %s [%s]', $g['display_name'], $g['realm_name'] ?: $g['realm_slug'], $g['region']);
    $age = (int) ($g['last_scan_at'] ?? 0) === 0 ? 'never scanned' : 'last scan ' . round((now_ms() - (int) $g['last_scan_at']) / 3600000) . ' h ago';

    if ($dry) { say("would scan: $label ($age)"); continue; }

    // Same atomic claim the web path uses, so a cron run and a visitor's
    // background scan can never work on one guild at the same time.
    if (!try_start_scan($id)) { say("skipped (claimed elsewhere): $label"); continue; }

    $t0 = microtime(true);
    try {
        run_guild_scan($id);
        say(sprintf('scanned: %s — %d characters in %.1f s', $label, guild_char_count($id), microtime(true) - $t0));
    } catch (Throwable $e) {
        db()->prepare('UPDATE ' . tbl('guilds') . ' SET scanning=0 WHERE id=?')->execute([$id]);
        fwrite(STDERR, date('Y-m-d H:i:s') . "  FAILED: $label — " . $e->getMessage() . "\n");
        $failed++;
    }
}

exit($failed ? 1 : 0);
