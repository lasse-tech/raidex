# Raidex

Guild app for World of Warcraft: Battle.net login, character data, raid calendar
with sign-up, guild roster and a dashboard. A web app and a native mobile app
share one PHP backend.

Live at <https://raidex.app>. Desktop companion:
[Raidex Keys](https://github.com/lasse-tech/raidex-keys).

## Parts

| Path | Stack | Role |
|---|---|---|
| `api/` | PHP 8.4, PostgreSQL | Backend: front controller `api/index.php`, Battle.net OAuth, Blizzard API, push, Discord |
| `web/` | React 18, Vite | Single-page web app, served from the domain root |
| `mobile/` | Expo, React Native | Android and iOS app; talks to `https://raidex.app/api` (`mobile/src/api.js`) |

## Build

```sh
make install                                      # web/dist, release build
make dev RAIDEX_API=https://raidex.example.org    # web app on :5173 against a running server
make lint                                         # a failed lint is a blocker
make help                                         # every target and variable
```

Requirements: Node.js 20 or later with npm, PHP 8.4 (for `make lint`).

## Hosting

Raidex is one hosted service, <https://raidex.app>. The source is published
as open source under MIT; it is not a self-hosting kit, and there are no
install or update guides for running your own server. `make deploy` deploys
nothing.

## Configuration

The backend reads `api/config.php` (from `api/config.sample.php`) and
`api/config.local.php` (from `api/config.local.sample.php`: Battle.net
credentials, admin BattleTags). Neither file belongs in git.

## Support

[Buy me a coffee](https://buymeacoffee.com/gossardla)

## Licence

`MIT`, see [`LICENSE`](LICENSE).

Third-party parts, each under its own licence:

| Part | Licence | Where |
|---|---|---|
| Oxanium, Chakra Petch, JetBrains Mono, Orbitron | SIL Open Font License 1.1 | web: self-hosted in `web/src/fonts/` (Fontsource, OFL beside each family); mobile: bundled via `@expo-google-fonts/*` |
| Material Design Icons (`@mdi/js`) | Apache-2.0 | web |
| `@expo/vector-icons` | MIT | mobile |
| React, React Router, Vite, Expo, React Native | MIT | web, mobile |

World of Warcraft and Battle.net are trademarks of Blizzard Entertainment, Inc.;
Raidex is not affiliated with Blizzard.

---

© 2026 lasse tech, Lars Gossard · <lars@lasse-tech.de>
