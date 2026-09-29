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
