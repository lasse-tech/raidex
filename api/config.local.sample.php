<?php
// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: MIT
// ─────────────────────────────────────────────────────────────────────────────
//  ENVIRONMENT OVERRIDE  —  copy this file to  config.local.php  and fill it in.
//  It overrides values from config.php and is never committed to git.
//
//  Steps on the server, in the api/ directory of the docroot:
//    cp config.local.sample.php config.local.php
//    nano config.local.php
//    php -l config.local.php        # must say "No syntax errors detected"
//
//  Every redirect URI must be registered on develop.battle.net for the client
//  whose ID you paste below, or the login comes back with an OAuth error.
// ─────────────────────────────────────────────────────────────────────────────
return [
    // From develop.battle.net → your Raidex client:
    'bnet_client_id'     => 'PASTE_CLIENT_ID',
    'bnet_client_secret' => 'PASTE_CLIENT_SECRET',

    // Your BattleTag (and any co-raidleads) — these accounts become admins:
    'admin_battletags'   => ['DeinTag#1234'],

    // Turn OFF demo login → real Battle.net login is used:
    'demo_login'         => false,

    // Optional: static key for GET /api/stats. Normally not needed - generate
    // tokens in the app under Profil → Statistik-Tokens instead.
    // 'stats_token'     => 'PASTE_A_LONG_RANDOM_STRING',
];
