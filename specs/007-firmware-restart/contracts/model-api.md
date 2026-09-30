# Contract: `Model.js` (fatia 007)

Complementa o [contrato da fatia 002](../../002-panel-print-actions/contracts/model-api.md). Mesmas
regras: funções puras, nunca lançam, devolvem o mesmo objeto quando nada muda, textos em `TEXT`
(inglês; o teste que proíbe português cobre as chaves novas).

## Textos novos em `TEXT`

```text
actions.firmwareRestart: "Restart firmware"
confirm.restart: "Restart"
confirm.restartMessage: "Restart the firmware on %1? Klipper and the printer's boards will restart."
```

A falha usa `TEXT.actionFailed` → `Restart firmware failed: <motivo>`.

## Constantes

- `ACTIONS.firmwareRestart = { path: "/printer/firmware_restart", confirm: true, slot: "busy" }`
- `ACTION_GLYPHS.firmwareRestart = "\u{f0709}"` (nf-md-restart)

## Funções novas

### `canRestartFirmware(status) → bool`

`true` só com `status.state === "error"` e `status.klippyState` `"shutdown"` ou `"error"`.
Casos: cada linha da tabela de [data-model.md](../data-model.md#disponibilidade-actionsforstatus),
com os status montados por `applyReading` a partir das fixtures (`shutdown`, `shutdown.synthetic`,
`klippy-error.synthetic`, `startup`, `klippy-restarting`, `klippy-disconnected`,
`print-error.synthetic`, `unauthorized`, `timeout`, `standby`, `printing`, `paused`); `null`,
`undefined`, `{}`, `"lixo"` → `false`.

### `actionsFor(status) → string[]`

`availableActions(status.state)` e, se `canRestartFirmware(status)`, `["firmwareRestart"]`.
Entrada malformada → `[]`. Sempre lista nova.

## Funções alteradas

| Função | Mudança |
|--------|---------|
| `availableActions(state)` | **nenhuma** (testes da 002 intactos) |
| `planCommand(...)` | disponibilidade por `actionsFor(status)`. Casos: `firmwareRestart` em shutdown → aceito, `args` terminam em `/printer/firmware_restart`; clique duplo → `null`; com `estop` ocupado → `null`; com `busy` ocupado → `null`; em `startup`, 503, erro de impressão, idle → `null` |
| `buildActionsModel(...)` | ids de `actionsFor(status)`; em shutdown: `primary = [firmwareRestart]` (`urgent: false`, `confirm: true`), `emergency: null`, `web` como antes; em andamento: `busy: true`, `enabled: false` |
| `confirmMessage(action, name)` | `firmwareRestart` → `TEXT.confirm.restartMessage` com o nome |
| `confirmLabel(action)` | `firmwareRestart` → `"Restart"` |
| `cursorStops` | sem mudança; o botão entra pela `primary` |

`parseActionResponse` e `acceptCommandResult` não mudam: a tabela da 002 cobre as respostas
([moonraker.md](./moonraker.md)).

## Notificações

Sem função nova. Teste: `observe` sobre a sequência `shutdown` → `klippy-restarting` → `startup` →
`standby`, com `protectedNow` `true` e `false`, gera 0 eventos.

## Cobertura exigida

Cada caso acima; "nunca lança" para `canRestartFirmware` e `actionsFor`; o teste de textos em
inglês cobre as chaves novas; os testes existentes das fatias 001–006 continuam passando sem alteração.
