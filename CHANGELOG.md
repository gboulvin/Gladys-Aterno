# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [0.2.0] - 2026-11-11

### Added

- The integration finds the Eco Aterno box on the local network by itself:
  with the local IP address left empty, Gladys looks for the box (mDNS), the
  integration checks it is yours with the MAC address and the password, and
  connects locally instead of through the cloud. Gladys shows this network
  search on the install screen of the new version.
- When the box gets a new address from the router, the integration finds it
  again and stays local. An address entered by hand that stops answering is
  worked around the same way, with a hint in the logs to update it.
- "Test the connection" tells the local address in use, and suggests
  reserving it in the router when it was found automatically.

### Changed

- The logs tell the address of the box when connected locally.

## [0.1.0] - 2026-11-10

First version of the Aterno integration. It is covered by tests against a
simulated box but has not been run on a physical Eco Aterno box yet: feedback
on real hardware is welcome.

### Added

- Control of Aterno radiators through the Eco Aterno box: one Gladys device
  per radiator, with target temperature, room temperature, heating on/off,
  frost protection, boost (bathroom models), open-window detection and
  presence detection — each one only when the radiator reports it.
- Local and cloud connections. With the local IP address of the box, the
  integration follows the "Prefer the local connection" toggle, falls back on
  the other channel when the preferred one does not answer (badge flagged
  degraded, with the reason), and returns to it once it answers again.
  Without the address, it goes through the cloud.
- Live updates: changes made from the Eco Aterno app or a thermostat reach
  Gladys as the box reports them, with a periodic full read as a safety net.
- Scene triggers: radiator mode changed, radiator fault, box connection
  changed.
- Scene actions: set the target temperature, change the heating mode, start
  or stop the boost, refresh the radiators — for one radiator or all.
- Dashboard widgets: "Aterno heating" (overview and buttons for all
  radiators) and "Aterno radiator" (one radiator with quick actions).
- Configuration screen actions: test the connection, look for new radiators.
- English, French, German and Spanish: manifest, messages and user
  documentation.

[Unreleased]: https://github.com/gboulvin/Gladys-Aterno/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/gboulvin/Gladys-Aterno/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/gboulvin/Gladys-Aterno/releases/tag/v0.1.0
