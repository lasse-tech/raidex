# SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# make-help.awk: `make help` from the Makefile's comments.
#   ##@ Section        a heading, in file order
#   ## target: text    the target on the next line
#   ## NAME: text      the variable on the next line; its value comes from the
#                      environment, which `make help` fills with make's values
# A target defined twice (once per platform) is listed once.

/^##@ / {
	sub(/^##@ /, "")
	printf "\n%s\n", $0
	next
}

/^## [a-z][a-z0-9-]*: / {
	name = $2
	sub(/:$/, "", name)
	text = $0
	sub(/^## [^:]*: /, "", text)
	if (!(name in seen))
		printf "  %-20s %s\n", name, text
	seen[name] = 1
	next
}

/^## [A-Z][A-Z0-9_]*: / {
	name = $2
	sub(/:$/, "", name)
	text = $0
	sub(/^## [^:]*: /, "", text)
	vars[++n] = name
	about[name] = text
	next
}

END {
	if (n == 0)
		exit
	printf "\nVariables (make NAME=value …)\n"
	for (i = 1; i <= n; i++) {
		v = vars[i]
		value = ENVIRON[v]
		if (value == "")
			value = "unset"
		printf "  %-20s %s [%s]\n", v, about[v], value
	}
}
