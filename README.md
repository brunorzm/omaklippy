# OmaKlippy

An [Omarchy](https://omarchy.org) Quattro plugin (`io.github.brunorzm.omaklippy`) that shows the
status of your Klipper 3D printers in the bar, by polling the Moonraker API on your local network.

- **In the bar**: just the printer icon. While printing, a thin progress bar sits under the icon
  (dimmed while paused). On error the icon gets a badge in the theme's alert color; when the
  printer is offline the icon is faded. Hover shows one line: `Voron — printing 42%`.
- **In the panel** (click the icon): state, progress, file, time remaining, nozzle and bed
  temperatures, and how long ago the last answer came in. With more than one printer, a list lets
  you pick which one to show (mouse, or `j`/`k` and Enter).
- The icon stands for the printer you picked in the panel during this session. Without a pick it
  shows the most relevant one: error > printing > paused > offline > idle (ties: registration
  order).

Printer controls (pause/resume, cancel, emergency stop, open the web UI) are not there yet; they
are planned for the next version.

## Install

```bash
omarchy plugin add https://github.com/brunorzm/omaklippy.git --enable
```

Or copy the folder to `~/.config/omarchy/plugins/io.github.brunorzm.omaklippy/` and run
`omarchy plugin enable io.github.brunorzm.omaklippy`.

## Configuration

Settings live on the widget's entry in `~/.config/omarchy/shell.json` and apply right away,
without restarting.

| Key | Default | Description |
|-----|---------|-------------|
| `printers` | `[]` | List of `{ "name": "...", "address": "..." }`. The address accepts `host`, `host:port` or `http(s)://host[:port]`. Names may repeat; the panel then shows the address next to them. |
| `refreshIntervalSec` | `5` | Time between polls, 2 to 3600 s. |
| `timeoutSec` | `3` | Timeout for each poll, 1 to 30 s. Without an answer in time, the printer shows as offline. |

```bash
# Add printers (the list goes WITHOUT --json)
omarchy bar set io.github.brunorzm.omaklippy printers \
  '[{"name":"Voron","address":"voron.local"},{"name":"Ender","address":"192.168.1.51:7125"}]'

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

The plugin calls `GET /printer/objects/query` without authentication. Your computer has to be
allowed in `moonraker.conf`:

```ini
[authorization]
trusted_clients:
    192.168.0.0/16
```

Otherwise the printer shows as "error: unauthorized — allow this computer in trusted_clients".

## Dependencies

| Binary | When | What for |
|--------|------|----------|
| `curl` | required, at runtime | Polls each printer's Moonraker, always with a timeout (`--connect-timeout`/`--max-time`). Without it, every printer shows as "error: curl not found". |
| `node` | development only | Runs the tests for the pure logic (`node --test tests/`). |

No other external binary is ever run.

## Privileges

- Runs inside `omarchy-shell`, unsandboxed, with your user's permissions.
- No `sudo`, no install scripts, no daemons or services.
- Creates no files outside its own folder. Settings live on the widget's entry in
  `~/.config/omarchy/shell.json`, written by the shell itself.
- Only reads (`GET`) from the Moonraker of the printers you add.

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
