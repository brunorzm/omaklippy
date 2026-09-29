# Data Model: Status das impressoras 3D na barra

Tudo em memória, exceto `WidgetSettings`, que o shell persiste em `shell.json`. As funções que
produzem e transformam essas estruturas estão em [contracts/model-api.md](./contracts/model-api.md).

## WidgetSettings (persistido pelo shell, entrada do widget)

| Campo | Tipo | Padrão | Validação |
|-------|------|--------|-----------|
| `printers` | array de `PrinterConfig` | `[]` | Algo que não é array é tratado como `[]`; itens sem `address` são ignorados. |
| `refreshIntervalSec` | inteiro | `5` | Limitado a [2, 3600]; valor inválido usa o padrão. |
| `timeoutSec` | inteiro | `3` | Limitado a [1, 30]; valor inválido usa o padrão. |

Forma exata e exemplos em [contracts/settings.md](./contracts/settings.md).

## PrinterConfig (item de `printers`)

| Campo | Tipo | Regras |
|-------|------|--------|
| `name` | string | Livre, pode repetir. Vazio → usa o host do endereço. |
| `address` | string | `host`, `host:porta` ou `http(s)://host[:porta]`, normalizado por `normalizeAddress`. |

Derivado na carga (`normalizePrinters`):

| Campo | Descrição |
|-------|-----------|
| `key` | `baseUrl + "#" + índice`: identidade estável dentro da lista (nomes podem repetir). |
| `order` | Índice na lista (desempate do destaque). |
| `baseUrl` | URL normalizada, ou `""` se inválida. |
| `invalidReason` | `"endereço inválido"` quando `baseUrl === ""`. |
| `displayName` | Nome exibido; recebe ` (host)` quando o nome se repete (`disambiguateNames`). |

## Reading (resultado de uma consulta; produzido por `parseResponse`)

| Campo | Tipo | Notas |
|-------|------|-------|
| `reachable` | bool | `false` para timeout, falha de conexão/DNS, URL inválida. |
| `httpStatus` | inteiro | `0` quando não houve resposta HTTP. |
| `errorMessage` | string | Motivo legível (erro HTTP, Moonraker, Klipper ou curl). |
| `klippyState` | string | `webhooks.state`: `ready`, `startup`, `shutdown`, `error` ou `""`. |
| `klippyMessage` | string | `webhooks.state_message` (motivo em erro do Klipper). |
| `printState` | string | `print_stats.state`: `standby`, `printing`, `paused`, `complete`, `cancelled`, `error` ou `""`. |
| `printMessage` | string | `print_stats.message` (motivo de erro na impressão). |
| `progress` | número 0–1 ou `null` | `virtual_sdcard.progress`, com fallback para `display_status.progress`. |
| `printDuration` | número (s) ou `null` | `print_stats.print_duration`. |
| `filename` | string | `print_stats.filename`. |
| `nozzle` | `{ current, target }` ou `null` | `extruder.temperature/target`. |
| `bed` | `{ current, target }` ou `null` | `heater_bed.temperature/target`. |

## PrinterStatus (estado exibido por impressora; mantido pelo widget)

| Campo | Tipo | Notas |
|-------|------|-------|
| `key` | string | Chave do `PrinterConfig`. |
| `state` | enum | `printing` \| `paused` \| `idle` \| `error` \| `offline` (rótulos pt-BR em display.md). |
| `reason` | string | Motivo em erro/offline. |
| `percent` | inteiro ou `null` | Só em `printing`/`paused` (`computePercent`). |
| `remainingSec` | número ou `null` | `estimateRemaining`; `null` → "—". |
| `filename`, `nozzle`, `bed` | — | Copiados da `Reading`; limpos em `offline` (FR-009). |
| `lastSeenAt` | ms epoch ou `null` | Instante da última resposta HTTP recebida. |
| `offlineSince` | ms epoch ou `null` | Primeiro instante do trecho offline atual. |
| `pending` | bool | Há requisição em voo para esta impressora. |
| `seq` | inteiro | Número da última requisição disparada. |

Estado inicial (antes da 1ª resposta, `initialStatus`): `state: "offline"`, `reason: "aguardando primeira
resposta"`, `offlineSince: null`. Assim nunca aparece dado não confirmado.

### Transições

```text
mudança de config:  statuses = reconcileStatuses(statuses, printers)
disparo do ciclo:   { statuses, requests } = planDispatch(statuses, printers, timeoutMs)
                    → para cada request: seq++, pending=true, inicia Process(key, seq)
                    impressoras pendentes não geram request (FR-012; timeout > intervalo)
Process termina:    statuses = acceptResult(statuses, key, seq, parseResponse(...), now)
                    (ignorado se seq ≠ atual ou pending já é false)
guarda (timeout+1s): mata o Process;
                    statuses = acceptResult(statuses, key, seq, {reachable:false, "sem resposta"}, now)
```

`applyReading(prev, reading, now)`:

- `reading.reachable === false` → `offline`, dados limpos, `offlineSince = prev.offlineSince ?? now`.
- caso contrário → `state = deriveState(reading)`, `offlineSince = null`, `lastSeenAt = now`.

Qualquer estado pode ir para qualquer outro; não há estados intermediários.

## Selection (seleção do painel; mantida pelo `BarWidget`, só em memória)

| Campo | Tipo | Regras |
|-------|------|--------|
| `selectedKey` | string | `""` = automática (segue `pickHighlighted`). Preenchida quando o usuário escolhe uma impressora no painel. |

- `resolveSelection(selectedKey, printers, statuses)` retorna a chave efetiva: `selectedKey` se
  ainda existe; senão a chave de `pickHighlighted`; senão `""` (sem impressoras).
- Quando a chave escolhida deixa de existir (a impressora foi removida), o widget volta
  `selectedKey` para `""`.
- Não é persistida: reiniciar o shell volta para a seleção automática (FR-018). Cada instância do
  widget (uma por monitor) tem a própria seleção.

## IconState (derivado para a barra; `buildIconState`)

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `mode` | enum | `empty` \| `idle` \| `printing` \| `paused` \| `error` \| `offline`, da impressora escolhida por `pickHighlighted`. |
| `progress` | 0–1 ou `null` | Fração para a barra do ícone (`percent / 100`); só em `printing`/`paused`. |
| `tooltip` | string | Uma linha: `"Voron — imprimindo 42%"` (FR-005). |

Mapeamento visual em [contracts/display.md](./contracts/display.md#ícone-na-barra).

## PanelModel (derivado para o painel; `buildPanelModel`)

| Campo | Descrição |
|-------|-----------|
| `empty` | `true` sem impressoras → estado vazio com instrução de cadastro (FR-020). |
| `selected` | Linha de detalhe da impressora de `resolveSelection`: `displayName`, `state`, `stateLabel`, `reason`, `percent`, `filename`, `remainingText`, `nozzleText`, `bedText`, `freshnessText`. |
| `showJob` | `true` em `printing`/`paused`. |
| `rows` | Todas as impressoras na ordem de cadastro: `key`, `displayName`, `stateLabel`, `percentText`, `selected`. Vazia quando há só uma impressora (FR-017). |
