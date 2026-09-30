# Data Model: Ações de impressão no painel

Complementa o [data model da fatia 001](../001-printer-status-bar/data-model.md). `PrinterConfig`,
`Reading`, `PrinterStatus`, `Selection` e `PanelModel` continuam como estão, exceto pelos campos
novos indicados aqui. Tudo vive só em memória, dentro do `BarWidget` de cada instância.

## Action (constante em `Model.js`)

| Campo | Tipo | Valores |
|-------|------|---------|
| `id` | enum | `pause` \| `resume` \| `cancel` \| `emergencyStop` |
| `path` | string | `/printer/print/pause`, `/printer/print/resume`, `/printer/print/cancel`, `/printer/emergency_stop` |
| `confirm` | bool | `true` para `cancel` e `emergencyStop` (FR-008, FR-009); `false` para `pause` e `resume` (FR-010) |
| `slot` | enum | `estop` para `emergencyStop`; `busy` para as demais (R6) |
| `label`, `glyph` | string | De `Model.TEXT.actions` e das constantes de glifo |

### Disponibilidade por estado (`availableActions(state)`, FR-001 a FR-005)

| `PrinterStatus.state` | Ações, na ordem de exibição |
|-----------------------|------------------------------|
| `printing` | `pause`, `cancel`, `emergencyStop` |
| `paused` | `resume`, `cancel`, `emergencyStop` |
| `idle` | `emergencyStop` |
| `error`, `offline` | nenhuma |
| sem impressoras | nenhuma (painel vazio) |

> **Fatia 007**: com `error` e o Klipper em `shutdown` ou `error`, a ação `firmwareRestart` aparece (tabela em [data-model.md da 007](../007-firmware-restart/data-model.md#disponibilidade-actionsforstatus)); `availableActions(state)` não mudou, a regra nova está em `actionsFor(status)`.

`idle` só existe com `webhooks.state === "ready"`, e `printing`/`paused` também, então
"firmware pronto" (FR-001) é consequência do estado.

## CommandSlot (comando em andamento)

| Campo | Tipo | Notas |
|-------|------|-------|
| `action` | Action.id | Ação enviada. |
| `seq` | inteiro | Número do comando, único por impressora dentro da instância. |
| `startedAt` | ms epoch | Instante do envio (diagnóstico; não é exibido). |

## CommandFailure (resultado com falha)

| Campo | Tipo | Notas |
|-------|------|-------|
| `action` | Action.id | Ação que falhou. |
| `message` | string | Motivo curto já formatado (`TEXT.actionFailed` + motivo). |

Sucesso não gera registro: a mudança aparece pela atualização imediata do estado (R4).

## PrinterCommands (por impressora; `commands[key]` no `BarWidget`)

| Campo | Tipo | Notas |
|-------|------|-------|
| `busy` | CommandSlot ou `null` | Pause, Resume ou Cancel em andamento. |
| `estop` | CommandSlot ou `null` | Parada de emergência em andamento. |
| `failure` | CommandFailure ou `null` | Última falha, exibida só com a impressora selecionada. |
| `seq` | inteiro | Último número usado. |

Ausente em `commands` = `{ busy: null, estop: null, failure: null, seq: 0 }` (`emptyCommands()`).

### Regras de envio (`planCommand`)

Um comando só é planejado se **todas** valem:

1. a impressora existe na configuração, sem `invalidReason` (FR-011);
2. a ação está em `availableActions(status.state)` no momento do acionamento;
3. `estop` é `null` (com a parada em andamento nada mais sai);
4. para ações `busy`: `busy` é `null` (FR-012, clique duplo, SC-003).

`emergencyStop` com `busy` ocupado **é** permitido (exceção do FR-012, decisão de 2026-09-29).

### Transições

```text
acionamento (clique/Enter, e confirmação quando exigida):
    { commands, request } = planCommand(commands, printer, status, action, timeoutMs, now)
      (printer = a da chave passada pelo painel em runAction(key, action), não a seleção atual)
    request === null → nada acontece
    senão: slot = { action, seq, startedAt }, failure = null, inicia Process(key, seq, args)

Process termina ou guarda (61 s) dispara:
    commands = acceptCommandResult(commands, key, seq, parseActionResponse(stdout, exitCode))
      - seq não corresponde a busy/estop → inalterado (resultado duplicado ou antigo)
      - libera o slot; ok → failure = null; falha → failure = { action, message }
    statuses = requestFollowUp(statuses, key); dispara planDispatch(statuses, printers, timeoutMs, key)

troca de impressora no painel:
    commands = clearFailures(commands)          // FR-015; slots em andamento continuam

impressora removida da configuração:
    commands = reconcileCommands(commands, printers) // descarta a entrada; o Process é parado

widget destruído (desabilitar, remover, reiniciar o shell):
    todos os Process de comando são parados, como os de consulta; nada é reenviado
```

## ActionResult (`parseActionResponse`)

| Campo | Tipo | Notas |
|-------|------|-------|
| `ok` | bool | HTTP 2xx com curl `exitCode` 0. |
| `message` | string | Vazio em sucesso. Em falha: motivo da tabela de [contracts/model-api.md](./contracts/model-api.md#parseactionresponsestdout-exitcode--actionresult). |

## Campos novos em `PrinterStatus`

| Campo | Tipo | Notas |
|-------|------|-------|
| `followUp` | bool | Pedir nova consulta assim que a pendente voltar (R4). `false` em `initialStatus`; zerado quando `planDispatch` despacha a impressora. |

## ActionsModel (derivado para o painel; `buildActionsModel`)

Novo campo `actions` do `PanelModel`:

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `buttons` | lista | Um item por ação disponível, na ordem da tabela de disponibilidade: `{ id, label, glyph, confirm, urgent, busy, enabled }`. `urgent` só em `emergencyStop`; `busy` = este é o comando em andamento; `enabled` = `planCommand` aceitaria agora (e não `busy`). |
| `primary` | lista | Os itens de `buttons` que não são `emergencyStop` (linha de cima). |
| `emergency` | item ou `null` | O item `emergencyStop`, em linha própria. |
| `failureText` | string | `failure.message` da impressora selecionada, ou `""`. Aparece mesmo sem botões (R6, SC-005). |
| `filename` | string | Arquivo da impressão, para a confirmação de cancelamento. |

## ConfirmState (só no `Panel.qml`, estado de interface)

| Campo | Tipo | Notas |
|-------|------|-------|
| `confirmAction` | Action.id ou `""` | Ação aguardando confirmação; `""` = diálogo fechado. |
| `confirmKey` | string | Chave da impressora para a qual o diálogo foi aberto; é ela que recebe o comando (FR-011). |

Zerados sem enviar nada quando: o usuário desiste (botão, Escape, clique no fundo), o painel abre
ou fecha, a impressora resolvida (`selected.key`) deixa de ser `confirmKey` (FR-016, inclusive
por seleção automática), ou o botão de `confirmAction` sumiu de `actions.buttons` ou ficou
desabilitado. O texto
vem de `confirmMessage(action, displayName, filename)`.

## Cursor do painel (`Panel.qml`, calculado por funções puras)

| Campo | Tipo | Notas |
|-------|------|-------|
| `cursorStop` | string | `""` (sem cursor), `"printer"` ou um `Action.id`. Paradas válidas = `cursorStops(panelModel)`; movimento = `stepCursor(stops, current, delta)`. |
