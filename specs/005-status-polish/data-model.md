# Data Model: Polimento do status

Complementa os data models das fatias 001–004. Só o que muda. Tudo em memória; nada novo é
persistido.

## `Reading` (saída de `parseResponse`): campo novo

| Campo | Tipo | Regra |
|-------|------|-------|
| `displayMessage` | string | `display_status.message` com `trim()`; `""` quando ausente ou não string |

## `PrinterStatus`: campos novos

| Campo | Tipo | Regra |
|-------|------|-------|
| `message` | string | `reading.displayMessage` quando há resposta; `""` offline |
| `progress` | number \| null | progresso cru (0..1) da leitura; `null` offline ou sem impressão |
| `printDuration` | number \| null | `print_stats.print_duration` (segundos só imprimindo); `null` offline |
| `estimate` | `Estimate` \| null | estimativa do fatiador do arquivo em impressão |

`initialStatus` ganha `message: ""`, `progress: null`, `printDuration: null`, `estimate: null`.
`applyReading`: preenche os três primeiros; `estimate` é mantida quando a leitura continua com
impressão (`hasJob`) e o mesmo `filename`; vira `null` quando a impressora fica offline, deixa de
ter impressão ou troca de arquivo.

## `Estimate`

| Campo | Tipo | Regra |
|-------|------|-------|
| `filename` | string | arquivo a que a estimativa pertence |
| `seconds` | number \| null | `estimated_time` (> 0) ou `null` quando não há/ falhou |
| `pending` | bool | busca em andamento |
| `seq` | number | contador por impressora para descartar respostas velhas |

### Transições

```text
null ──planEstimate (hasJob, filename ≠ "")──▶ { filename, seconds: null, pending: true, seq }
     ──acceptEstimate(seq certo, seconds|null)──▶ { filename, seconds, pending: false, seq }
qualquer ──applyReading (offline | !hasJob | outro filename)──▶ null
```

Resposta com `seq` diferente, ou chegando depois de a estimativa ter virado `null` → ignorada.

## `PanelDetail` (`detailFor`): campos novos/alterados

| Campo | Regra |
|-------|-------|
| `messageText` | `status.message` quando `hasJob(state)`; senão `""` (FR-004) |
| `remainingText` | `formatDuration(blendRemaining(status.remainingSec, estimate.seconds, status.printDuration, status.progress))` com impressão; `""` sem impressão (como hoje) |

## `blendRemaining(progressRemaining, slicerTotal, printDuration, progress)` → number \| null

Tabela em [research.md R3](./research.md#r3-combinação-das-estimativas-fr-006-fr-008-sc-007).
Casos de teste (E = 1343):

| p | d | P | Resultado |
|---|---|---|-----------|
| 0 | 0 | null | 1343 (heat-soak) |
| 0,005 | 10 | null | 1333 |
| 0,01 | 20 | 1980 | 0,99·1323 + 0,01·1980 ≈ 1329,6 |
| 0,5 | 700 | 700 | 0,5·643 + 0,5·700 = 671,5 |
| 0,99 | 1400 | 14,1 | S ≤ 0 → 14,1 |
| 0,99 | 1400 | null | null |
| — (sem E) | 300 | 900 | 900 |
| — (sem E) | 0 | null | null |

## Ícone

Sem mudança de dados: `buildIconState(...).mode === "paused"` já existe e dirige o marcador.
