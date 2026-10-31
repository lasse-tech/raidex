<?php
// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: MIT
/**
 * Applies the database schema. The only thing that may.
 *
 *     php api/migrate.php            apply, then say what happened
 *     php api/migrate.php --check    say whether it would, change nothing
 *
 * Run it after deploying a change to db_schema_statements(). Until it has run,
 * the API answers 503 with "SCHEMA_OUTDATED" rather than failing on the first
 * query that happens to need the new column.
 *
 * This used to happen on every request from index.php: the whole statement list
 * before routing, whether or not the request touched the database at all. It
 * was idempotent, so it never broke -- it just cost every caller a round of
 * ACCESS EXCLUSIVE locks to re-establish a schema that had not changed since
 * the last deployment.
 *
 * Refuses to run over HTTP. api/ is inside the document root, and a migration
 * endpoint reachable from the network is a way to lock a live site's tables
 * from outside. The nginx config denies the other library files by name; this
 * guard does not depend on anyone remembering to add this one.
 */
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/lib.php';
require __DIR__ . '/db.php';

$check = in_array('--check', $argv, true);

// Reading the state must not trip the guard in db(): not matching yet is the
// whole reason this program exists.
db_migrating(true);
$pdo = db();
$applied = db_schema_applied($pdo);
$wanted = db_schema_fingerprint();
db_migrating(false);

if ($applied === $wanted) {
    fwrite(STDOUT, "Schema is current ({$wanted}).\n");
    exit(0);
}

$was = $applied === null ? 'never migrated' : "was {$applied}";
if ($check) {
    fwrite(STDOUT, "Schema is OUT OF DATE ({$was}, wanted {$wanted}).\n");
    // Exit 1 so a deploy can ask without reading the text.
    exit(1);
}

fwrite(STDOUT, "Applying schema ({$was})...\n");
db_migrate();
fwrite(STDOUT, "Applied {$wanted}.\n");
