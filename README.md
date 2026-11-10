# Aterno for Gladys Assistant

External integration for [Gladys Assistant](https://gladysassistant.com) that
controls **Aterno radiators** through the **Eco Aterno box**, over the local
network or through the cloud.

> Community project, not affiliated with nor endorsed by Aterno. First
> version, developed against a simulated box: see [Status](#status).

## Features

- One Gladys device per radiator paired with the box: target temperature,
  room temperature, heating on/off, frost protection, boost (bathroom
  models), open-window detection, presence detection.
- **Local and cloud**: local network first when the address of the box is
  known, cloud relay otherwise, automatic fallback with a "degraded" badge,
  automatic return to the preferred channel.
- **Live updates**: the box pushes every change (app, thermostat) as it
  happens; a periodic full read is the safety net.
- **Scene triggers**: radiator mode changed, radiator fault, box connection
  changed.
- **Scene actions**: set the target temperature, change the heating mode,
  start/stop the boost, refresh — for one radiator or all of them.
- **Dashboard widgets**: an overview of the installation and a per-radiator
  card with quick actions.
- **Four languages**: English, French, German, Spanish — manifest, messages
  and documentation.

User documentation: [English](docs/en.md) · [Français](docs/fr.md) ·
[Deutsch](docs/de.md) · [Español](docs/es.md).

## Requirements

- Gladys Assistant 5.1.0 or later.
- An Eco Aterno box with its radiators paired in the Eco Aterno app, its MAC
  address (back of the box) and its password (chosen in the app).

## How it works

The Eco Aterno box is a Delta Dore Tydom gateway under the Aterno brand, and
the Eco Aterno app embeds the Tydom client library. The integration speaks
the same protocol as the app:

- a WebSocket to the box (`wss://<box>/mediation/client?mac=<MAC>&appli=1`)
  or to the cloud relay (`mediation.tydom.com`), authenticated with HTTP
  Digest (user = MAC address, password = the one of the box);
- HTTP/1.1 messages inside the WebSocket frames, in both directions:
  `GET /configs/file`, `GET /devices/meta`, `GET /devices/data`,
  `PUT /devices/<id>/endpoints/<id>/data`, and `PUT /devices/data` pushed by
  the box on every change.

The protocol is not documented by the manufacturer. It is known from the
open-source projects that implement it for Delta Dore hardware —
[tydom2mqtt](https://github.com/fmartinou/tydom2mqtt),
[hass-deltadore-tydom-component](https://github.com/CyrilP/hass-deltadore-tydom-component),
[node-tydom-client](https://github.com/mgcrea/node-tydom-client) — which this
integration follows for the handshake, the framing and the heating commands.

```
index.js                          starts the SDK and the integration
src/app.js                        SDK handlers <-> bridge events (takes the Gladys client)
src/bridge.js                     the connection to the box: channel choice, fallback, retries, commands
src/radiators.js                  radiator model: box values -> state, intent -> writes (pure)
src/devices.js                    radiators as Gladys devices: discovery, states, commands
src/scenes.js                     scene triggers and scene actions
src/widgets.js                    dashboard widgets
src/i18n.js                       runtime texts in en / fr / de / es
src/config.js                     defaults + normalization of the configuration
src/tydom/client.js               WebSocket client of the box (local + cloud)
src/tydom/protocol.js             HTTP-over-WebSocket framing
src/tydom/digest.js               HTTP Digest authentication
gladys-assistant-integration.json manifest: config, actions, triggers, scene actions, widgets
docs/<lang>.md                    user documentation, re-hosted by Gladys
test/                             node --test: fake Gladys (SDK) + simulated box
```

## Status

Version 0.x. The integration is covered by tests end to end — the real
WebSocket client against a local server speaking the protocol, the whole
integration against the fake Gladys of the SDK and a simulated box — but it
has **not yet been run against a physical Eco Aterno box**. What that leaves
open:

- the exact set of values an Aterno receiver reports (the integration only
  exposes what the box declares, and only writes what it declares writable);
- the TLS handshake with the box on the local network (legacy TLS,
  self-signed certificate: handled the way the reference projects do);
- the older My Aterno box.

If you run it on real hardware, please open an issue with the integration
logs at `LOG_LEVEL=debug` (they never contain the password) — working or not.

## Development

```bash
npm install
npm test               # node --test
npm run lint           # ESLint
npm run format:check   # Prettier, as the CI runs it
npm run format         # Prettier, fix in place
```

Run it against a Gladys instance:

```bash
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="aterno" \
LOG_LEVEL=debug \
npm start
```

Check the store admission rules before a release:

```bash
npx github:GladysAssistant/integration-store .
```

## Releasing

Describe the changes under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md),
then run **Actions → Release → Run workflow** (`patch`, `minor` or `major`).
The workflow bumps the version in `package.json` and in the manifest
(`version` and `docker_image`), rolls the changelog, tags, builds the
`linux/amd64` + `linux/arm64` image to `ghcr.io/gboulvin/gladys-aterno` and
publishes the GitHub Release. Never edit the versions by hand.

For Gladys to list the integration in its store, the repository must be
public and carry the GitHub topic `gladys-assistant-integration`.

See [CLAUDE.md](CLAUDE.md) for the project rules and
[SECURITY.md](SECURITY.md) to report a vulnerability.

## License

Apache-2.0. Started from the official
[JavaScript integration template](https://github.com/GladysAssistant/integration-template-js).

Aterno and Eco Aterno are trademarks of their owner; Delta Dore and Tydom are
trademarks of Delta Dore. They are named here to describe compatibility only.
