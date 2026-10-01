# Fixtures

Each fixture is the raw output of one Moonraker query, exactly as the plugin receives it:

```json
{ "exitCode": 0, "stdout": "<response body>\n200" }
```

- `exitCode`: curl's exit code (0 = an HTTP response came back; 7, 28, … = network failure).
- `stdout`: the response body followed by a newline and the HTTP code, which curl's
  `-w '\n%{http_code}'` appends (`000` when there was no response).

`*.synthetic.json` files were written by hand from the Moonraker docs. All others were captured
from real printers (Voron and Biqu B1) or from real curl failures.

`standby-stale-message.synthetic.json` is `standby.synthetic.json` still showing the last print's
message ("Imprimindo"), as the Voron does after a print ends; `printing-message.synthetic.json` is
`printing.synthetic.json` with a message padded with spaces. Both are for the slice 005 message.

`printing-layers.synthetic.json` and `printing-layer-no-total.synthetic.json` are
`printing.synthetic.json` with `print_stats.info` filled in (layer 12 of 62, and layer 5 with no
total), as a printer whose slicer writes `SET_PRINT_STATS_INFO` reports it (slice 006). The real
Voron fixtures have `info` empty.

`standby-heating.synthetic.json` is `standby.synthetic.json` with the nozzle heating (target
200 °C, at 134 °C) and no print: the "idle but heating" case of the slice 004 notifications.

`klippy-error.synthetic.json` is `shutdown.synthetic.json` with `webhooks.state` `"error"` and a
config error message: Klipper started but refused its config. Like `shutdown`, it is a state the
slice 007 "Restart firmware" button offers to recover from.

`system-info.synthetic.json` keeps only the fields the plugin reads from `GET /machine/system_info`
(`instance_ids`, `available_services`, `service_state`), with the values read from the real Voron on
2026-09-30 (its `provider`, assumed at first, matched the real one). `system-info-instance.synthetic.json` is an install whose
Klipper service is `klipper-1`, and `system-info-no-klipper.synthetic.json` one where Moonraker
manages no services (`provider` `none`). `action-service-not-allowed.synthetic.json` is Moonraker
refusing to restart a service that is not in its allowed list (slice 008).
`system-info-voron.json` is the real Voron answer (2026-10-01), trimmed the same way. Real `system_info`
answers are trimmed to these fields before they become fixtures: the rest carries IP addresses and
serial numbers, and the repository is public.

## Capture from a real printer

```bash
PRINTER=192.168.1.50
out=$(curl -sS --connect-timeout 3 --max-time 3 -H 'Accept: application/json' -w '\n%{http_code}' \
  "http://$PRINTER/printer/objects/query?webhooks&print_stats&virtual_sdcard&display_status&extruder=temperature,target&heater_bed=temperature,target")
code=$?
jq -n --argjson e "$code" --arg s "$out" '{exitCode: $e, stdout: $s}' > tests/fixtures/printing.json
```

Use `printf '%s' "$out"` rather than `echo "$out"` if you pipe the output elsewhere: zsh's `echo`
turns the `\n` escapes inside JSON strings into real newlines and breaks the JSON.

## Action fixtures

`action-*` fixtures are the raw output of one action `POST` (pause, resume, cancel, emergency
stop), in the same `{ exitCode, stdout }` format. The network failures above (`refused`, `dns`,
`timeout`, `unauthorized`) are reused for actions too, since the transport is the same.

Capture command (pause shown):

```bash
out=$(curl -sS -X POST --connect-timeout 3 --max-time 60 -H 'Accept: application/json' -w '\n%{http_code}' \
  "http://$PRINTER/printer/print/pause")
code=$?
jq -n --argjson e "$code" --arg s "$out" '{exitCode: $e, stdout: $s}' > tests/fixtures/action-ok.json
```

**Warning**: this really pauses the printer. Only the printer's owner runs it, never an
automated tool.

`action-ok.json` is a real capture: a pause `POST` to the Voron (Moonraker v0.11), taken by the
printer's owner during the slice 002 hardware test.

## Metadata fixtures

`metadata-*` fixtures are the raw output of `GET /server/files/metadata?filename=…`, in the same
`{ exitCode, stdout }` format, captured from the Voron (Moonraker v0.11) on 2026-09-30:
`metadata-ok.json` (OrcaSlicer file, `estimated_time` 1343) and `metadata-missing.json` (a file
that does not exist: HTTP 404 "Metadata not available"). This request only reads.

## Printer setup fixtures (slice 009)

These are not Moonraker status queries; each is the output of one command the printer setup runs,
in the same `{ exitCode, stdout }` format.

- `ip-addr.synthetic.json`: `ip -j -4 addr show` in this computer's format, with the addresses
  replaced by examples: `lo`, `wlp7s0` 192.168.1.21/24 (the only one searched), `tailscale0`
  100.64.0.5/32 and `docker0` 172.17.0.1/16.
- `avahi-moonraker.synthetic.json`: `avahi-browse -rtp _moonraker._tcp` in the real parseable
  format (checked against another service on the network; neither printer announces itself), with
  two printers, one named `My\032Printer` (avahi's decimal escape for a space), and an IPv6 line.
- `scan.synthetic.json`: the network check (one `curl --parallel` over the /24), in the measured
  format: `200` for 192.168.1.100 and .110, `000` for the rest. Exit code 7, as curl returns the
  error of the last address even when others answered.
- `printer-info-voron.json`, `server-info-voron.json`: real Voron answers to `GET /printer/info`
  and `GET /server/info` (2026-10-01), trimmed to `state`, `hostname`, `software_version` and to
  `klippy_state`, `moonraker_version` (the rest carries paths with the printer's user name).
- `printer-info-disconnected.synthetic.json`: `/printer/info` while Klipper is disconnected (503).
- `server-info-not-moonraker.synthetic.json`: a 200 from something that is not Moonraker.
- `set-widget-ok.json`, `set-widget-error.synthetic.json`: the stdout of `omarchy-shell shell
  setBarWidget …` when the shell saves (`ok`) and when it refuses (`could not find widget …`; the
  command exits 0 in both cases).

## Live connection fixtures (slice 010)

`ws-*` fixtures are messages received over Moonraker's websocket, in a different shape:

```json
{ "message": "<the text frame as received>" }
```

- `ws-subscribe-voron.json`: the real answer to `printer.objects.subscribe` (the objects the
  status query reads) from the idle Voron, 2026-10-01. Its `result.status` has the same shape as
  the status query's.
- `ws-update-voron.json`: a real `notify_status_update` (only the temperatures that moved; one
  arrives about every 250 ms even with the printer idle).
- `ws-update-printing.synthetic.json`: an update with `print_stats.state` `paused`, progress and a
  nozzle target.
- `ws-subscribe-error.synthetic.json`: the subscription refused while Klipper is disconnected (503).
- `ws-klippy-disconnected.synthetic.json`, `ws-klippy-ready.synthetic.json`: Moonraker's
  notifications when Klipper goes away and comes back (from the Moonraker docs).
- `ws-proc-stat.synthetic.json`: a `notify_proc_stat_update`, trimmed (the real one, about once a
  second, also carries the traffic counters of every network interface of the printer's computer).

## API key fixtures (slice 011)

- `server-info-unauthorized.synthetic.json`: `GET /server/info` refused (401) by a Moonraker that
  does not trust this computer and got no `X-Api-Key` (or a wrong one). Body as Moonraker v0.10/v0.11
  sends it (`authorization.py`, `authenticate_request`).
- `ws-identify-ok.synthetic.json`, `ws-identify-error.synthetic.json` (websocket messages, the
  `{ "message": … }` shape): the answer to `server.connection.identify` with a valid API key
  (`connection_id`) and with a wrong one (401).
