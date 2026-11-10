# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

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

[Unreleased]: https://github.com/gboulvin/Gladys-Aterno/commits/main
