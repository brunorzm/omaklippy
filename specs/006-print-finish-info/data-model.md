# Data Model: Quando termina

Complementa os data models das fatias 001–005. Só o que muda; tudo em memória.

## `Reading`: campos novos

| Campo | Tipo | Regra |
|-------|------|-------|
| `currentLayer` | number \| null | `print_stats.info.current_layer` inteiro `≥ 0`; senão `null` |
| `totalLayer` | number \| null | `print_stats.info.total_layer` inteiro `> 0`; senão `null` |

## `PrinterStatus`: campos novos

`currentLayer` e `totalLayer`, copiados da leitura com resposta; `null` offline. `initialStatus`
ganha os dois com `null`.

## `Estimate` (da 005): campo novo

| Campo | Tipo | Regra |
|-------|------|-------|
| `layerCount` | number \| null | `layer_count` dos metadados, inteiro `> 0`; senão `null` |

`planEstimate` cria com `layerCount: null`; `acceptEstimate(…, seconds, layerCount)` grava.
`parseMetadataLayers(stdout, exitCode)` → inteiro `> 0` ou `null`.

## `PanelDetail` (`detailFor`): campos novos

| Campo | Regra |
|-------|-------|
| `finishText` | com impressão e `R = blendRemaining(…)` conhecido: `formatFinish(now + R·1000, now)`; senão `""` |
| `layerText` | com impressão e `currentLayer` conhecido: total = `totalLayer` ou `estimate.layerCount`; com total: `min(currentLayer, total) + "/" + total`; senão `""` |

## `formatFinish(finishMs, nowMs)` → string

Relógio local; `finishMs` arredondado ao minuto mais próximo. Casos (TZ fixo, agora = qua 30/09
16:15):

| Término | Texto |
|---------|-------|
| 16:52:10 do mesmo dia | `16:52` |
| 16:52:40 | `16:53` (arredonda) |
| 02:10 de qui 01/10 | `tomorrow 02:10` |
| 23:59:40 de qua | `tomorrow 00:00` (virou o dia ao arredondar) |
| 08:00 de sáb 03/10 | `Sat 08:00` |
| 08:00 de qua 07/10 | `7 Oct 08:00` |
| entrada inválida | `""` |

## `tooltipLine(printer, status)` → string

`summaryLine(printer, status)`; com impressão e `R` conhecido, + ` · ` + `formatDuration(R)` +
` left` (por exemplo `Voron — printing 42% · 26m left`). `buildIconState(...).tooltip` usa esta
função; `rows[].optionLabel` continua com `summaryLine`.
