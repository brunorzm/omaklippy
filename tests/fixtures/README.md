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

`standby-heating.synthetic.json` is `standby.synthetic.json` with the nozzle heating (target
200 °C, at 134 °C) and no print: the "idle but heating" case of the slice 004 notifications.

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
