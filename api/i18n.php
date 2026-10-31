<?php
// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: AGPL-3.0-or-later
// Server-generated text in English and German: api/i18n/<lang>.json, same
// shape as the clients' dictionaries (scripts/i18n-check.mjs keeps them in
// step). A request is answered in its Accept-Language, a push in the language
// its device registered with; anything else gets English.

const I18N_LANGS = ['en', 'de'];
const I18N_FALLBACK = 'en';

function normalize_lang(?string $tag): ?string {
    $primary = strtolower(explode('-', str_replace('_', '-', trim((string) $tag)))[0]);
    return in_array($primary, I18N_LANGS, true) ? $primary : null;
}

// First supported language in Accept-Language, by q value.
function request_lang(): string {
    static $lang = null;
    if ($lang !== null) return $lang;
    $best = I18N_FALLBACK; $bestQ = -1.0;
    foreach (explode(',', (string) ($_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? '')) as $i => $part) {
        $bits = explode(';', trim($part));
        $l = normalize_lang($bits[0]);
        if ($l === null) continue;
        $q = 1.0;
        foreach (array_slice($bits, 1) as $p) {
            if (str_starts_with(trim($p), 'q=')) $q = (float) substr(trim($p), 2);
        }
        $q -= $i / 1000; // equal q: earlier wins
        if ($q > $bestQ) { $best = $l; $bestQ = $q; }
    }
    return $lang = $best;
}

function i18n_dict(string $lang): array {
    static $dicts = [];
    if (!isset($dicts[$lang])) {
        $raw = @file_get_contents(__DIR__ . "/i18n/$lang.json");
        $dicts[$lang] = is_string($raw) ? (json_decode($raw, true) ?: []) : [];
    }
    return $dicts[$lang];
}

function i18n_lookup(array $dict, string $key): ?string {
    $node = $dict;
    foreach (explode('.', $key) as $part) {
        if (!is_array($node) || !array_key_exists($part, $node)) return null;
        $node = $node[$part];
    }
    return is_string($node) ? $node : null;
}

// tr('push.raidCancelled.body', ['title' => $t], 'de'); $lang null = request_lang().
function tr(string $key, array $params = [], ?string $lang = null): string {
    $lang = normalize_lang($lang) ?? request_lang();
    $text = i18n_lookup(i18n_dict($lang), $key) ?? i18n_lookup(i18n_dict(I18N_FALLBACK), $key) ?? $key;
    return preg_replace_callback('/\{\{\s*(\w+)\s*\}\}/', fn($m) => array_key_exists($m[1], $params) ? (string) $params[$m[1]] : $m[0], $text);
}
