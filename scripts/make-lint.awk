# SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
# SPDX-License-Identifier: MIT
#
# make-lint.awk: checks the comments `make help` lists (part of `make lint`).
#   awk -v required="clean lint …" -f scripts/make-lint.awk Makefile
#   awk -v required="clean lint …" -v bat=1 -f scripts/make-lint.awk Makefile.bat
# Makefile: every documented target or variable sits on the line right below
# its "## name: text"; every variable set with ?= is documented; one line of at
# most 100 characters each, no continuation lines. Makefile.bat: the same
# length rule for "rem name: text". Both: every required target is documented.

function fail(msg) {
	printf "%s:%d: %s\n", FILENAME, FNR, msg
	failed = 1
}

{ sub(/\r$/, "") }

# The line below a "## name:" must define it.
pending != "" {
	if (pending ~ /^[A-Z]/) {
		if ($0 !~ "^" pending "[ \t]*[?]=")
			fail("## " pending ": is not right above the variable " pending)
	} else if ($0 !~ "^" pending ":")
		fail("## " pending ": is not right above the target " pending)
	pending = ""
}

!bat && /^##[ \t][ \t]/ {
	fail("continuation line; the description is one line")
}

!bat && /^## [A-Za-z][A-Za-z0-9_-]*: / {
	if (length($0) > 100)
		fail("longer than 100 characters")
	pending = $2
	sub(/:$/, "", pending)
	documented[pending] = 1
}

!bat && /^[A-Z][A-Z0-9_]*[ \t]*[?]=/ {
	name = $0
	sub(/[ \t]*[?]=.*/, "", name)
	if (previous !~ "^## " name ": ")
		fail(name " is set with ?= but has no \"## " name ": text\" above it")
}

bat && /^rem [a-z][a-z0-9-]*: / {
	if (length($0) > 100)
		fail("longer than 100 characters")
	name = $2
	sub(/:$/, "", name)
	documented[name] = 1
}

{ previous = $0 }

END {
	n = split(required, need, " ")
	for (i = 1; i <= n; i++)
		if (!(need[i] in documented)) {
			printf "%s: required target %s is not documented\n", FILENAME, need[i]
			failed = 1
		}
	exit failed
}
