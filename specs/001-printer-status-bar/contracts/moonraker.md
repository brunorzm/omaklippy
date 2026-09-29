# Contract: API do Moonraker consumida

Somente leitura, uma requisição por impressora por ciclo. Referência:
https://moonraker.readthedocs.io/en/latest/external_api/printer/ e
https://moonraker.readthedocs.io/en/latest/printer_objects/.

## Requisição

```text
GET {baseUrl}/printer/objects/query?webhooks&print_stats&virtual_sdcard&display_status&extruder=temperature,target&heater_bed=temperature,target
Accept: application/json
```

Executada com `curl` (argumentos em [model-api.md](./model-api.md#buildcurlargsurl-timeoutsec--string)).
Sem autenticação: o computador precisa estar em `[authorization] trusted_clients` do Moonraker.

## Respostas esperadas

**200, Klipper pronto e imprimindo**

```json
{"result":{"eventtime":578243.578,"status":{
  "webhooks":{"state":"ready","state_message":"Printer is ready"},
  "print_stats":{"filename":"hook.gcode","total_duration":1234.5,"print_duration":1200.1,
                 "state":"printing","message":""},
  "virtual_sdcard":{"progress":0.31,"is_active":true},
  "display_status":{"message":"","progress":0.33},
  "extruder":{"temperature":214.8,"target":215.0},
  "heater_bed":{"temperature":60.1,"target":60.0}}}}
```

- Objetos inexistentes são omitidos, sem erro. `display_status` só existe com `[display_status]`
  e `heater_bed` só se a impressora tiver mesa aquecida.
- `print_stats.state`: `standby` | `printing` | `paused` | `complete` | `cancelled` | `error`.
- `webhooks.state`: `ready` | `startup` | `shutdown` | `error`.

**503, Klipper desconectado**

```json
{"error":{"code":503,"message":"Klippy Host not connected"}}
```

**401, cliente não autorizado**

```json
{"error":{"code":401,"message":"Unauthorized"}}
```

## Fixtures

Ficam em `tests/fixtures/`. Cada fixture tem o corpo da resposta, o código HTTP e o código de
saída do curl. Devem ser **capturadas de uma impressora real** sempre que possível (Princípio VII)
com o próprio comando de `buildCurlArgs`. As sintéticas levam o sufixo `.synthetic`.

| Fixture | Como obter | `deriveState` esperado |
|---------|-----------|------------------------|
| `printing` | durante uma impressão | `printing`, percent/remaining preenchidos |
| `paused` | `PAUSE` | `paused` |
| `standby` | ligada, sem trabalho | `idle` |
| `complete` | após terminar | `idle` |
| `cancelled` | `CANCEL_PRINT` | `idle` |
| `print-error` | erro durante a impressão (sintética se não der para reproduzir) | `error` com `print_stats.message` |
| `shutdown` | `M112` (parada de emergência) | `error` com `state_message` |
| `startup` | logo após `FIRMWARE_RESTART` | `error` "Klipper: startup"/mensagem |
| `klippy-disconnected` | Klipper parado, Moonraker ativo (503) | `error` "Klippy Host not connected" |
| `unauthorized` | IP fora de `trusted_clients` (401) | `error` acesso não autorizado |
| `no-heater-bed.synthetic` | resposta sem `heater_bed` | `bed: null`, sem erro |
| `timeout` | exitCode 28, stdout `"000"` | `offline` |
| `refused` | exitCode 7 | `offline` |
| `garbage.synthetic` | 200 com HTML | `error` "resposta inesperada" |
