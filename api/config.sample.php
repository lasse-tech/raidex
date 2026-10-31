<?php
// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: MIT
// Copy to config.php on the server and fill in real values. config.php is
// gitignored and must NOT be committed (contains DB + Battle.net secrets).
return [
    'base_path'    => '/api',                      // API mount; app at domain root
    'site_origin'  => 'https://raidex.app',
    'app_path'     => '',                          // '' = served at domain root
    'app_scheme'   => 'raidex',                    // native app deep-link scheme
    'product_name' => 'Raidex',
    'shared_dir'   => '',                          // push keys and web-push vendor, outside the web root

    // Database (PostgreSQL by default; set db_driver=mysql for MariaDB).
    'db_driver' => 'pgsql',
    'db_host'   => '127.0.0.1',
    'db_port'   => 5432,
    'db_name'   => 'raidex',
    'db_user'   => 'raidex',
    'db_pass'   => '',                             // or read from a protected file
    'db_prefix' => 'mm_',

    // Battle.net / Blizzard
    'bnet_client_id'     => '',
    'bnet_client_secret' => '',
    'bnet_region'        => 'eu',
    'bnet_redirect_uri'  => 'https://raidex.app/api/auth/callback',

    // Static key for GET /api/stats (guild count, members, M+ kings). Normally
    // left empty: tokens are generated in the app under Profil →
    // Statistik-Tokens. This one is the way in on a server nobody can log into,
    // and unlike those it cannot be seen or revoked there.
    'stats_token' => '',

    'admin_battletags' => [],
    'demo_login' => true,
    'session_ttl_days' => 30,
];
