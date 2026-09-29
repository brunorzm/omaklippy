# Fixtures

Cada fixture é a saída crua de uma consulta ao Moonraker, como o plugin a recebe:

```json
{ "exitCode": 0, "stdout": "<corpo da resposta>\n200" }
```

- `exitCode`: código de saída do `curl` (0 = houve resposta HTTP; 7, 28, … = falha de rede).
- `stdout`: corpo da resposta seguido de uma quebra de linha e do código HTTP, que o
  `-w '\n%{http_code}'` do curl acrescenta (`000` quando não houve resposta).

Arquivos `*.synthetic.json` foram escritos à mão a partir da documentação do Moonraker. Os demais
foram capturados de uma impressora real.

## Capturar de uma impressora real

```bash
PRINTER=192.168.1.50
out=$(curl -sS --connect-timeout 3 --max-time 3 -H 'Accept: application/json' -w '\n%{http_code}' \
  "http://$PRINTER/printer/objects/query?webhooks&print_stats&virtual_sdcard&display_status&extruder=temperature,target&heater_bed=temperature,target")
code=$?
jq -n --argjson e "$code" --arg s "$out" '{exitCode: $e, stdout: $s}' > tests/fixtures/printing.json
```
