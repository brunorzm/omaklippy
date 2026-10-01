# OmaKlippy

An [Omarchy](https://omarchy.org) Quattro plugin (`io.github.brunorzm.omaklippy`) that shows the
status of your Klipper 3D printers in the bar, live from the Moonraker API on your local network.

- **In the bar**: just the printer icon. While printing, a thin progress bar sits under the icon
  (dimmed while paused, with a small pause mark in the corner). On error the icon gets a badge in
  the theme's alert color; when the printer is offline the icon is faded. Hover shows one line: `Voron — printing 42% · 26m left` (the time left only while it is known).
- **In the panel** (click the icon): state, progress, what the printer says it is doing (its
  display message, e.g. `Heating chamber`, only while printing or paused), file, time remaining,
  when it ends (`Ends 16:52`, `tomorrow 02:10` or the weekday; 24 h, on this computer's clock),
  the layer (`Layer 12/62`, see below), nozzle and bed temperatures, and how long ago the last
  answer came in (`live` while the status arrives live, see below).
- **Live updates**: each bar keeps a connection to every printer's Moonraker (its websocket,
  subscribed read-only to the same status the plugin shows), so changes show within a second or two
  and nothing is polled while it is up. Without it (the `qt6-websockets` package missing, the
  printer refusing it, the connection dropping, Klipper disconnected) the plugin polls every
  `refreshIntervalSec` as before, notices a dead connection within 10 s and reconnects on its own
  (waiting 2 s, then up to 30 s between tries). Printer commands are always sent over HTTP, so the
  emergency stop never depends on the connection.
- **Layer** shows only when the printer reports the current layer, which Klipper does when the
  sliced file sets it with `SET_PRINT_STATS_INFO` (in OrcaSlicer: Printer settings → Machine
  G-code → Layer change G-code: `SET_PRINT_STATS_INFO CURRENT_LAYER={layer_num + 1}`, and
  `SET_PRINT_STATS_INFO TOTAL_LAYER=[total_layer_count]` in the start G-code). Without the total,
  the file's layer count is used.
- **Time remaining** starts from the slicer's estimate saved in the file, so it shows from the
  first minute. While the printer is still warming up (heat-soak, homing, leveling: nothing
  extruded yet) it reads `6m + warm-up`, with no finish time, since the warm-up length is unknown;
  the tooltip says `warming up`. Then it leans more and more on the actual progress
  as the print advances. Once a print outlasts the slicer's estimate, only the progress counts.
  Files without a slicer estimate work as before (`—` until the print has advanced a little). With more than one printer, a "Printer"
  dropdown lets you pick which one to show (mouse, or `j`, Enter, then `j`/`k` and Enter).
- The icon stands for the printer you picked in the panel during this session. Without a pick it
  shows the most relevant one: error > printing > paused > offline > idle (ties: registration
  order).

- **Printer controls** (in the panel, for the selected printer):
  - **Pause** / **Resume** while printing / paused, sent right away.
  - **Cancel** while printing or paused, after a confirmation naming the printer and the file.
  - **Emergency stop** whenever the printer is ready (printing, paused or idle), in its own row,
    filled with the theme's alert color, after a confirmation. It stays available while a slow
    pause/resume/cancel macro is still running.
  - **Restart firmware** when Klipper is shut down (emergency stop, MCU fault) or stopped on a
    config error, after a confirmation. The panel then follows the restart ("Klippy
    Disconnected", "Printer is not ready…", then idle) on its own; if the fault is still there,
    the printer goes back to "error" and the button comes back. It does not show while Klipper
    is starting, when the Klipper service is disconnected from Moonraker (see below) or when only
    the print failed.
  - **Restart Klipper** when the printer answers but its Klipper service has been disconnected
    from Moonraker for 15 s or more ("Klippy Host not connected": the service stopped, crashed or
    never started), after a confirmation. It restarts the Klipper service on the printer's
    computer through Moonraker, using the service name the printer reports (`klipper`, or
    `klipper-1` and so on with several instances); the service must be in Moonraker's list of
    allowed services, as it is in a standard install. The 15 s keep the button away from the
    few seconds every firmware restart spends disconnected. The panel then follows Klipper back
    on its own; if it stays disconnected, the button comes back 15 s later.
  - The same command is never sent twice to a printer within 5 s, even from the bars of two
    monitors; after a failure you can retry at once.
  - Confirmations open with **Back** selected, so Enter alone never confirms; use ←/→ (or Tab)
    and Enter, or click. Escape or a click outside the dialog gives up.
  - While a command runs its button spins and nothing else is sent to that printer (except the
    emergency stop). Once it answers the printer is asked again right away. A failure shows a short
    reason under the buttons (e.g. `Pause failed: connection refused`) until your next action or
    printer switch.
  - Commands wait up to 60 s for Moonraker (macros may park or reheat) and are never retried on
    their own. After an emergency stop Klipper stays in "error" until you restart the firmware
    (**Restart firmware** in the panel, or from Mainsail/Fluidd).
  - Keyboard: `j`/`k` walk the dropdown and the buttons, Enter or Space presses.
- **Open web UI** (last row of the panel, in any state, even error or offline): opens the
  selected printer's Mainsail/Fluidd in your default browser and closes the panel. Nothing is
  sent to the printer, and it works while a pause/resume/cancel is still running. The address
  is the printer's own, without Moonraker's port 7125 (`voron.local` and `voron.local:7125`
  both open `http://voron.local`); set `webUrl` when the web UI lives elsewhere. If the browser
  cannot be launched, the panel stays open with the reason (e.g.
  `Open web UI failed: omarchy-launch-browser not found`).

The bar icon itself has no controls; they live only in the panel.

### Notifications

A desktop notification tells you when something happens to a print, so you don't have to watch
the icon:

| Notification | When | Stays on screen |
|--------------|------|-----------------|
| **Print complete** | a printing or paused printer reports the print complete | no, it fades like any other |
| **Print failed** | a printing or paused printer goes into error (print error, Klipper shutdown), or an idle printer with a heater on does | yes, until you close it |
| **Print paused** | a printing printer pauses without the panel's Pause (filament runout, Mainsail, the printer's screen) | no |
| **Printer not responding** | a printer that was printing misses 3 polls in a row (about 15 s by default) | yes, until you close it |

- Cancelling never notifies, and neither does the effect of the panel's own Pause, Resume,
  Cancel or Emergency stop.
- Klipper restarting (a `FIRMWARE_RESTART`) is not a failure.
- Nothing is notified for what was already true when the shell started.
- With several monitors, each event notifies once.
- With the desktop's Do Not Disturb on, the notifications go to its history instead of popping
  up; OmaKlippy does not get around that.
- If notifications cannot be shown, the panel says `Notifications unavailable: …`; everything
  else keeps working.

## Install

```bash
omarchy plugin add https://github.com/brunorzm/omaklippy.git --enable
```

Or copy the folder to `~/.config/omarchy/plugins/io.github.brunorzm.omaklippy/` and run
`omarchy plugin enable io.github.brunorzm.omaklippy`.

## Adding printers

Open the panel and press **Printers…** (a panel without printers opens straight on this screen):

- **Search network** looks for printers on this computer's local network, only when you press
  it: Moonraker announcements (mDNS), plus a check of every address of the local /24 on port
  7125 (`GET /server/info`, one `curl` for the whole network, 64 at a time). VPN, container and
  bridge interfaces are skipped; with no other network (only a VPN, say) the panel says so and the
  search uses announcements only. It takes a few seconds and gives up after 30 s; **Cancel**, Escape
  or closing the panel stops it. Each printer found shows its name and address, and **Add** saves
  it (**Added** when it is already in your list, by name or by IP).
- A printer found is saved with the name its computer gives itself (`GET /printer/info`), or its
  announced name, or its name on the network (`voron.local` → `voron`), or the IP; and with its
  name on the network (or the IP) and the port that answered, e.g. `voron.local:7125`.
- **Add by address** takes an address (same forms as in the configuration) and an optional name.
  The plugin first checks that a Moonraker answers there; if none does, it says why and offers
  **Add anyway**. Without a name, the printer's own name (or the host) is used. An address
  already in the list is refused.
- **Remove <name>** removes the printer selected in the panel, after a confirmation.

The shell saves the list (`omarchy-shell shell setBarWidget`, the same method `omarchy bar set`
uses), keeping every other field of your printers (`webUrl`, names) as it was. If OmaKlippy is on
the same bar more than once, the panel cannot tell which entry is its own and asks you to edit
`shell.json` instead.

For a printer to show up through announcements too, turn them on in its `moonraker.conf`:

```ini
[zeroconf]
```

Without it the network check still finds it.

## Configuration

Settings live on the widget's entry in `~/.config/omarchy/shell.json` and apply right away,
without restarting. Printers can be added and removed from the panel (above) or here.

| Key | Default | Description |
|-----|---------|-------------|
| `printers` | `[]` | List of `{ "name": "...", "address": "...", "webUrl": "...", "apiKey": "..." }` (`apiKey` optional, see API key). The address (Moonraker) accepts `host`, `host:port` or `http(s)://host[:port]`. Names may repeat; the panel then shows the address next to them. `webUrl` is optional, takes the same forms and is opened as typed by **Open web UI**; without it the button opens the address minus port 7125. An invalid `webUrl` only hides that printer's button. |
| `refreshIntervalSec` | `5` | Time between polls, 2 to 3600 s, while a printer is not live (see Live updates). |
| `timeoutSec` | `3` | Timeout for each poll, 1 to 30 s. Without an answer in time, the printer shows as offline. |
| `notifyComplete` | `"On"` | `"On"` or `"Off"`: the **Print complete** notification. |
| `notifyFailed` | `"On"` | `"On"` or `"Off"`: the **Print failed** notification. |
| `notifyPaused` | `"On"` | `"On"` or `"Off"`: the **Print paused** notification. |
| `notifyLostContact` | `"On"` | `"On"` or `"Off"`: the **Printer not responding** notification. |

```bash
# Add printers (the list goes WITHOUT --json)
omarchy bar set io.github.brunorzm.omaklippy printers \
  '[{"name":"Voron","address":"voron.local"},{"name":"Ender","address":"192.168.1.51:7125"}]'

# A printer whose web UI is not on the address's host and default port
omarchy bar set io.github.brunorzm.omaklippy printers \
  '[{"name":"Lab","address":"lab.local:7130","webUrl":"http://lab.local:8080"}]'

# Turn one notification off
omarchy bar set io.github.brunorzm.omaklippy notifyPaused Off

# Numeric settings (with --json)
omarchy bar set io.github.brunorzm.omaklippy refreshIntervalSec 10 --json
omarchy bar set io.github.brunorzm.omaklippy timeoutSec 5 --json
```

> **Why does `printers` go without `--json`?** In Omarchy 4.0.4, `omarchy bar set --json` passes
> the value through `quickshell ipc call`, which splits JSON lists into several arguments: a
> one-item list becomes the bare object, and a two-item list fails with "Too many arguments".
> Without `--json` the list is stored as text, which the plugin reads just fine. Editing
> `shell.json` by hand works too.
>
> **If a change does not show up:** in Omarchy 4.0.4 only the first `omarchy bar set` on a widget
> reaches the running widget; later ones are saved to `shell.json` but the shell does not pass
> them on until it restarts (`omarchy-restart-shell`). Editing `shell.json` directly always
> applies right away.

> **Reconnected monitors:** in Omarchy 4.0.4, a widget that is recreated when a monitor is
> connected gets the settings from the last time the whole bar was built, not the latest ones.
> If you changed your printers while the shell was running and then plugged in a monitor, run
> `omarchy-restart-shell`.

> **Heads-up:** `omarchy plugin disable` removes the widget's entry from `shell.json`, printers
> included. Add them again after re-enabling.

### Moonraker

The plugin calls `GET /printer/objects/query` for status, `GET /server/files/metadata` once per
print for the slicer's estimate and, when you use the panel's buttons,
`POST /printer/print/pause`, `/printer/print/resume`, `/printer/print/cancel`,
`/printer/emergency_stop`, `/printer/firmware_restart` and `/machine/services/restart`, and
`GET /machine/system_info` once when Klipper disconnects (for its service name), and, from the
**Printers…** screen only, `GET /server/info` and `GET /printer/info` (to find a printer and its
name), all without authentication. Your computer has to be allowed in
`moonraker.conf` (for status and for commands):

```ini
[authorization]
trusted_clients:
    192.168.0.0/16
```

Otherwise the printer shows as "error: unauthorized — allow this computer in trusted_clients or set
an API key".

### API key

A printer that does not trust this computer works with its Moonraker **API key** instead. Set it
from the panel (**Printers…** → **Set API key** for the selected printer, or when **Add by address**
says the printer needs one) or as `apiKey` on the printer in `shell.json`:

```json
{ "name": "Lab", "address": "lab.local", "apiKey": "…" }
```

Moonraker hands its API key to a trusted client (`GET /access/api_key`), so read it from a computer
it already trusts. With a wrong or changed key the printer shows "API key rejected"; **Remove API
key** takes it out.

The key gives full control of the printer. The plugin only ever sends it to that printer: to `curl`
on its standard input (`-H @-`), never on the command line, and inside the live connection's
`server.connection.identify`, never in an address; the panel only shows its last four characters.
**`shell.json` is readable by every user of this computer**, though, and the key sits there like the
rest of the widget's settings: on a computer you share, prefer adding this computer to the printer's
`trusted_clients`.

## Dependencies

| Binary | When | What for |
|--------|------|----------|
| `curl` | required, at runtime | Polls each printer's Moonraker and sends the panel's commands (`POST`), always with a timeout (`--connect-timeout`/`--max-time`; 60 s total for commands). Without it, every printer shows as "error: curl not found" and commands fail with "curl not found". |
| `notify-send` | optional, for the notifications | Sends the desktop notifications to the shell's notification service. Part of `libnotify`. Run without a shell, with a 10 s guard. Without it, the panel shows "Notifications unavailable: notify-send not found"; everything else keeps working. |
| `omarchy-launch-browser` | required at runtime, for **Open web UI** only | Opens the web UI in the default browser, the way Omarchy does (its own systemd unit, window focused). Part of the `omarchy` package. Run without a shell, with a 10 s guard. Without it, the button shows "Open web UI failed: omarchy-launch-browser not found"; everything else keeps working. |
| QtWebSockets (`qt6-websockets`) | optional, for live updates | The QML module behind the live connection to each printer. Not part of Omarchy (here it came with `nextcloud-client`). Without it, the panel shows "Live updates unavailable: install qt6-websockets" and the plugin polls as before; everything else keeps working. |
| `omarchy-shell` | required, to add or remove printers from the panel | Asks the shell to save the new printer list (`omarchy-shell shell setBarWidget …`). Part of the `omarchy` package. Run without a shell, with a 5 s guard. Without it, adding and removing show "Could not save the printers: omarchy-shell not found"; everything else keeps working. |
| `ip` | required, for the network check in **Search network** | Lists this computer's local networks (`ip -j -4 addr show`). Part of `iproute2`. Without it, the search uses announcements only and says so. |
| `avahi-browse`, `avahi-resolve` | optional, for **Search network** | Read Moonraker announcements (`avahi-browse -rtp _moonraker._tcp`) and the name on the network of each printer found (`avahi-resolve -a`). Part of `avahi`. Without them, the search uses the network check only (and says so) and printers found are saved by IP. |
| `node` | development only | Runs the tests for the pure logic (`node --test tests/`). |

No other external binary is ever run.

## Privileges

- Runs inside `omarchy-shell`, unsandboxed, with your user's permissions.
- No `sudo`, no install scripts, no daemons or services.
- Creates no files outside its own folder. Settings live on the widget's entry in
  `~/.config/omarchy/shell.json`, written by the shell itself.
- Searches the local network only when you press **Search network**, with `GET` requests to
  Moonraker's info endpoints only.
- Keeps one connection per bar to each printer you add, only to subscribe to its status (read-only)
  and to ping it (and, with an API key, to identify with it); nothing else is sent over it.
- Sends a printer's API key only to that printer, never on a command line or in an address.
- Reads (`GET`) the status of the printers you add, and sends a command (`POST`) only when you
  press one of the panel's buttons (Cancel, Emergency stop, Restart firmware and Restart Klipper only after you confirm).
- Opens your default browser only when you press **Open web UI**.
- Shows desktop notifications about your prints (each kind can be turned off).

## IPC

```bash
omarchy-shell io.github.brunorzm.omaklippy refresh             # poll every printer now
omarchy-shell shell summon io.github.brunorzm.omaklippy '{}'   # open the panel
omarchy-shell shell hide io.github.brunorzm.omaklippy          # close the panel
```

## Development

- All logic (settings, response parsing, states, texts) lives in `Model.js` as pure functions.
  Every user-facing string is in its `TEXT` object. `BarWidget.qml` and `Panel.qml` only handle
  processes, timers and UI.
- Tests: `node --test tests/`. Sample responses live in `tests/fixtures/` (see the README there to
  capture new ones from a real printer).
- Validation: `omarchy plugin validate .` and
  `qmllint -I "$OMARCHY_PATH/shell" BarWidget.qml Panel.qml`.
- The shell's hot reload does not reliably reload a third-party plugin (including files created
  after the first load). After changing code, run `omarchy-restart-shell`. Settings changes do
  not need it.
- Specs, plan and design notes for each feature are in `specs/` (Spec Kit, written in Portuguese).

## License

MIT
