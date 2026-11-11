# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** for **Aterno radiators**: a Node.js
service (Node 22+, ESM, no build step) that runs in its own sandboxed Docker
container, talks to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js)
and to the **Eco Aterno box** (a Delta Dore Tydom gateway under the Aterno
brand) over a WebSocket — on the local network or through the cloud relay.
Runtime dependencies: the SDK and `ws`. It started from the official
JavaScript template.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/bridge.test.js           # one file
node --test --test-name-pattern "boost"   # tests whose name matches
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store .   # store admission checks
```

The CI (`.github/workflows/ci.yml`) runs `format:check`, `lint` and `test` on
Node 22 and 24, and builds the Docker image: run the three commands before
pushing.

## Architecture

```
index.js                          starts the SDK and the integration, nothing else
src/app.js                        createApp(gladys): SDK handlers <-> bridge events
src/bridge.js                     connection to the box: channel choice, fallback, retries, commands
src/radiators.js                  radiator model, pure: box values -> state, intent -> writes
src/devices.js                    radiators as Gladys devices (discovery, states, setValue)
src/scenes.js                     scene triggers (fired) and scene actions (handled)
src/widgets.js                    dashboard widgets
src/i18n.js                       runtime texts, en / fr / de / es
src/config.js                     DEFAULT_CONFIG (mirrors the manifest defaults) + normalization
src/discovery.js                  finds the box on the LAN: mDNS scan through Gladys (scanNetwork)
src/tydom/client.js               WebSocket client of the box, local + cloud
src/tydom/protocol.js             HTTP-over-WebSocket framing (build / parse)
src/tydom/digest.js               HTTP Digest authentication
gladys-assistant-integration.json manifest: config_schema, actions, scene_*, widgets
docs/{en,fr,de,es}.md             user documentation, re-hosted by Gladys
test/helpers/fakeBox.js           simulated box; test/helpers/app.js starts the integration on it
.github/scripts/release.mjs       release helpers (manifest bump, changelog), tested in test/
```

Data flows one way each: box → `bridge` events (`status`, `radiators`,
`state`, `refreshed`) → `app.js` publishes to Gladys; Gladys handler →
`app.js` → `bridge.setTemperature / setMode / setBoost` → box. `bridge.js`
knows nothing about Gladys, `radiators.js` does no I/O.

## Rules

- **The box is the source of truth.** A state is published when the box
  reports it (push or read-back), never when a command is sent. A feature
  exists only if the endpoint carries the matching value, and a value is only
  written when the box declares it writable (`radiators.js`: `capabilities`,
  `writable`). Do not assume a value exists on every receiver.
- **Partly verified on hardware.** The protocol comes from the open-source
  Tydom implementations listed in the README, not from a vendor document. A
  user reported the cloud connection, the radiator list and a widget command
  working; the local connection and the mDNS search are not confirmed yet.
  When changing a command or a value name, check it against them, keep the
  README "Status" section honest, and never present a behaviour as confirmed
  on a physical box unless someone reported it.
- **Local discovery.** The container cannot see mDNS: the scan goes through
  Gladys (`gladys.scanNetwork('mdns')`) and only browses the service types
  declared in the manifest `network_discovery` (`MDNS_SERVICES` in
  `src/discovery.js`, kept in sync by `test/manifest.test.js`). A discovered
  address is used only once the box there accepted the MAC address and the
  password. Scans are spaced (one per minute at most): a box that is down must
  not make every retry scan the network. An address that answers is never
  replaced by a scan.
- **External ids are forever.** They are built in `devices.js` from the MAC
  address of the box and the device/endpoint ids
  (`gladys.externalIds('radiator', '<mac>-<deviceId>-<endpointId>')`), never
  from a name. Gladys keys devices, history, scenes and dashboards on them.
  The same goes for every key users store: manifest `config_schema`,
  `actions`, widget, scene trigger and scene action keys, feature keys
  (`FEATURE` in `devices.js`), and the option values of the scene fields
  (`heating` / `off` / `frost`...).
- **Secrets.** The password of the box is a `secret` field: never log it,
  never put it in a message, a state or a widget. `test/devices.test.js`
  checks the logs and the host API requests. The container rootfs is
  read-only; write only under `/data` (nothing is written today).
- **TLS.** Certificate checks are relaxed for the LOCAL channel only (the box
  serves a self-signed certificate), never for the cloud relay. See
  `SECURITY.md` before touching `LOCAL_TLS_OPTIONS`.
- **No scene loops.** A change that follows a command sent by the
  integration fires no `radiator_mode_changed` event (`commanded` flag of the
  bridge). Never fire a scene event as a consequence of a received action.
- **Four languages.** Every user-facing text exists in English, French,
  German and Spanish: manifest texts (multi-language objects, never a plain
  string), `src/i18n.js`, and `docs/<lang>.md`, kept in sync —
  `test/i18n.test.js` fails on a missing language or a lost placeholder.
  Error messages thrown to the SDK and log lines stay in English.
- **Manifest.** `test/manifest.test.js` ties it to the code (defaults,
  actions, scene and widget handlers, option values): change both sides
  together. The catalog `description` holds 10 to 100 characters per
  language. A field the older cores do not know needs a higher
  `gladys_version` minimum (`widgets`, `scene_triggers`, `scene_actions`:
  5.1.0; `keywords`, `countries`: 5.3.0).
- **Widgets.** Validate every content with `validateWidgetContent` in the
  tests (`[]` = rendered as sent). One button per action key in a content;
  button `params` only identify the radiator, what a button does is decided
  by its key.
- **Versions belong to the Release workflow** (Actions → Release). Never edit
  `version` in `package.json` or in the manifest, nor the `docker_image` tag,
  by hand. `test/manifest.test.js` checks they agree.
- **Changelog.** Every user-visible change adds a line under
  `## [Unreleased]` in `CHANGELOG.md` (`### Added`, `Changed`, `Fixed`,
  `Removed`, `Security`). Never write a version heading: the Release workflow
  moves the section, and it becomes the notes of the GitHub Release.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain
  why, in English. Tests never touch the network beyond the loopback
  interface (`test/client.test.js`); timers of the bridge are unref'd, so a
  test that waits for a retry keeps the event loop alive itself.
