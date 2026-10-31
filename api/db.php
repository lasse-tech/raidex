<?php
// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: AGPL-3.0-or-later
// PDO connection to PostgreSQL + the schema. All tables use the mm_ prefix.
// v2 — multi-tenant: guilds are first-class; raids/widgets are scoped per guild.
// Membership and admin (raidlead) are derived live from the Blizzard roster.
//
// THE SCHEMA IS NOT APPLIED PER REQUEST. It used to be: index.php called
// db_init() before routing, so every call -- including a health check that
// touches nothing -- executed the whole list, 63 statements plus a DELETE that
// its own comment called a one-off cleanup. Idempotent, so it never broke; not
// free, because each ALTER TABLE briefly takes an ACCESS EXCLUSIVE lock even
// when it changes nothing. It also forced the two renames below to tolerate a
// race that only existed because two requests could run them at once.
//
// Now the statements are applied by db_migrate(), reached exactly one way:
// php api/migrate.php. So that a forgotten migration fails
// loudly instead of as "column does not exist" three screens deep, db() checks
// a fingerprint of the statement list against the one recorded in the database
// -- one cheap SELECT per connection, none at all for a request that opens no
// connection.

function db(): PDO {
    static $pdo = null;
    if ($pdo !== null) return $pdo;
    $c = cfg();
    $driver = $c['db_driver'] ?? 'pgsql';
    $port = $c['db_port'] ?? ($driver === 'pgsql' ? 5432 : 3306);
    $dsn = "{$driver}:host={$c['db_host']};port={$port};dbname={$c['db_name']}";
    if ($driver === 'mysql') $dsn .= ';charset=utf8mb4';
    $pdo = new PDO($dsn, $c['db_user'], $c['db_pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    // Not during a migration -- that is the one moment the two are allowed to
    // disagree, and it is what fixes them.
    if (!db_migrating()) db_schema_assert($pdo);
    return $pdo;
}

// True while db_migrate() is running. A static rather than a global: the only
// thing that may flip it is db_migrate() itself.
function db_migrating(?bool $set = null): bool {
    static $running = false;
    if ($set !== null) $running = $set;
    return $running;
}

function tbl(string $name): string {
    return cfg()['db_prefix'] . $name;
}

// Every statement that makes the schema what it is. Written to survive being
// run again (IF NOT EXISTS throughout) -- but "harmless when repeated" is not
// "free when repeated", which is why nothing calls this on the request path.
function db_schema_statements(): array {
    $p = cfg()['db_prefix'];
    return [
        "CREATE TABLE IF NOT EXISTS {$p}users (
            id BIGSERIAL PRIMARY KEY,
            bnet_sub VARCHAR(64) UNIQUE NOT NULL,
            battletag VARCHAR(64) NOT NULL,
            access_token TEXT,
            token_expires BIGINT,
            active_char_id VARCHAR(128),
            active_guild_id BIGINT,
            created_at BIGINT NOT NULL,
            last_login BIGINT NOT NULL
        )",
        "ALTER TABLE {$p}users ADD COLUMN IF NOT EXISTS active_guild_id BIGINT",
        // Multi-provider auth + per-user demo accounts.
        "ALTER TABLE {$p}users ALTER COLUMN bnet_sub DROP NOT NULL",
        "ALTER TABLE {$p}users ADD COLUMN IF NOT EXISTS provider VARCHAR(16)",
        "ALTER TABLE {$p}users ADD COLUMN IF NOT EXISTS email VARCHAR(190)",
        "ALTER TABLE {$p}users ADD COLUMN IF NOT EXISTS password_hash TEXT",
        "ALTER TABLE {$p}users ADD COLUMN IF NOT EXISTS email_verified SMALLINT NOT NULL DEFAULT 0",
        "ALTER TABLE {$p}users ADD COLUMN IF NOT EXISTS verify_token VARCHAR(64)",
        "ALTER TABLE {$p}users ADD COLUMN IF NOT EXISTS is_demo SMALLINT NOT NULL DEFAULT 0",
        // Date/time locale for the clients. NULL means the default ('system'); the
        // sentinel 'system' means "whatever the device reports". A device cannot
        // be asked for its POSIX LC_TIME — the browser only ever exposes its UI
        // language — so the choice has to live here.
        "ALTER TABLE {$p}users ADD COLUMN IF NOT EXISTS locale VARCHAR(16)",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_{$p}users_email ON {$p}users(lower(email)) WHERE email IS NOT NULL",
        "CREATE TABLE IF NOT EXISTS {$p}sessions (
            id CHAR(36) PRIMARY KEY,
            user_id BIGINT NOT NULL,
            created_at BIGINT NOT NULL,
            expires_at BIGINT NOT NULL
        )",
        "CREATE INDEX IF NOT EXISTS idx_{$p}sessions_user ON {$p}sessions(user_id)",
        "CREATE TABLE IF NOT EXISTS {$p}guilds (
            id BIGSERIAL PRIMARY KEY,
            region VARCHAR(8) NOT NULL,
            realm_slug VARCHAR(128) NOT NULL,
            name_slug VARCHAR(128) NOT NULL,
            display_name VARCHAR(200) NOT NULL,
            realm_name VARCHAR(200),
            faction VARCHAR(16),
            created_at BIGINT NOT NULL,
            member_count INT,
            achievement_points BIGINT,
            crest_emblem TEXT,
            crest_bg TEXT,
            last_scan_at BIGINT,
            scanning SMALLINT NOT NULL DEFAULT 0,
            UNIQUE (region, realm_slug, name_slug)
        )",
        "ALTER TABLE {$p}guilds ADD COLUMN IF NOT EXISTS member_count INT",
        "ALTER TABLE {$p}guilds ADD COLUMN IF NOT EXISTS achievement_points BIGINT",
        "ALTER TABLE {$p}guilds ADD COLUMN IF NOT EXISTS crest_emblem TEXT",
        "ALTER TABLE {$p}guilds ADD COLUMN IF NOT EXISTS crest_bg TEXT",
        "ALTER TABLE {$p}guilds ADD COLUMN IF NOT EXISTS crest_emblem_url TEXT",
        "ALTER TABLE {$p}guilds ADD COLUMN IF NOT EXISTS last_scan_at BIGINT",
        "ALTER TABLE {$p}guilds ADD COLUMN IF NOT EXISTS scanning SMALLINT NOT NULL DEFAULT 0",
        "ALTER TABLE {$p}guilds ADD COLUMN IF NOT EXISTS scan_started BIGINT",
        // Discord-Webhook der Gilde (GM konfiguriert) für Raid-Anmelde-Benachrichtigungen.
        "ALTER TABLE {$p}guilds ADD COLUMN IF NOT EXISTS discord_webhook_url TEXT",
        "CREATE TABLE IF NOT EXISTS {$p}characters (
            guild_id BIGINT NOT NULL,
            realm_slug VARCHAR(128) NOT NULL,
            name_lower VARCHAR(64) NOT NULL,
            name VARCHAR(64) NOT NULL,
            class_id INT,
            level INT,
            rank INT,
            spec VARCHAR(64),
            race VARCHAR(64),
            faction VARCHAR(16),
            item_level INT,
            mythic_rating INT,
            mythic_rating_color VARCHAR(16),
            achievement_points BIGINT,
            avatar TEXT,
            main_image TEXT,
            title VARCHAR(160),
            updated_at BIGINT NOT NULL,
            PRIMARY KEY (guild_id, realm_slug, name_lower)
        )",
        "ALTER TABLE {$p}characters ADD COLUMN IF NOT EXISTS mythic_rating_color VARCHAR(16)",
        // The specialisation's id beside its name: the name is in the server's
        // language, the id in none, and Raidex Keys' group planner needs to
        // know a tank from a healer without guessing at words.
        "ALTER TABLE {$p}characters ADD COLUMN IF NOT EXISTS spec_id INT",
        "CREATE INDEX IF NOT EXISTS idx_{$p}characters_guild ON {$p}characters(guild_id, mythic_rating)",
        "CREATE TABLE IF NOT EXISTS {$p}user_guilds (
            user_id BIGINT NOT NULL,
            guild_id BIGINT NOT NULL,
            char_name VARCHAR(64),
            char_realm VARCHAR(128),
            added_at BIGINT NOT NULL,
            PRIMARY KEY (user_id, guild_id)
        )",
        "ALTER TABLE {$p}user_guilds ADD COLUMN IF NOT EXISTS char_realm VARCHAR(128)",
        "CREATE TABLE IF NOT EXISTS {$p}raids (
            id BIGSERIAL PRIMARY KEY,
            guild_id BIGINT NOT NULL,
            title VARCHAR(200) NOT NULL,
            instance VARCHAR(200),
            difficulty VARCHAR(32),
            image TEXT,
            starts_at BIGINT NOT NULL,
            duration_min INT NOT NULL DEFAULT 120,
            description TEXT,
            max_size INT NOT NULL DEFAULT 20,
            created_by BIGINT,
            created_by_name VARCHAR(64),
            created_by_is_lead SMALLINT NOT NULL DEFAULT 0,
            created_at BIGINT NOT NULL
        )",
        "ALTER TABLE {$p}raids ADD COLUMN IF NOT EXISTS created_by_name VARCHAR(64)",
        "ALTER TABLE {$p}raids ADD COLUMN IF NOT EXISTS created_by_is_lead SMALLINT NOT NULL DEFAULT 0",
        "ALTER TABLE {$p}raids ADD COLUMN IF NOT EXISTS created_by_is_gm SMALLINT NOT NULL DEFAULT 0",
        "ALTER TABLE {$p}raids ADD COLUMN IF NOT EXISTS created_by_is_qm SMALLINT NOT NULL DEFAULT 0",
        // Unratbarer öffentlicher Share-Token (Discord-Link-Preview); lazy befüllt.
        "ALTER TABLE {$p}raids ADD COLUMN IF NOT EXISTS share_token VARCHAR(32)",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_{$p}raids_share ON {$p}raids(share_token)",
        // ID der editierbaren Discord-Live-Nachricht dieses Raids (Webhook-Message).
        "ALTER TABLE {$p}raids ADD COLUMN IF NOT EXISTS discord_message_id VARCHAR(40)",
        // Mindest-Raidgröße (Default 10, >0). Max bleibt optional (0 = kein Limit).
        "ALTER TABLE {$p}raids ADD COLUMN IF NOT EXISTS min_size INT NOT NULL DEFAULT 10",
        "CREATE INDEX IF NOT EXISTS idx_{$p}raids_guild ON {$p}raids(guild_id, starts_at)",
        // Share-Links: ein unratbarer Key pro Inhalts-Stand. Ändert sich der Raid
        // (content_sig), gibt es einen neuen Key → Discord & Co. unfurlen frisch;
        // bei gleichem Inhalt wird derselbe Key wiederverwendet (keine Proliferation).
        "CREATE TABLE IF NOT EXISTS {$p}raid_shares (
            token VARCHAR(32) PRIMARY KEY,
            raid_id BIGINT NOT NULL,
            content_sig VARCHAR(16) NOT NULL DEFAULT '',
            created_at BIGINT NOT NULL
        )",
        "CREATE INDEX IF NOT EXISTS idx_{$p}raid_shares_lookup ON {$p}raid_shares(raid_id, content_sig)",
        "CREATE TABLE IF NOT EXISTS {$p}signups (
            id BIGSERIAL PRIMARY KEY,
            raid_id BIGINT NOT NULL,
            user_id BIGINT NOT NULL,
            char_name VARCHAR(64),
            char_realm VARCHAR(64),
            char_class VARCHAR(64),
            role VARCHAR(16) NOT NULL,
            status VARCHAR(16) NOT NULL DEFAULT 'confirmed',
            note TEXT,
            is_alt SMALLINT NOT NULL DEFAULT 0,
            created_at BIGINT NOT NULL,
            UNIQUE (raid_id, user_id)
        )",
        // Multiple characters per user (main + alts). Drop the old one-per-user
        // constraint and key uniqueness on the character instead.
        "ALTER TABLE {$p}signups ADD COLUMN IF NOT EXISTS is_alt SMALLINT NOT NULL DEFAULT 0",
        "ALTER TABLE {$p}signups DROP CONSTRAINT IF EXISTS {$p}signups_raid_id_user_id_key",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_{$p}signups_char ON {$p}signups(raid_id, user_id, char_name, char_realm)",
        // Per-guild custom raid guides (the standard method.gg/Wowhead/buffed links
        // are generated globally in code; this table holds guild-specific extras).
        "CREATE TABLE IF NOT EXISTS {$p}guides (
            id BIGSERIAL PRIMARY KEY,
            guild_id BIGINT NOT NULL,
            instance VARCHAR(200) NOT NULL,
            site VARCHAR(32) NOT NULL,
            lang VARCHAR(8),
            title VARCHAR(200) NOT NULL,
            url TEXT NOT NULL,
            favicon TEXT,
            created_by BIGINT,
            created_at BIGINT NOT NULL
        )",
        "ALTER TABLE {$p}guides ADD COLUMN IF NOT EXISTS favicon TEXT",
        // raid_id NULL → guide gilt für alle Termine der Instanz; gesetzt → nur dieser Kalendereintrag.
        "ALTER TABLE {$p}guides ADD COLUMN IF NOT EXISTS raid_id BIGINT",
        "CREATE INDEX IF NOT EXISTS idx_{$p}guides_guild ON {$p}guides(guild_id, instance)",
        // Quartiermeister-Overrides der System-Guides: ausblenden oder Titel/URL ersetzen.
        "CREATE TABLE IF NOT EXISTS {$p}guide_defaults (
            guild_id BIGINT NOT NULL,
            instance VARCHAR(200) NOT NULL,
            def_key VARCHAR(32) NOT NULL,
            hidden SMALLINT NOT NULL DEFAULT 0,
            title VARCHAR(200),
            url TEXT,
            updated_by BIGINT,
            updated_at BIGINT NOT NULL,
            PRIMARY KEY (guild_id, instance, def_key)
        )",
        // Quartiermeister: appointed by GM/raidleads, may manage the guild's
        // guides and the "Aktuelles" cards.
        "CREATE TABLE IF NOT EXISTS {$p}quartermasters (
            guild_id BIGINT NOT NULL,
            realm_slug VARCHAR(128) NOT NULL,
            name_lower VARCHAR(64) NOT NULL,
            display_name VARCHAR(64),
            appointed_by BIGINT,
            appointed_at BIGINT NOT NULL,
            PRIMARY KEY (guild_id, realm_slug, name_lower)
        )",
        "CREATE TABLE IF NOT EXISTS {$p}device_tokens (
            id BIGSERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL,
            token TEXT NOT NULL UNIQUE,
            platform VARCHAR(16) NOT NULL,
            created_at BIGINT NOT NULL
        )",
        "CREATE INDEX IF NOT EXISTS idx_{$p}device_tokens_user ON {$p}device_tokens(user_id)",
        // UI language of the device (en/de), which its pushes are written in.
        "ALTER TABLE {$p}device_tokens ADD COLUMN IF NOT EXISTS lang VARCHAR(8)",
        "CREATE TABLE IF NOT EXISTS {$p}reloads (
            user_id BIGINT NOT NULL,
            at BIGINT NOT NULL
        )",
        "CREATE INDEX IF NOT EXISTS idx_{$p}reloads_user ON {$p}reloads(user_id, at)",
        "CREATE TABLE IF NOT EXISTS {$p}raidleads (
            guild_id BIGINT NOT NULL,
            realm_slug VARCHAR(128) NOT NULL,
            name_lower VARCHAR(64) NOT NULL,
            display_name VARCHAR(64),
            appointed_by BIGINT,
            appointed_at BIGINT NOT NULL,
            PRIMARY KEY (guild_id, realm_slug, name_lower)
        )",
        "CREATE TABLE IF NOT EXISTS {$p}widgets (
            guild_id BIGINT NOT NULL,
            \"key\" VARCHAR(64) NOT NULL,
            title VARCHAR(200) NOT NULL,
            body TEXT,
            icon VARCHAR(16),
            accent VARCHAR(32),
            updated_by BIGINT,
            updated_at BIGINT NOT NULL,
            PRIMARY KEY (guild_id, \"key\")
        )",
        "ALTER TABLE {$p}widgets ADD COLUMN IF NOT EXISTS sort INT NOT NULL DEFAULT 0",
        // sort = Zeile, col = Spalte innerhalb der Zeile (0..2) → bis zu 3 nebeneinander.
        "ALTER TABLE {$p}widgets ADD COLUMN IF NOT EXISTS col SMALLINT NOT NULL DEFAULT 0",
        "ALTER TABLE {$p}widgets ADD COLUMN IF NOT EXISTS hidden SMALLINT NOT NULL DEFAULT 0",
        // system=1: nur Layout/Sichtbarkeit für eine Live-Systemkarte (Key 'sys:<eventkey>'),
        // Inhalt kommt live; system=0: normale Themen-Karte.
        "ALTER TABLE {$p}widgets ADD COLUMN IF NOT EXISTS system SMALLINT NOT NULL DEFAULT 0",
        // markdown=1: gesamter Text als (rudimentäres) Markdown; 0: nur Links werden erkannt.
        "ALTER TABLE {$p}widgets ADD COLUMN IF NOT EXISTS markdown SMALLINT NOT NULL DEFAULT 0",
        // Keys for GET /stats, generated in the app. Only the SHA-256 is kept -
        // the plain token is shown once and is not recoverable; prefix is what
        // tells two of them apart in the list.
        "CREATE TABLE IF NOT EXISTS {$p}stats_tokens (
            id BIGSERIAL PRIMARY KEY,
            label VARCHAR(120) NOT NULL,
            token_hash CHAR(64) NOT NULL UNIQUE,
            prefix VARCHAR(16) NOT NULL,
            created_by BIGINT,
            created_at BIGINT NOT NULL,
            last_used_at BIGINT
        )",
        // Raidex Keys: MDT routes stored from the desktop app (keys.php). guild_id
        // NULL means only the owner sees it; otherwise every member of that guild.
        "CREATE TABLE IF NOT EXISTS {$p}key_routes (
            id BIGSERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL,
            guild_id BIGINT,
            uid VARCHAR(64),
            map_id INT NOT NULL,
            name VARCHAR(128) NOT NULL,
            pulls INT NOT NULL,
            forces REAL NOT NULL,
            mdt TEXT NOT NULL,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL,
            UNIQUE (user_id, uid)
        )",
        "CREATE INDEX IF NOT EXISTS {$p}key_routes_guild ON {$p}key_routes (guild_id)",
        // Raidex Keys: the newest keystone seen per character (keys.php). realm_key
        // is the realm reduced to letters (realm_key()), so the addon's display
        // name, a guild key's spaceless form and Blizzard's slug meet. map_id NULL:
        // seen without a key. expires_at: the weekly reset after the observation.
        "CREATE TABLE IF NOT EXISTS {$p}keystones (
            realm_key VARCHAR(128) NOT NULL,
            name_lower VARCHAR(64) NOT NULL,
            name VARCHAR(64) NOT NULL,
            realm VARCHAR(128) NOT NULL,
            map_id INT,
            level INT,
            rating INT,
            source VARCHAR(8) NOT NULL,
            reported_by BIGINT NOT NULL,
            observed_at BIGINT NOT NULL,
            expires_at BIGINT NOT NULL,
            received_at BIGINT NOT NULL,
            PRIMARY KEY (realm_key, name_lower)
        )",
        "CREATE INDEX IF NOT EXISTS {$p}keystones_expires ON {$p}keystones (expires_at)",
        // Raidex Keys connecting to an account (keys.php): the app's device code
        // (only its hash), the code the website shows, and - once approved - the
        // session the app fetches once.
        "CREATE TABLE IF NOT EXISTS {$p}key_connects (
            device_hash CHAR(64) PRIMARY KEY,
            user_code VARCHAR(9) NOT NULL UNIQUE,
            ip VARCHAR(64) NOT NULL,
            status VARCHAR(8) NOT NULL,
            user_id BIGINT,
            session_id CHAR(36),
            created_at BIGINT NOT NULL,
            expires_at BIGINT NOT NULL
        )",
        // The characters on a user's Battle.net account, kept at each successful
        // fetch: 'self' keys are taken only for these (keys.php).
        "CREATE TABLE IF NOT EXISTS {$p}account_characters (
            user_id BIGINT NOT NULL,
            realm_key VARCHAR(128) NOT NULL,
            name_lower VARCHAR(64) NOT NULL,
            updated_at BIGINT NOT NULL,
            PRIMARY KEY (user_id, realm_key, name_lower)
        )",
        // Language of what Raidex sends to the whole guild (Discord, raid card,
        // demo raids). Existing guilds get 'de': every one of them was created
        // by German users before Raidex had an English UI. New guilds get 'en'
        // from the default set after it.
        "ALTER TABLE {$p}guilds ADD COLUMN IF NOT EXISTS lang VARCHAR(8) NOT NULL DEFAULT 'de'",
        "ALTER TABLE {$p}guilds ALTER COLUMN lang SET DEFAULT 'en'",
        // The race's id beside its name, like spec_id: the roster is scanned in
        // one language and shown in each reader's (game_name() in blizzard.php).
        "ALTER TABLE {$p}characters ADD COLUMN IF NOT EXISTS race_id INT",
        // Where the applied fingerprint is recorded. Part of the schema, so the
        // fingerprint covers it like everything else. Column names avoid
        // reserved words on purpose: "key" needs quoting that differs between
        // PostgreSQL and MySQL, and this file serves both.
        "CREATE TABLE IF NOT EXISTS {$p}schema_version (
            id SMALLINT PRIMARY KEY,
            fingerprint VARCHAR(64) NOT NULL,
            applied_at BIGINT NOT NULL
        )",
    ];
}

// Renames that must happen before the statements above, so a CREATE does not
// claim the new name first and leave the old table beside it.
//
// Still tolerant of failure, but no longer for the old reason: the race was two
// concurrent REQUESTS both seeing the old table, one winning the rename and the
// other erroring out mid-request. Only a migration runs these now, and two of
// those at once is a mistake rather than normal traffic. What remains is the
// ordinary case -- already renamed, so IF EXISTS finds nothing.
function db_schema_renames(): array {
    $p = cfg()['db_prefix'];
    return [
        "ALTER TABLE IF EXISTS {$p}guide_managers RENAME TO {$p}quartermasters",
        // RENAME TO keeps the constraint's old name, which then shows up in
        // every duplicate-key error from this table. Cosmetic, hence equally
        // tolerant.
        "ALTER TABLE {$p}quartermasters RENAME CONSTRAINT {$p}guide_managers_pkey TO {$p}quartermasters_pkey",
    ];
}

// What this code believes the schema to be. Derived from the statements
// themselves rather than a number someone must remember to raise -- a forgotten
// version bump is exactly the failure this is meant to catch.
function db_schema_fingerprint(): string {
    return hash('sha256', implode("\n", array_merge(db_schema_renames(), db_schema_statements())));
}

// What the database says was last applied, or null if it has never been
// migrated. The table may not exist yet; that is an answer, not an error.
function db_schema_applied(PDO $pdo): ?string {
    $p = cfg()['db_prefix'];
    try {
        $row = $pdo->query("SELECT fingerprint FROM {$p}schema_version WHERE id = 1")->fetch();
    } catch (Throwable $e) {
        return null;
    }
    return $row ? (string) $row['fingerprint'] : null;
}

// Refuses to serve on a schema this code was not written against. Deliberately
// loud: the alternative is a query failing deep inside whichever endpoint ran
// first, with "column does not exist", which reads like a bug in that endpoint.
//
// Throws rather than answering, so the front controller decides the shape. The
// message starts with SCHEMA_OUTDATED so it can be told from a genuine fault
// without matching on an exception class.
const SCHEMA_OUTDATED = 'SCHEMA_OUTDATED';

function db_schema_assert(PDO $pdo): void {
    if (db_schema_applied($pdo) === db_schema_fingerprint()) return;
    throw new RuntimeException(SCHEMA_OUTDATED . ': run php api/migrate.php on the server');
}

// Applies the schema. The ONLY caller is api/migrate.php.
function db_migrate(): void {
    $p = cfg()['db_prefix'];
    db_migrating(true);
    try {
        $pdo = db();
        foreach (db_schema_renames() as $s) {
            try { $pdo->exec($s); }
            catch (Throwable $e) { /* already carries the new name */ }
        }
        foreach (db_schema_statements() as $s) $pdo->exec($s);

        // One-off cleanup: drop the old placeholder widgets (Housing / Timewalking /
        // Notiz). "Aktuelles" is now driven by live + computed events instead.
        // It ran on every request before; now it runs when the schema is applied,
        // which is what "one-off" was meant to say.
        $pdo->exec("DELETE FROM {$p}widgets WHERE \"key\" IN ('housing','timewalk','note')");

        // Recorded last, so an interrupted migration leaves the fingerprint
        // stale rather than claiming work it did not finish. DELETE + INSERT
        // rather than an upsert: ON CONFLICT and ON DUPLICATE KEY are not the
        // same statement, and this file serves both drivers.
        $pdo->exec("DELETE FROM {$p}schema_version WHERE id = 1");
        $st = $pdo->prepare("INSERT INTO {$p}schema_version (id, fingerprint, applied_at) VALUES (1, ?, ?)");
        $st->execute([db_schema_fingerprint(), now_ms()]);
    } finally {
        db_migrating(false);
    }
}
