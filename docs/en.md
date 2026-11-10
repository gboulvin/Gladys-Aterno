# Aterno

Control your Aterno radiators from Gladys Assistant: target temperature,
on/off, frost protection, boost, with the room temperature, the open-window
detection and the presence detection of each radiator.

The integration talks to the **Eco Aterno box** — the small white box wired to
your Internet router that the Eco Aterno mobile app uses. It is not affiliated
with, nor endorsed by, Aterno.

## What you get

One Gladys device per radiator paired with the box. Depending on the model,
a radiator offers:

- **Target temperature** — the temperature you ask for, adjustable;
- **Room temperature** — measured by the radiator;
- **Heating** — on or off;
- **Frost protection** — a switch: on keeps the room just above freezing,
  off returns to normal heating;
- **Boost** — on bathroom models;
- **Window** — open or closed, when the radiator detects it;
- **Presence** — when the radiator detects it.

Changes made from the Eco Aterno app or from a thermostat show up in Gladys
within seconds: the box reports them as they happen.

## Prerequisites

- An **Eco Aterno box**, powered and connected to your router with its
  Ethernet cable.
- Your radiators already **paired with the box** in the Eco Aterno app: the
  integration does not pair radiators, it uses the ones the box knows.
- The **MAC address** of the box (12 characters, printed on its back) and
  the **password** you chose when adding the residence in the app.
- Gladys Assistant **5.1.0** or later.

## Configuration

1. Open the **Configuration** tab of the integration.
2. Enter the **MAC address** of the box. Separators (`:` or `-`) are ignored.
3. Enter the **password** of the box.
4. Optional but recommended: enter the **local IP address** of the box (see
   below).
5. Save, then press **Test the connection**: the answer tells which channel
   is used and how many radiators were found.
6. Open the **Discovery** tab and add your radiators.

The **language of the device names** only applies to the features created
from then on; rename anything you like in Gladys afterwards.

### Local or cloud

The box can be reached two ways, and the integration handles both:

- **Local** — directly over your home network. Faster, and it keeps working
  when your Internet access is down. It needs the local IP address of the
  box: find it in the list of connected devices of your router, and reserve
  it there (a "static DHCP lease") so it never changes.
- **Cloud** — through the manufacturer's relay, like the mobile app away
  from home. Nothing to configure, but it needs Internet on both sides.

With the address filled in, the **Prefer the local connection** toggle
decides which one is tried first. If the preferred channel does not answer,
the integration uses the other one and says so: the badge of the radiators
shows an orange dot, with the reason in its tooltip. It returns to the
preferred channel by itself once it answers again.

### Actions

- **Test the connection** — connects to the box and reports the channel in
  use and the number of radiators.
- **Look for new radiators** — reads the list of radiators again, after you
  paired or renamed one in the Eco Aterno app.

## Scenes

The integration adds its own cards to the scene editor, under the
**Integrations** category.

Triggers:

- **Radiator mode changed** — a radiator was switched on, off or to frost
  protection from the Eco Aterno app or its thermostat. Changes made by
  Gladys itself do not fire it, so a scene cannot loop on itself.
- **Radiator fault** — a radiator reports a fault (temperature sensor,
  heating, low thermostat battery).
- **Box connection changed** — the connection to the box was lost, restored,
  or moved between local and cloud.

Temperatures, window and presence are device features: use the standard
"device state changed" trigger of Gladys for those.

Actions:

- **Set the target temperature** — of one radiator, or of all when none is
  chosen.
- **Change the heating mode** — on, off or frost protection, for one
  radiator or all.
- **Start or stop the boost** — radiators without a boost are skipped.
- **Refresh the radiators** — reads every value again now.

Each action returns how many radiators it updated, for the following
actions of the scene.

## Dashboard

Two widgets are available in the dashboard editor:

- **Aterno heating** — how many radiators heat, the average temperature, the
  connection, open windows and faults, with buttons to switch every radiator
  on, off or to frost protection.
- **Aterno radiator** — one radiator of your choice: live temperatures, mode,
  window, presence, and buttons for warmer, cooler, on/off and boost.

## Troubleshooting

**"The box refused the MAC address or the password."** Check the 12
characters of the MAC address on the back of the box. If you no longer know
the password: hold the button of the box for 30 seconds (its light blinks
magenta quickly), then choose a new password in the Eco Aterno app.

**"The Eco Aterno box cannot be reached."** Look at the light of the box:
steady green means reachable locally and remotely, orange means locally
only, red means no Internet connection. Without a local IP address in the
configuration, the integration needs the green light.

**The badge shows "cloud" with an orange dot.** The box did not answer at
the local IP address: it probably changed. Check it in your router and
reserve it.

**A radiator is missing.** Pair it in the Eco Aterno app first, then press
**Look for new radiators**.

**Something else.** Open the logs of the integration in Gladys. They never
contain your password.

## Good to know

- This is a community integration, built from the protocol of the box (a
  Delta Dore Tydom gateway under the Aterno brand). It was developed against
  a simulated box: your feedback on real hardware is welcome on the
  repository.
- It was written for the Eco Aterno box. The older My Aterno box has not
  been tested.
- The heating schedules ("moments") stay in the Eco Aterno app; build yours
  with Gladys scenes if you prefer.
