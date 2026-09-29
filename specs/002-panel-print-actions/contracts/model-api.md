# Contract: `Model.js` (funções novas e alteradas)

Complementa o [contrato da fatia 001](../../001-printer-status-bar/contracts/model-api.md). As
regras gerais continuam: funções puras, sem relógio (recebem `now`), nunca lançam exceção,
devolvem objeto novo ou o **mesmo** objeto quando nada muda, e todo texto visível fica em `TEXT`
(em inglês; o teste que proíbe português cobre as chaves novas). Tipos em
[../data-model.md](../data-model.md).

## Textos novos em `TEXT`

```text
actions: { pause: "Pause", resume: "Resume", cancel: "Cancel", emergencyStop: "Emergency stop" }
confirm: {
  back: "Back",
  cancelPrint: "Cancel print",
  stop: "Stop",
  cancelMessage: "Cancel the print \"%1\" on %2?",
  cancelMessageNoFile: "Cancel the current print on %1?",
  emergencyMessage: "Emergency stop %1? Klipper will shut down until a firmware restart."
}
actionFailed: "%1 failed: %2"             // "Pause failed: connection refused"
commandTimeout: "no response (timeout) — check the printer before trying again"
```

`fill` passa a aceitar `%1` e `%2` (`fill(template, a, b)`), numa única passada: um valor que
contém `%1`/`%2` (nome de arquivo) não é substituído de novo. Chamadas antigas com um valor não
mudam. Caso de teste: `fill("%1 on %2", "a%2.gcode", "Voron")` → `"a%2.gcode on Voron"`.

## Constantes

- `ACTIONS`: tabela `id → { path, confirm, slot }` de [data-model.md](../data-model.md#action-constante-em-modeljs).
- `ACTION_GLYPHS`: `pause`, `resume`, `cancel`, `emergencyStop`, `busy` (Nerd Font do bar).
- `COMMAND_TIMEOUT_SEC = 60`.

## Disponibilidade

### `availableActions(state) → string[]`

Tabela de [data-model.md](../data-model.md#disponibilidade-por-estado-availableactionsstate-fr-001-a-fr-005).
Estado desconhecido, `null` ou não-string → `[]`.

## Requisição

### `buildActionArgs(baseUrl, action, connectTimeoutSec) → string[]`

`["curl", "-sS", "-X", "POST", "--connect-timeout", C, "--max-time", "60", "-H", "Accept: application/json", "-w", "\n%{http_code}", baseUrl + ACTIONS[action].path]`,
com `C = String(connectTimeoutSec)`. Ação desconhecida ou `baseUrl` vazio → `[]` (o chamador
não inicia processo).

## Resposta

### `readTransport(stdout, exitCode)` (interna, extraída de `parseResponse`)

Devolve `{ reachable, httpStatus, errorMessage, data }`: a tabela de códigos de saída do curl e de
HTTP da fatia 001 (curl ausente, offline, 401/403, ≥ 400 com `error.message`), sem interpretar
`result.status`. `parseResponse` passa a usá-la; **os testes existentes de `parseResponse` e das
fixtures não mudam** e provam que a consulta continua igual.

### `parseActionResponse(stdout, exitCode) → ActionResult`

| Entrada | `ok` | `message` |
|---------|------|-----------|
| curl 0, HTTP 2xx (qualquer corpo) | `true` | `""` |
| curl 28 | `false` | `TEXT.commandTimeout` |
| outro curl ≠ 0 (3, 6, 7, …) | `false` | mesmo texto da consulta ("connection refused", "host not found", …) |
| curl ausente (`-1`, `127`) | `false` | "curl not found" |
| HTTP 401/403 | `false` | `TEXT.unauthorized` |
| HTTP ≥ 400 com `error.message` | `false` | `tidyMessage(error.message)` |
| HTTP ≥ 400 sem mensagem, ou `000` | `false` | `"HTTP <código>"` |
| HTTP 1xx/3xx | `false` | `"HTTP <código>"` |

## Estado dos comandos

### `emptyCommands() → PrinterCommands`

`{ busy: null, estop: null, failure: null, seq: 0 }`.

### `planCommand(commands, printer, status, action, timeoutMs, now) → { commands, request }`

`printer` e `status` são os da chave que o painel passou em `runAction(key, action)` (FR-011),
não os da seleção no momento da resposta.

- Regras de [data-model.md](../data-model.md#regras-de-envio-plancommand). Qualquer regra violada
  (inclusive entrada malformada) → `{ commands, request: null }` com o **mesmo** `commands`.
- Aceito: `seq + 1`, ocupa o slot da ação com `{ action, seq, startedAt: now }`, `failure: null`,
  e `request = { key, seq, action, args: buildActionArgs(printer.baseUrl, action, ceil(timeoutMs/1000)), guardMs: (COMMAND_TIMEOUT_SEC + 1) * 1000 }`.
- Casos de teste: clique duplo (segundo `planCommand` com o resultado do primeiro → `null`);
  `emergencyStop` com `busy` ocupado → aceito; `pause` com `estop` ocupado → `null`; `cancel` em
  `idle` → `null`; impressora com `invalidReason` → `null`.

### `acceptCommandResult(commands, key, seq, result) → commands`

- Procura `seq` em `busy` e depois em `estop` da impressora. Não achou → mesmo objeto (resultado
  duplicado da guarda + `onExited`, ou impressora removida).
- Libera o slot. `result.ok` → `failure: null`; senão `failure = { action, message: fill(TEXT.actionFailed, TEXT.actions[action], result.message) }`.

### `clearFailures(commands) → commands`

Zera `failure` de todas as impressoras; mantém slots em andamento. Sem falhas → mesmo objeto.

### `reconcileCommands(commands, printers) → commands`

Remove as chaves que não estão mais em `printers`. Sem remoções → mesmo objeto.

## Motor de consulta (alterações)

### `initialStatus(key)`

Ganha `followUp: false`.

### `requestFollowUp(statuses, key) → statuses`

Status com `pending: true` → cópia com `followUp: true`. Sem status ou sem consulta pendente →
mesmo objeto.

### `planDispatch(statuses, printers, timeoutMs, onlyKey)`

Novo parâmetro opcional `onlyKey`: quando string não vazia, só essa impressora é considerada.
Toda impressora despachada sai com `followUp: false`. Sem `onlyKey`, comportamento da fatia 001.

### `acceptResult(...)`

Sem mudança de assinatura; preserva `followUp` do status. O `BarWidget` lê
`statuses[key].followUp` depois de aceitar e, se verdadeiro, chama
`planDispatch(statuses, printers, timeoutMs, key)`.

## Painel

### `buildActionsModel(printer, status, printerCommands) → ActionsModel`

Campos em [data-model.md](../data-model.md#actionsmodel-derivado-para-o-painel-buildactionsmodel).
`enabled` de cada botão é exatamente "`planCommand` aceitaria agora"; `busy` marca o botão cujo
comando está em andamento. Casos:

| Estado / comandos | `primary` | `emergency` |
|-------------------|-----------|-------------|
| printing, livre | pause, cancel (habilitados) | habilitado |
| paused, livre | resume, cancel | habilitado |
| idle | — | habilitado |
| printing, `busy = pause` | pause (`busy`), cancel (desabilitado) | **habilitado** |
| printing, `estop` ocupado | pause, cancel desabilitados | `busy` |
| error / offline | — | `null` |
| offline com `failure` | — | `null`, `failureText` preenchido |

### `buildPanelModel(printers, statusesByKey, selectedKey, now, commandsByKey)`

Parâmetro novo opcional `commandsByKey`; o resultado ganha `actions = buildActionsModel(...)` da
impressora selecionada (`actions` vazio, sem botões e sem falha, quando `empty`). Sem o parâmetro,
tudo da fatia 001 continua igual.

### `confirmMessage(action, displayName, filename) → string`

- `cancel` com arquivo → `Cancel the print "hook.gcode" on Voron?`; sem arquivo →
  `TEXT.confirm.cancelMessageNoFile`.
- `emergencyStop` → `TEXT.confirm.emergencyMessage` com o nome.
- Outras ações → `""` (não pedem confirmação).

### `confirmLabel(action) → string`

`cancel` → "Cancel print"; `emergencyStop` → "Stop"; outras → `""`.

### `cursorStops(panelModel) → string[]`

`"printer"` se `options.length > 0`, depois os `id` dos botões com `enabled: true`, na ordem
`primary` e então `emergency`.

### `stepCursor(stops, current, delta) → string`

- `current` em `stops` → índice + `delta`, limitado às pontas (sem dar a volta).
- `current` vazio → a primeira parada (qualquer `delta`).
- `current` que saiu da lista (inclusive botão que acabou de ficar desabilitado) → a primeira
  parada. Lista vazia → `""`.

## Cobertura de teste exigida

Cada linha das tabelas acima é um caso. `parseActionResponse` tem um teste por fixture de
[moonraker.md](./moonraker.md#fixtures-novas). Cada função nova tem o teste de "nunca lança" com
`null`/`undefined`/`{}`/`"lixo"`. Os testes da fatia 001 continuam passando sem alteração.
