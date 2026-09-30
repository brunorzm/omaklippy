# Data Model: Reiniciar o firmware pelo painel

Complementa o [data model da fatia 002](../002-panel-print-actions/data-model.md). Nenhuma
estrutura nova: uma ação a mais na tabela `ACTIONS` e uma regra de disponibilidade que olha o
status inteiro.

## Action (acréscimo)

| `id` | `path` | `confirm` | `slot` |
|------|--------|-----------|--------|
| `firmwareRestart` | `/printer/firmware_restart` | `true` | `busy` |

Rótulo `TEXT.actions.firmwareRestart` ("Restart firmware"); glifo `ACTION_GLYPHS.firmwareRestart`
(nf-md-restart).

## Disponibilidade (`actionsFor(status)`)

| `status.state` | `status.klippyState` | Ações, na ordem de exibição |
|----------------|----------------------|------------------------------|
| `printing` | `ready` | `pause`, `cancel`, `emergencyStop` (002) |
| `paused` | `ready` | `resume`, `cancel`, `emergencyStop` (002) |
| `idle` | `ready` | `emergencyStop` (002) |
| `error` | `shutdown` ou `error` | **`firmwareRestart`** |
| `error` | `startup`, `ready` (erro de impressão), `""` (503, 401/403, resposta inesperada) | nenhuma |
| `offline` | `""` | nenhuma |

`availableActions(state)` continua a tabela da 002 só por `state`; `actionsFor` a usa e acrescenta
`firmwareRestart` quando `canRestartFirmware(status)`.

## Regras de envio (`planCommand`)

As da 002, com a regra 2 trocada: a ação precisa estar em `actionsFor(status)`. Para
`firmwareRestart` (slot `busy`): `estop` e `busy` livres.

## Transições (visão do painel)

```text
error/shutdown  --Restart firmware + confirmar-->  botão "busy" (spinner)
   POST ok  --consulta imediata-->  error "Klippy Disconnected" (503; sem botão)
            --ciclos seguintes-->   error/startup "Printer is not ready…" (sem botão)
            --ciclos seguintes-->   idle (Emergency stop volta a aparecer)
                                    ou error/shutdown de novo (causa física persiste; botão volta)
   POST falhou  -->  failureText "Restart firmware failed: <motivo>"; botão habilitado de novo
```

`ActionsModel`, `CommandSlot`, `CommandFailure`, `ConfirmState` e o cursor: sem mudança de forma;
`firmwareRestart` entra em `buttons` e `primary` com `urgent: false`.
