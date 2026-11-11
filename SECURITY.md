# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## What the integration handles

- **The password of the box.** It is stored by Gladys as a `secret`
  configuration value and kept in memory by the integration. It is never
  written to the logs, to a device state or to a dashboard widget, and it is
  never sent over the network: the box authenticates with HTTP Digest, which
  transmits a hash computed from a one-time challenge.
- **The local connection.** The Eco Aterno box only serves a self-signed
  certificate on the local network and an older TLS configuration, so the
  integration does **not** verify the certificate of the box and accepts
  legacy TLS parameters — for the local channel only, toward the address
  entered in the configuration or found by the local search (below).
  Someone able to impersonate the box on your home network could answer in
  its place and send false values. They would not receive the password
  itself, but the Digest answer computed from it, which allows an offline
  guessing attempt: choose a password that is not short or common.
- **The local search.** When no local address answers, the integration asks
  Gladys to look for the box by mDNS (declared in the manifest
  `network_discovery`, shown on the install screen). Any device of your home
  network can answer such a search; the integration only keeps an address
  whose box accepted the MAC address and the password, which rules out a
  neighbouring Tydom box but not a device built to impersonate one (see the
  previous point). To avoid the local channel entirely, turn off "Prefer the
  local connection": the local channel, search included, is then only tried
  when the cloud relay does not answer.
- **The cloud connection.** The certificate of the relay is verified like any
  other HTTPS host. The relay belongs to the manufacturer of the box; the
  integration sends it the same requests the Eco Aterno app does.

## Scope

In scope: the code of this repository and the Docker image it publishes.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and the third-party services and devices the integration talks to (the Eco
Aterno box, its firmware and its cloud relay).
