# Data Model: Reiniciar o serviço do Klipper pelo painel

Complementa os data models da [002](../002-panel-print-actions/data-model.md) e da
[007](../007-firmware-restart/data-model.md).

## Action (acréscimo)

| `id` | `path` | `confirm` | `slot` |
|------|--------|-----------|--------|
| `klipperRestart` | `/machine/services/restart?service=<nome>` | `true` | `busy` |

Rótulo `TEXT.actions.klipperRestart` ("Restart Klipper"); glifo `ACTION_GLYPHS.klipperRestart`
(nf-md-reload). O `<nome>` vem de `status.klipperService.name`, ou `klipper`.

## Campos novos em `PrinterStatus`

| Campo | Tipo | Regras |
|-------|------|--------|
| `klippyDownSince` | ms epoch ou `null` | `applyReading`: leitura HTTP 503 → valor anterior se não nulo, senão `now`; qualquer outra leitura (inclusive offline) → `null`. `clearKlippyDown` → `null`. `initialStatus` → `null`. |
| `klipperService` | `{ name, pending, seq }` ou `null` | `name`: string não vazia ou `null` (busca falhou). Definido por `planServiceInfo` (`pending: true`) e `acceptServiceInfo`. Mantido entre leituras; se `name` é `null` e `pending` é `false`, volta a `null` quando `klippyDownSince` vira `null` (nova tentativa no próximo episódio). `initialStatus` → `null`. |

## Constante

`KLIPPY_DOWN_OFFER_MS = 15000`.

## Disponibilidade (`actionsFor(status, now)`)

| Status | Ações |
|--------|-------|
| printing / paused / idle | as da 002 |
| error, `klippyState` `shutdown`/`error` | `firmwareRestart` (007) |
| error, `klippyDownSince` não nulo e `now − klippyDownSince ≥ 15 000` | **`klipperRestart`** |
| error com 503 há menos de 15 s, `startup`, erro de impressão, 401/403, offline | nenhuma |
| `now` ausente ou inválido | sem `klipperRestart` (o resto igual) |

## Busca do nome do serviço

```text
planServiceInfo(statuses, printers, timeoutMs):
  para cada impressora válida com klippyDownSince ≠ null e klipperService == null:
    klipperService = { name: null, pending: true, seq: n }; request GET /machine/system_info
Process termina (ou guarda):
  acceptServiceInfo(statuses, key, seq, parseServiceInfo(stdout, exitCode))
    seq diferente ou não pendente → inalterado
    senão klipperService = { name: <instance_ids.klipper ou null>, pending: false, seq }
```

## Transições do reinício

```text
503 contínuo ≥ 15 s  --Restart Klipper + confirmar-->  botão busy
  POST ok      --> clearKlippyDown; consulta imediata
               --> 503 (relógio recomeça) --> startup --> idle
                                                     ou shutdown/error → Restart firmware (007)
               --> 503 por mais 15 s → Restart Klipper de novo (US2.2)
  POST falhou  --> failureText "Restart Klipper failed: <motivo>"; relógio mantido; botão habilitado
```
