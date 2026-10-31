# SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Raidex: build and checks. Raidex runs as one hosted service (raidex.app);
# this source is published under the AGPL, not as a self-hosting kit.

# The targets every Makefile of ours documents; make lint checks it.
REQUIRED_TARGETS := clean distclean debug install uninstall deploy lint
# The documented variables, handed to make-help.awk with make's values.
HELP_VARS = $(shell sed -n 's/^## \([A-Z][A-Z0-9_]*\): .*/\1/p' $(firstword $(MAKEFILE_LIST)))

## NPM: npm binary
NPM ?= npm
## PHP: php binary for make lint
PHP ?= php
## RAIDEX_API: address of the Raidex server make dev proxies /api to
RAIDEX_API ?=

.DEFAULT_GOAL := help
.PHONY: help web-deps debug install uninstall deploy dev lint clean distclean

## help: list targets and variables
help:
	@$(foreach v,$(HELP_VARS),$(v)='$($(v))') awk -f scripts/make-help.awk $(firstword $(MAKEFILE_LIST))

##@ Build

web-deps:
	$(NPM) ci --prefix web

## debug: development build of the web app in web/dist
debug: web-deps
	cd web && $(NPM) exec -- vite build --mode development

## install: release build of the web app in web/dist
install: web-deps
	$(NPM) run build --prefix web

## uninstall: remove what install created (web/dist, web/node_modules)
uninstall:
	rm -rf web/dist web/node_modules

# Public project: nothing is installed on or deployed to a server from here.
## deploy: nothing to deploy for users; prints where building is described
deploy:
	@echo "Nothing to deploy: Raidex is a hosted service (https://raidex.app)."
	@echo "Building from source: README.md, section Build."

## dev: web app on :5173 against the server in RAIDEX_API
dev: web-deps
	@test -n "$(RAIDEX_API)" || { echo "usage: make dev RAIDEX_API=https://raidex.example.org"; exit 1; }
	cd web && RAIDEX_API='$(RAIDEX_API)' $(NPM) run dev

##@ Check

# The web build is part of it: vite fails on any warning.
## lint: Makefile comments, PHP, ad-blocker names, en/de dictionaries, web build (blocker)
lint: web-deps
	awk -v required="$(REQUIRED_TARGETS)" -f scripts/make-lint.awk $(firstword $(MAKEFILE_LIST))
	@for f in $$(find api -name '*.php'); do $(PHP) -l "$$f" >/dev/null || exit 1; done
	web/lint-adblock.sh
	node scripts/i18n-check.mjs api/i18n web/src/i18n mobile/src/i18n
	$(NPM) run build --prefix web

##@ Clean

## clean: remove build output
clean:
	rm -rf web/dist web/dist-dev

## distclean: clean plus installed dependencies
distclean: clean
	rm -rf web/node_modules mobile/node_modules
