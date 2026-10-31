#!/bin/sh
# SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
# SPDX-License-Identifier: MIT
# Fails on names an ad blocker eats.
#
# Ad blockers match on the request path and on class names, not on who is being
# advertised: EasyList blocks /banners/, /ads/, "promo", "sponsor" and the IAB
# sizes outright, and uBlock Origin then answers the request with a transparent
# pixel. The image is gone while everything around it keeps working, which is a
# miserable thing to debug -- it cost us the landing page's addon promos once.
# Our own docroot and our own products are no exception.
#
# A word counts only as a whole segment, so "addons", "download" and "shadow"
# stay clean. Quoting a forbidden class name *with its dot* in a CSS comment
# trips this too; write it without the dot.
set -e
cd "$(dirname "$0")"

WORDS='ads?|advert|banner|promo|sponsor'
SIZES='728x90|300x250|160x600|300x600|320x50'
PATH_RE="(^|[/_.-])($WORDS)([/_.-]|\$)|($SIZES)"
NAME_RE="^[.]?([a-z0-9]+-)*($WORDS)(-[a-z0-9]+)*\$"

fail=0
report() {
  [ -z "$2" ] && return 0
  printf 'adblock: %s\n' "$1"
  printf '%s\n' "$2" | sed 's/^/  /'
  fail=1
}

# Anything served from the docroot: the URL path is what gets matched.
report 'files ad blockers block by path' \
  "$(find public -type f | grep -Ei "$PATH_RE" || true)"

# CSS class selectors: cosmetic filters hide elements by class name alone.
report 'CSS classes cosmetic filters hide' \
  "$(grep -rhoE '\.[a-zA-Z][a-zA-Z0-9_-]*' src --include='*.css' \
     | sort -u | grep -Ei "$NAME_RE" || true)"

# Class names that never reach the stylesheet.
report 'class names cosmetic filters hide' \
  "$(grep -rhoE 'className=[{]?["'\''][^"'\'']*' src --include='*.jsx' \
     | sed 's/.*["'\'']//' | tr ' ' '\n' | sort -u | grep -Ei "$NAME_RE" || true)"

# Asset paths built in code, template literals included.
report 'asset paths ad blockers block' \
  "$(grep -rhoE '/(img|assets|media)/[a-zA-Z0-9@/_.${}-]+' src \
     | sort -u | grep -Ei "$PATH_RE" || true)"

[ "$fail" -eq 0 ] && { echo 'web: no names ad blockers eat'; exit 0; }
echo 'Rename these -- see "Addon promos on the landing page" in README.md.' >&2
exit 1
