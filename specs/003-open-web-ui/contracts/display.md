# Contract: exibição e abertura (botão Open web UI)

Complementa o [contrato de exibição da 002](../../002-panel-print-actions/contracts/display.md).
O ícone na barra, o tooltip e o IPC não mudam (FR-015). Tudo usa `qs.Ui` e tokens de
`qs.Commons` (Princípio VIII). O conteúdo vem de `panelModel.actions.web`
([model-api.md](./model-api.md#buildactionsmodelprinter-status-printercommands-alterada)).

## Posição no painel (FR-003)

**Imprimindo**

```text
│ Bed                       60/60 °C   │
├──────────────────────────────────────┤
│ [ ⏸ Pause      ] [ ■ Cancel       ]  │
│                                      │  espaço Style.space(12)
│ [ ⚠ Emergency stop                 ] │
│                                      │  espaço Style.space(12)
│ [ ↗ Open web UI                    ] │  linha própria, largura total, sem cor de alerta
│ ⚠ Open web UI failed: …              │  failureText (inalterado)
│ updated <1 min ago                   │
```

**Em erro ou offline**

```text
│ Klipper: MCU 'mcu' shutdown: …       │
├──────────────────────────────────────┤
│ [ ↗ Open web UI                    ] │
│ updated 2 min ago                    │
```

Esta tabela **substitui** a da 002 (FR-013):

| Estado | Linha primary | Linha de emergência | Linha Open web UI |
|--------|---------------|---------------------|-------------------|
| imprimindo | Pause, Cancel | Emergency stop | Open web UI |
| pausada | Resume, Cancel | Emergency stop | Open web UI |
| ociosa | — | Emergency stop | Open web UI |
| erro, offline, endereço inválido | — | — | Open web UI |
| sem `webUrl` válido | como acima | como acima | — |
| sem impressoras | — | — | — |

O espaçador acima de Open web UI só existe quando a linha de emergência ou a primary está
visível. A seção inteira aparece quando `actions.buttons` não está vazio ou há `failureText`
(regra `showActions` da 002, sem mudança).

## Botão

O mesmo `ActionButton` da 002 (`Button` com `bordered: true`, `bodySmall`, cores do bar), com
`visible: !!root.actions.web`, `actionData: root.actions.web || ({})`, `width: parent.width` e `background` transparente. Em andamento:
glifo `busy` girando e `enabled: false`.

## Acionamento

`Panel.activate(id)` ganha um desvio antes da regra da 002:

```text
id === "openWebUi" → se o botão está em stops: hostWidget.openWebUi(selected.key)
```

Sem confirmação (a confirmação continua exclusiva de Cancel e Emergency stop). Com um
`ConfirmDialog` aberto, o `PanelKeyCatcher` está `blocked` e o diálogo cobre os botões, então o
botão fica inacessível (edge case da spec).

## `BarWidget.qml`

| Função | Comportamento |
|--------|---------------|
| `openWebUi(key)` | acha a impressora pela `key`; `plan = Model.planOpenWeb(commands, printer, Date.now())`; `commands = plan.commands`; com `plan.request`, cria um `webLaunchComponent` em `requestHolder` |
| `acceptWebLaunch(key, seq, result)` | `commands = Model.acceptCommandResult(commands, key, seq, result)`; se `result.ok` e `opened`, `close()`. Não consulta a impressora |

`webLaunchComponent`: mesmo esqueleto do `commandComponent` da 002, sem stdout:

| Evento | Resultado |
|--------|-----------|
| `onStarted` | `launched = true` |
| `onExited(code)` | `complete(Model.parseWebLaunchResult(code, true))` |
| `onRunningChanged` com `!running && !launched` | `complete(Model.parseWebLaunchResult(-1, false))` (binário ausente) |
| guarda de `guardMs` (10 s) | `complete(Model.parseWebLaunchResult(-2, true))` e `running = false` |

Resultado único por `seq`. `stop()` (troca de configuração, destruição do widget) encerra sem
resultado, como os demais processos.

## Teclado

| Entrada | Efeito |
|---------|--------|
| j / ↓ / l / → | anda pelas paradas; `openWebUi` é a última (FR-004) |
| Enter / Espaço em `openWebUi` | `activate("openWebUi")` |
| Escape | fecha o painel (sem mudança) |

## Painéis em dois monitores

Cada `BarWidget` tem o próprio `commands` e o próprio painel: só o painel que acionou fecha, e a
falha só aparece nele (mesma regra dos comandos da 002).
