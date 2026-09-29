---

description: "Task list for 002-panel-print-actions"
---

# Tasks: Ações de impressão no painel

**Input**: Design documents from `specs/002-panel-print-actions/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: OBRIGATÓRIOS. A constituição (Princípio V) exige teste automatizado para toda função
pura nova ou alterada. Os testes são escritos antes da implementação e devem falhar primeiro.

**Organization**: tarefas agrupadas por história de usuário (US1–US4 da spec).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência pendente)
- **[Story]**: história da spec (US1…US4)
- Caminhos relativos à raiz do plugin (`~/.config/omarchy/plugins/io.github.brunorzm.omaklippy/`)

## Regras que valem para TODAS as tarefas

- **Gate de tarefa (Princípio VI)**: toda tarefa só termina quando `omarchy plugin validate .` e
  `qmllint -I "$OMARCHY_PATH/shell" BarWidget.qml Panel.qml` passam sem erro e `node --test tests/`
  está no estado esperado:
  - **tarefas de implementação e de verificação**: todos os testes passam, inclusive os da
    fatia 001 **sem alteração** (exceto onde a tarefa diz o contrário);
  - **tarefas que escrevem testes**: os anteriores continuam passando e os novos falham só pela
    implementação que falta, nunca por erro de sintaxe, fixture ou `require`.
- **Lint real do QML**: o gate oficial não resolve `qs.Commons`/`qs.Ui`. Para um lint efetivo,
  usar um diretório no scratchpad com `qs/Commons` e `qs/Ui` apontando para
  `/usr/share/omarchy/shell/{Commons,Ui}` e somar `-I <scratch>` (nunca symlinks dentro do plugin).
- **Recarregar**: depois de mudar código, `omarchy-restart-shell` (o hot reload não recarrega
  plugin de terceiros) e esperar ~12 s antes de `summon`.
- **Segurança (impressoras reais)**: o assistente só faz `GET` nas impressoras reais. Todo
  Pause/Resume/Cancel/Emergency stop numa impressora real é acionado **pelo usuário**. Nos testes
  manuais do assistente, usar o Moonraker falso do [quickstart §2](./quickstart.md#2-moonraker-falso-falhas-e-cliques-sem-risco).
- **Princípio II**: nenhuma chamada síncrona; todo comando tem `--connect-timeout`, `--max-time 60`
  e guarda de 61 s.
- **Princípio V**: lógica só em `Model.js` (puras, sem `Date.now()`, nunca lançam, devolvem o
  **mesmo** objeto quando nada muda); QML só processos, timers, bindings, teclas e layout.
- **Princípio VIII**: nenhuma cor, fonte ou dimensão literal em QML; usar `Style.*`, `Color.*`,
  `Util.alpha`, `bar.foreground`/`root.foreground`, `bar.urgent`/`root.urgent`, `root.fontFamily`.
- Todo texto visível em inglês, em `Model.TEXT` (o teste de `tests/view.test.js` que proíbe
  português cobre as chaves novas). Novas funções públicas entram no `module.exports`.
- Contratos: [model-api.md](./contracts/model-api.md) (assinaturas e tabelas de casos, cada linha
  é um teste), [display.md](./contracts/display.md), [moonraker.md](./contracts/moonraker.md).
- Commits só quando o usuário pedir.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: fixtures e esqueleto de teste que as fases seguintes usam.

- [X] T001 [P] Criar as fixtures sintéticas de ação em `tests/fixtures/` no formato `{ "exitCode", "stdout" }` de `tests/fixtures/README.md`: `action-ok.synthetic.json` (`exitCode 0`, `stdout` = `{"result":"ok"}` + `"\n200"`), `action-refused.synthetic.json` (`exitCode 0`, corpo `{"error":{"code":400,"message":"Macro CANCEL_PRINT failed:\nheater not ready"}}` + `"\n400"`, uma recusa genérica de macro com quebra de linha para exercitar `tidyMessage`; não usar "Print is not paused", que o Klipper devolve como ok, research R2) e `action-klippy-disconnected.synthetic.json` (`exitCode 0`, corpo `{"error":{"code":503,"message":"Klippy Host not connected"}}` + `"\n503"`)
- [X] T002 [P] Acrescentar a `tests/fixtures/README.md` uma seção "Action fixtures" explicando que as fixtures `action-*` são a saída de um `POST` de ação (mesmo formato), com o comando de captura `curl -sS -X POST --connect-timeout 3 --max-time 60 -H 'Accept: application/json' -w '\n%{http_code}' "http://$PRINTER/printer/print/pause"` e o aviso de que ele **pausa a impressora de verdade** e só deve ser rodado pelo usuário
- [X] T003 [P] Criar `tests/actions.test.js` com o cabeçalho dos outros arquivos (`node:test`, `node:assert/strict`, `loadModel`/`loadFixture` de `./helpers`, `const M = loadModel()`), um helper `printers()` com Voron (`192.168.1.50`) e uma impressora de endereço inválido (`"a b"`) via `M.normalizePrinters`, e um helper `status(state, extra)` que devolve `Object.assign(M.initialStatus(key), { state }, extra)`; sem testes ainda

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: o núcleo puro (ações, envio, resposta, slots) e o executor de comandos no
`BarWidget`, que todas as histórias usam.

**⚠️ CRITICAL**: nenhuma história começa antes desta fase.

### Tests (escrever primeiro; devem falhar)

- [X] T004 [P] Em `tests/view.test.js`, adicionar testes de `fill` com dois valores ([model-api.md › Textos novos](./contracts/model-api.md#textos-novos-em-text)): `fill("%1 on %2", "a", "b")` → `"a on b"`; passada única: `fill("%1 on %2", "a%2.gcode", "Voron")` → `"a%2.gcode on Voron"`; `fill("x %1", 5)` continua `"x 5"`; e verificar que `M.fill` é exportado
- [X] T005 [P] Em `tests/actions.test.js`, testes de `availableActions` (tabela de [data-model.md › Disponibilidade](./data-model.md#disponibilidade-por-estado-availableactionsstate-fr-001-a-fr-005): `printing` → `["pause","cancel","emergencyStop"]`, `paused` → `["resume","cancel","emergencyStop"]`, `idle` → `["emergencyStop"]`, `error`/`offline`/`""`/`null`/`42` → `[]`), de `ACTIONS` (paths `/printer/print/pause`, `/printer/print/resume`, `/printer/print/cancel`, `/printer/emergency_stop`; `confirm` true só em `cancel` e `emergencyStop`; `slot` `estop` só em `emergencyStop`), de `COMMAND_TIMEOUT_SEC === 60` e de `buildActionArgs` (args exatos de [model-api.md › buildActionArgs](./contracts/model-api.md#buildactionargsbaseurl-action-connecttimeoutsec--string) para `("http://voron.local", "pause", 3)`; ação desconhecida ou `baseUrl` `""` → `[]`)
- [X] T006 [P] Em `tests/actions.test.js`, testes de `parseActionResponse` com uma linha por item da tabela de [model-api.md › parseActionResponse](./contracts/model-api.md#parseactionresponsestdout-exitcode--actionresult), usando as fixtures `action-ok.synthetic` (`ok: true`, `message: ""`), `action-refused.synthetic` (`ok: false`, mensagem passada por `tidyMessage`, sem `\n`), `action-klippy-disconnected.synthetic`, e as existentes `refused` ("connection refused"), `dns` ("host not found"), `timeout` (`TEXT.commandTimeout`), `unauthorized` (`TEXT.unauthorized`); mais: `("\n204", 0)` → ok; `("\n302", 0)` → `"HTTP 302"`; `("", -1)` e `("", 127)` → "curl not found"; `("\n000", 0)` → `"HTTP 0"` (mesmo texto que `parseResponse` já produz); nunca lança com `null`/`undefined`/`{}`/`"lixo"`
- [X] T007 [P] Em `tests/actions.test.js`, testes do estado dos comandos ([data-model.md › Regras de envio](./data-model.md#regras-de-envio-plancommand) e [model-api.md › Estado dos comandos](./contracts/model-api.md#estado-dos-comandos)): `emptyCommands()`; `planCommand` aceito (`seq` 1, slot `busy` = `{ action: "pause", seq: 1, startedAt: now }`, `failure: null`, `request` com `key`, `seq`, `action`, `args` de `buildActionArgs(baseUrl, "pause", 3)` para `timeoutMs` 3000 e `guardMs` 61000); clique duplo (segundo `planCommand` com o `commands` resultante → `request: null` e **mesmo** objeto); `cancel` em `idle` → `null`; ação fora de `availableActions` → `null`; impressora com `invalidReason` → `null`; `emergencyStop` com `busy` ocupado → **aceito** no slot `estop`; `pause` com `estop` ocupado → `null`; segundo `emergencyStop` com `estop` ocupado → `null`; `planCommand` não altera a entrada; `acceptCommandResult` libera o slot certo por `seq` (busy e estop), `ok` → `failure: null`, falha → `failure = { action, message: "Pause failed: connection refused" }`, `seq` desconhecido/impressora ausente → mesmo objeto, segundo resultado com o mesmo `seq` → mesmo objeto; `reconcileCommands` remove chaves ausentes de `printers` e devolve o mesmo objeto sem remoções; nunca lança com entradas malformadas

### Implementation

- [X] T008 Em `Model.js`, extrair de `parseResponse` a função interna `readTransport(stdout, exitCode) → { reachable, httpStatus, errorMessage, data }` (curl ausente, códigos de saída offline, separação corpo/código, 401/403, ≥ 400 ou 0 com `error.message` ou `"HTTP <código>"`) e reescrever `parseResponse` sobre ela; **todos os testes da fatia 001 passam sem alteração** (depende de nenhum teste novo; pode ser feito primeiro)
- [X] T009 Em `Model.js`, fazer `fill(template, a, b)` substituir `%1` e `%2` numa única passada (`template.replace(/%([12])/g, …)`), mantendo a chamada com um valor; exportar `fill`; T004 passa
- [X] T010 Em `Model.js`, adicionar `ACTIONS` (tabela de [data-model.md › Action](./data-model.md#action-constante-em-modeljs): `path`, `confirm`, `slot`), `ACTION_GLYPHS` (Nerd Font do bar: `pause` nf-md-pause `"\u{f03e4}"`, `resume` nf-md-play `"\u{f040a}"`, `cancel` nf-md-stop `"\u{f04db}"`, `emergencyStop` nf-md-alert_octagon `"\u{f0028}"`, `busy` nf-md-loading `"\u{f0772}"`; conferir cada glifo na fonte do bar e trocar se não renderizar), `COMMAND_TIMEOUT_SEC = 60`, os textos de [model-api.md › Textos novos](./contracts/model-api.md#textos-novos-em-text) em `TEXT` (`actions`, `confirm`, `actionFailed`, `commandTimeout`), `availableActions(state)` e `buildActionArgs(baseUrl, action, connectTimeoutSec)`; exportar tudo; T005 passa
- [X] T011 Em `Model.js`, implementar `parseActionResponse(stdout, exitCode)` sobre `readTransport`, com curl 28 → `TEXT.commandTimeout`, 2xx → `{ ok: true, message: "" }`, e mensagens de erro do corpo passadas por `tidyMessage`; exportar; T006 passa
- [X] T012 Em `Model.js`, implementar `emptyCommands`, `planCommand(commands, printer, status, action, timeoutMs, now)`, `acceptCommandResult(commands, key, seq, result)` e `reconcileCommands(commands, printers)` conforme [model-api.md](./contracts/model-api.md#estado-dos-comandos) (ausente em `commands` = `emptyCommands()`; ocupar slot limpa `failure`; `guardMs = (COMMAND_TIMEOUT_SEC + 1) * 1000`); exportar; T007 passa
- [X] T013 Em `BarWidget.qml`, adicionar o executor de comandos: `property var commands: ({})` (sempre substituído, nunca alterado no lugar); `function runAction(key, action)` que acha o `PrinterConfig` e o status da `key`, chama `Model.planCommand(commands, printer, statuses[key], action, config.timeoutMs, Date.now())`, grava `commands` e, se houver `request`, cria um `commandComponent` em `requestHolder` com `{ key, seq, args, guardMs }`; `function acceptCommand(key, seq, result)` que faz `commands = Model.acceptCommandResult(commands, key, seq, result)`; `commandComponent` copiando o padrão de `requestComponent` (Process com `StdioCollector { waitForEnd: true }`, `exited`/`drained`, curl que não inicia → `parseActionResponse("", -1)`, guarda `Timer` de `guardMs` → `parseActionResponse("", 28)`, resultado único, `destroy()` no fim) mas chamando `Model.parseActionResponse` e `root.acceptCommand`; em `syncConfig`, `commands = Model.reconcileCommands(commands, config.printers)` e parar os processos de comando de chaves removidas (o `stopRequests` atual já percorre `requestHolder`; garantir que ele alcança os comandos, que têm `key`); `Component.onDestruction` para os comandos também
- [X] T014 Gate da fase: `node --test tests/` todo verde; `validate` e `qmllint` sem erro; reiniciar o shell e conferir no log (`qs log -p "$OMARCHY_PATH/shell" --tail 100`) que o plugin carrega sem avisos novos e as consultas continuam como na fatia 001

**Checkpoint**: núcleo pronto; o painel ainda não mostra botões.

---

## Phase 3: User Story 1 - Pausar e retomar uma impressão (Priority: P1) 🎯 MVP

**Goal**: Pause/Resume no painel da impressora selecionada, sem confirmação, com indicação de
andamento, bloqueio de reenvio e navegação por mouse e teclado.

**Independent Test**: com o Moonraker falso (fixture `printing`), abrir o painel, Pause (mouse e
Enter): um `POST /printer/print/pause` no log; Cancel e Emergency stop não enviam nada; o botão gira durante o atraso; ao trocar a
fixture para `paused`, aparece Resume e não Pause. Na impressora real, pelo usuário
([quickstart §6](./quickstart.md#6-teste-em-hardware-princípio-vii), passo 1).

### Tests for User Story 1

- [X] T015 [P] [US1] Em `tests/actions.test.js`, testes de `buildActionsModel(printer, status, printerCommands)` ([data-model.md › ActionsModel](./data-model.md#actionsmodel-derivado-para-o-painel-buildactionsmodel) e a tabela de [model-api.md › buildActionsModel](./contracts/model-api.md#buildactionsmodelprinter-status-printercommands--actionsmodel)): cada botão `{ id, label, glyph, confirm, urgent, busy, enabled }`; printing livre → `primary` pause+cancel habilitados, `emergency` habilitado; paused → resume+cancel; idle → `primary` vazio, só `emergency`; printing com `busy = pause` → pause `busy: true, enabled: false`, cancel `enabled: false`, emergency `enabled: true`; printing com `estop` ocupado → pause e cancel desabilitados, emergency `busy: true`; error/offline → `buttons` vazio, `emergency: null`; `urgent` só em `emergencyStop`; `enabled` bate com `planCommand(...).request !== null` em todos os casos; `filename` copiado do status; nunca lança
- [X] T016 [P] [US1] Em `tests/panel.test.js`, testes de `buildPanelModel(printers, statuses, selectedKey, now, commandsByKey)`: sem o 5º parâmetro, os campos da fatia 001 continuam iguais e `actions` existe com a impressora sem comandos; com `commandsByKey`, `actions` é o `buildActionsModel` da impressora **selecionada**; painel vazio → `actions` com `buttons: []`, `primary: []`, `emergency: null`, `failureText: ""`
- [X] T017 [P] [US1] Em `tests/panel.test.js`, testes de `cursorStops(panelModel)` e `stepCursor(stops, current, delta)` ([model-api.md › cursorStops](./contracts/model-api.md#cursorstopspanelmodel--string)): com dropdown e printing livre → `["printer","pause","cancel","emergencyStop"]`; uma impressora só (sem `options`) → sem `"printer"`; botões desabilitados ficam fora; `stepCursor` +1/−1 limitado às pontas (sem dar a volta); `current` `""` → primeira parada; `current` fora da lista (botão que ficou desabilitado) → primeira parada; lista vazia → `""`; nunca lança

### Implementation for User Story 1

- [X] T018 [US1] Em `Model.js`, implementar `buildActionsModel` (usa `availableActions` e `planCommand` para `enabled`; `failureText` = `failure.message` ou `""`, mesmo sem botões), acrescentar o parâmetro opcional `commandsByKey` a `buildPanelModel` (campo `actions`), implementar `cursorStops` e `stepCursor`, e criar `confirmMessage(action, displayName, filename)` e `confirmLabel(action)` devolvendo `""` para todas as ações (o T020 já as chama; T024 e T030 preenchem `cancel` e `emergencyStop`); exportar tudo; T015–T017 passam
- [X] T019 [US1] Em `BarWidget.qml`, passar `commands` para `Model.buildPanelModel(config.printers, statuses, selectedKey, now, commands)` no binding de `panelModel`
- [X] T020 [US1] Em `Panel.qml`, adicionar a área de ações abaixo das temperaturas e acima da linha "updated … ago" ([display.md › Posição no painel](./contracts/display.md#posição-no-painel)): `PanelSeparator` + `Column` visíveis quando `actions.buttons.length > 0 || actions.failureText !== ""`; linha `primary` com um `Button` por item (`Repeater`, largura dividida como a linha de perfis do painel de energia em `/usr/share/omarchy/shell/plugins/panels/power/Panel.qml`), `bordered: true`, `iconText` = `glyph` (ou `ACTION_GLYPHS.busy` com `iconSpinning: true` quando `busy`), `text` = `label`, `fontSize: Style.font.bodySmall`, `foreground: root.foreground`, `fontFamily: root.fontFamily`, `enabled` do modelo e opacidade reduzida quando desabilitado (constante relativa nomeada, como `pausedFillOpacity`); **a linha de emergência já é desenhada aqui** (um `Button` de largura total para `actions.emergency`, visível quando não é `null`, mesmo `hasCursor`/`onHovered`/`enabled`), para o cursor nunca parar num botão invisível (o destaque visual vem no T031); `function activate(id)` que (1) ignora `id` fora de `Model.cursorStops(root.panelModel)`, (2) para ação sem `confirm` chama `root.hostWidget.runAction(root.selected.key, id)` e (3) para ação com `confirm` não faz nada enquanto `Model.confirmLabel(id)` for `""` (até US2/US3 Cancel e Emergency stop ficam inertes; é proteção, não só adiamento)
- [X] T021 [US1] Em `Panel.qml`, trocar `cursorActive` por `property string cursorStop: ""` com as paradas de `Model.cursorStops(root.panelModel)`: `onMoveRequested(dx, dy)` → `cursorStop = Model.stepCursor(stops, cursorStop, (dx + dy) > 0 ? 1 : -1)`; `onActivateRequested` → `"printer"` abre o dropdown, id de botão → `activate(id)`; dropdown `hasCursor: cursorStop === "printer"`; botão `hasCursor: cursorStop === id` e `onHovered(true)` → `cursorStop = id` se habilitado; `open()` zera `cursorStop`; quando `cursorStop` sai de `stops`, ele cai na primeira parada pelo próprio `stepCursor` na próxima tecla
- [X] T022 [US1] Validar US1 com o Moonraker falso ([quickstart §3](./quickstart.md#3-cenários-moonraker-falso), "botões por estado" itens 1–3 e "em andamento" itens 1, 3 e 4): Pause/Resume por mouse e por teclado; atraso de 10 s → um único `POST` mesmo com cliques repetidos e Enter (SC-003); barra e outros painéis responsivos (SC-006); fechar e reabrir o painel durante o atraso mantém o comando; clicar Cancel e Emergency stop (mouse e Enter) não gera `POST`; SC-001: abrir o painel + Pause = 2 interações; capturas de tela do painel em printing/paused/idle

**Checkpoint**: Pause/Resume funcionam de ponta a ponta (a atualização do estado ainda espera o
próximo ciclo; a imediata vem em US4). Cancel e Emergency stop já aparecem, mas ficam inertes
(clique e Enter não fazem nada) até US2 e US3 (decisão da análise de 2026-09-29).

---

## Phase 4: User Story 2 - Cancelar uma impressão com confirmação (Priority: P1)

**Goal**: Cancel com confirmação nativa mostrando impressora e arquivo, segura por teclado e
mouse, descartada ao trocar de impressora.

**Independent Test**: Moonraker falso com `printing`: Cancel → diálogo com nome e arquivo, "Back"
selecionado; Enter logo em seguida, Escape e clique no fundo → nenhum `POST`; ← + Enter → um
`POST /printer/print/cancel`. Trocar de impressora com o diálogo aberto → fecha sem envio.

### Tests for User Story 2

- [X] T023 [P] [US2] Em `tests/actions.test.js`, testes de `confirmMessage(action, displayName, filename)` e `confirmLabel(action)` ([model-api.md › confirmMessage](./contracts/model-api.md#confirmmessageaction-displayname-filename--string)): `("cancel", "Voron", "hook.gcode")` → `Cancel the print "hook.gcode" on Voron?`; sem arquivo → `Cancel the current print on Voron?`; arquivo com `%2` no nome não é re-substituído; `pause`/`resume`/desconhecida → `""`; `confirmLabel("cancel")` → `"Cancel print"`, outras sem confirmação → `""`; nunca lança

### Implementation for User Story 2

- [X] T024 [US2] Em `Model.js`, preencher em `confirmMessage` e `confirmLabel` (criadas vazias no T018) o caso `cancel` (o caso `emergencyStop` entra em US3); T023 passa
- [X] T025 [US2] Em `Panel.qml`, adicionar o `ConfirmDialog` ([display.md › Confirmação](./contracts/display.md#confirmação)): `property string confirmAction: ""` e `property string confirmKey: ""`; o diálogo como filho do `PanelKeyCatcher`, irmão do `Flickable`, `anchors.fill: parent`, `z` acima do conteúdo, `opened: confirmAction !== ""`, `message: Model.confirmMessage(confirmAction, root.selected.displayName, root.panelModel.actions.filename)`, `cancelText: Model.TEXT.confirm.back`, `confirmText: Model.confirmLabel(confirmAction)`, `foreground: root.foreground` e `fontFamily: root.fontFamily`; `background`, `scrim`, `selectedBackground` e `selectedText` ficam nos padrões do componente (`Color.background`, `Util.alpha(...)`, `Color.accent`); em `activate(id)` para ação com `confirm`: `confirmKey = root.selected.key`, `confirmAction = id` e **`confirm.selectedIndex = 0`** a cada abertura; `onConfirmed` → `root.hostWidget.runAction(confirmKey, confirmAction)` e zera os dois; `onCanceled` → zera os dois
- [X] T026 [US2] Em `Panel.qml`, rotear as teclas do diálogo por propagação ([display.md › Confirmação](./contracts/display.md#confirmação)): o `focusTarget` do `KeyboardPanel` **continua** sendo o `keyCatcher`; `PanelKeyCatcher.blocked` = `printerDropdown.popupOpen || confirmAction !== ""`; envolver o `PanelKeyCatcher` num `Item` pai cujo `Keys.onPressed` só age com `confirmAction !== ""`: chama `confirm.handleKey(event)` e aceita o evento (Escape incluído, para não fechar o painel). A tecla não aceita pelo `keyCatcher` bloqueado sobe para esse pai. Conferir no shell que isso acontece; se não acontecer, usar o padrão do Clipboard (`/usr/share/omarchy/shell/plugins/clipboard/Clipboard.qml`, `keyCatcher`) e registrar no research R7
- [X] T027 [US2] Em `Panel.qml`, fechar a confirmação sem enviar quando: `open()` e `close()` do painel; `root.selected.key !== confirmKey` (seleção pelo dropdown ou automática, FR-016); o botão de `confirmAction` sumiu de `actions.buttons` ou ficou `enabled: false` (um `onPanelModelChanged`/`Connections` que confere e zera `confirmAction`/`confirmKey`)
- [X] T028 [US2] Validar US2 com o Moonraker falso ([quickstart §3](./quickstart.md#3-cenários-moonraker-falso), "Confirmação" itens 1, 2 e 4): Enter logo após abrir não envia (SC-004 teclado), Escape e clique no fundo não enviam (SC-004 mouse), Escape com o diálogo aberto fecha **só** o diálogo e o painel continua aberto, SC-001: abrir o painel + Cancel + confirmar = 3 interações, troca de impressora e fechar o painel descartam; a mensagem mostra o arquivo; os rótulos "Back"/"Cancel print" cabem nos botões de largura fixa do diálogo (se não couberem, encurtar em `TEXT.confirm`); o diálogo cabe no painel (se ficar cortado, garantir altura mínima em `contentHeight`)

**Checkpoint**: cancelar com confirmação funciona e é impossível sem confirmar.

---

## Phase 5: User Story 3 - Parada de emergência (Priority: P1)

**Goal**: Emergency stop destacado, separado de Cancel, com confirmação e disponível mesmo com
Pause/Resume/Cancel em andamento.

**Independent Test**: Moonraker falso: em printing/paused/idle o botão aparece em linha própria na
cor `urgent`; em error/offline não aparece; confirmar → um `POST /printer/emergency_stop`; com um
Pause atrasado em andamento, Emergency stop continua habilitado. Na impressora real, só pelo
usuário e com a impressora ociosa ([quickstart §6](./quickstart.md#6-teste-em-hardware-princípio-vii), passo 3).

### Tests for User Story 3

- [X] T029 [P] [US3] Em `tests/actions.test.js`, casos de `confirmMessage("emergencyStop", "Voron", "")` → `Emergency stop Voron? Klipper will shut down until a firmware restart.` e `confirmLabel("emergencyStop")` → `"Stop"`

### Implementation for User Story 3

- [X] T030 [US3] Em `Model.js`, preencher em `confirmMessage`/`confirmLabel` o caso `emergencyStop`; T029 passa
- [X] T031 [US3] Em `Panel.qml`, dar à linha de emergência criada no T020 o destaque e a separação de [display.md › Posição no painel](./contracts/display.md#posição-no-painel): espaço `Style.space(12)` entre a linha `primary` e ela, `background: Util.alpha(root.urgent, 0.22)` quando habilitado e texto em `root.foreground` (revisado na implementação: texto em `urgent` ficava igual a desabilitado no tema com `urgent` cinza), `bordered: true`, glifo `emergencyStop` (ou `busy` girando); com o T030 feito, `activate("emergencyStop")` passa a abrir a confirmação de US2 (FR-006, FR-009)
- [X] T032 [US3] Validar US3 com o Moonraker falso ([quickstart §3](./quickstart.md#3-cenários-moonraker-falso), "botões por estado" item 4, "Confirmação" item 3, "em andamento" item 2) e o [quickstart §5](./quickstart.md#5-tema): botão visível em printing/paused/idle, ausente em error/offline; confirmação com "Stop" e "Back" selecionado; Emergency stop habilitado durante um Pause atrasado; nada mais habilitado durante uma parada atrasada; distinguível em dois temas, um deles com `urgent` cinza (Solitude) — conferido no tema atual (`urgent` cinza); o segundo tema fica para o usuário no T043

**Checkpoint**: as três histórias P1 completas.

---

## Phase 6: User Story 4 - Saber se o comando funcionou (Priority: P2)

**Goal**: estado atualizado logo após a resposta do comando e mensagem curta de falha junto dos
botões, até a próxima ação ou a troca de impressora.

**Independent Test**: Moonraker falso: 200 com troca da fixture → painel muda em ≤ 2 s sem
esperar o intervalo; 401, 400 e servidor parado → mensagens "… failed: …"; timeout de 60 s →
mensagem e um único `POST`.

### Tests for User Story 4

- [X] T033 [P] [US4] Em `tests/engine.test.js`, testes do `followUp` ([model-api.md › Motor de consulta](./contracts/model-api.md#motor-de-consulta-alterações)): `initialStatus(k).followUp === false`; `requestFollowUp` com consulta pendente → cópia com `followUp: true`, sem pendente ou chave ausente → mesmo objeto; `planDispatch(statuses, printers, timeoutMs, key)` despacha só essa impressora e sai com `followUp: false`; `planDispatch` sem `onlyKey` igual à fatia 001 (testes existentes intactos); `acceptResult` preserva `followUp: true`; `planDispatch` com `onlyKey` de impressora pendente não gera requisição (nunca duas em voo)
- [X] T034 [P] [US4] Em `tests/actions.test.js`, testes de `clearFailures` (zera `failure` de todas, mantém `busy`/`estop`; sem falhas → mesmo objeto) e de `buildActionsModel` com `failure` e status `offline` → `buttons` vazio e `failureText` preenchido (SC-005); `planCommand` aceito limpa uma `failure` anterior

### Implementation for User Story 4

- [X] T035 [US4] Em `Model.js`, adicionar `followUp: false` a `initialStatus`, implementar `requestFollowUp(statuses, key)`, o parâmetro opcional `onlyKey` em `planDispatch` (zera `followUp` ao despachar) e `clearFailures(commands)`; `acceptResult` não mexe em `followUp`; exportar; T033–T034 passam e os testes da 001 continuam verdes
- [X] T036 [US4] Em `BarWidget.qml`: extrair de `refresh()` um `dispatch(onlyKey)` que chama `Model.planDispatch(statuses, config.printers, config.timeoutMs, onlyKey)` e cria os `requestComponent`; `refresh()` vira `dispatch("")`; em `acceptCommand`, depois de gravar `commands`, `statuses = Model.requestFollowUp(statuses, key)` e `dispatch(key)` (FR-014); em `accept`, depois de `acceptResult`, se `statuses[key]` tem `followUp: true`, `dispatch(key)`; em `selectPrinter`, `commands = Model.clearFailures(commands)` (FR-015)
- [X] T037 [US4] Em `Panel.qml`, mostrar `actions.failureText` abaixo dos botões ([display.md › Posição no painel](./contracts/display.md#posição-no-painel)): `Text` com `wrapMode: Text.WordWrap`, `textFormat: Text.PlainText`, `color: root.foreground` precedido de um glifo de alerta em `root.urgent` (revisado na implementação: texto em `urgent` cinza ficava pouco legível), `font.pixelSize: Style.font.bodySmall`, visível quando não vazio, inclusive sem botões
- [X] T038 [US4] Validar US4 com o Moonraker falso ([quickstart §3](./quickstart.md#3-cenários-moonraker-falso), "Retorno" itens 1–7): mudança em ≤ 2 s após a resposta com intervalo de 5 s (SC-002); mensagens para 401, 400 com mensagem, servidor parado (continua visível com a impressora offline, SC-005) e timeout de 60 s com um único `POST` (FR-013); mensagem some na ação seguinte e na troca de impressora; resultado de comando que termina depois da troca aparece só na impressora que o recebeu

**Checkpoint**: todas as histórias completas.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T039 [P] Atualizar `README.md`: área de ações (Pause/Resume, Cancel e Emergency stop, quando aparecem, confirmação, disponibilidade do e-stop durante outros comandos, timeout de 60 s sem reenvio), a linha do `curl` em **Dependencies** dizendo que ele também envia os comandos (`POST`) e o aviso de que o computador precisa estar em `trusted_clients` para os comandos também
- [X] T040 [P] Em `manifest.json`, `version` de `0.1.0` para `0.2.0`
- [X] T041 [P] Auditoria do Princípio VIII: `grep -nE '#[0-9a-fA-F]{3,8}|Qt\.rgba|Qt\.rgb|font\.family *: *"|pixelSize *: *[0-9]' BarWidget.qml Panel.qml` sem resultados; auditoria do Princípio I: `find . -type l -not -path './.git/*'` vazio e `moduleName` intacto
- [X] T042 Executar o checklist de ciclo de vida ([quickstart §4](./quickstart.md#4-checklist-de-ciclo-de-vida-princípio-vi)): o da fatia 001 inteiro mais summon/hide com confirmação aberta, desabilitar com comando em andamento (`pgrep -af 'curl.*printer/'` vazio depois) e reiniciar o shell sem reenvio; FR-017: o ícone continua sem ações (esquerdo abre/fecha o painel, meio e direito não fazem nada, tooltip de uma linha); (feito em 2026-09-29, com impressoras falsas; `remove` adiado para depois do push) **antes de `omarchy plugin remove`, copiar a pasta do plugin para o scratchpad** (o remove apaga o repositório) e só remover com o trabalho enviado ao GitHub
- [X] T043 Teste em hardware ([quickstart §6](./quickstart.md#6-teste-em-hardware-princípio-vii)) com a Voron: o **usuário** aciona Pause, Resume, Cancel e (com a impressora ociosa) Emergency stop pelo painel e depois o `FIRMWARE_RESTART` pelo Mainsail; o assistente roda um observador `GET` em laço que grava `print_stats.state`/`webhooks.state` com horário e captura telas do painel; medir SC-002 pelo observador; registrar tudo em `specs/002-panel-print-actions/hardware-test.md` com o bloco do quickstart
- [X] T044 Depois de o usuário capturar `tests/fixtures/action-ok.json` real (quickstart §6, passo 5), adicionar o caso dela em `tests/actions.test.js` (`ok: true`) e ajustar `Model.js` se divergir da sintética
- [X] T045 Atualizar `specs/002-panel-print-actions/checklists/requirements.md` e marcar a fatia como concluída no `spec.md` (`Status`), com todos os gates verdes

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências.
- **Foundational (Phase 2)**: depende do Setup e bloqueia todas as histórias. T008 (refatoração
  de `readTransport`) não depende de teste novo e pode ser o primeiro.
- **US1 (Phase 3)**: depende da fase 2. É o MVP.
- **US2 (Phase 4)**: depende da fase 2 e da área de ações e do cursor de US1 (T020, T021), onde
  o botão Cancel e `activate` já existem.
- **US3 (Phase 5)**: depende de US2 (usa o `ConfirmDialog` de T025–T027). A linha de emergência
  já existe desde o T020, inerte até o T030.
- **US4 (Phase 6)**: a lógica (T033–T035) depende só da fase 2; T036 depende de T013; T037
  depende de T020.
- **Polish (Phase 7)**: depois de todas as histórias. T039–T041 podem começar antes.

### User Story Dependencies

```text
Setup → Foundational ─┬─ US1 ─ US2 ─ US3 ─┐
                      └─ US4 (lógica) ────┴─ US4 (QML) ─ Polish
```

### Within Each User Story

- Testes (falhando) → `Model.js` → `BarWidget.qml` → `Panel.qml` → validação.
- `Model.js`, `BarWidget.qml`, `Panel.qml` e `tests/actions.test.js` são arquivos únicos:
  tarefas no mesmo arquivo nunca rodam em paralelo, mesmo marcadas [P] em fases diferentes.

### Parallel Opportunities

- Setup: T001, T002 e T003 em paralelo.
- Foundational: T004 (`view.test.js`) em paralelo com T005 (`actions.test.js`); T006 e T007
  também escrevem em `actions.test.js`, então rodam em sequência depois do T005. T008 em paralelo
  com a escrita dos testes (arquivo diferente).
- US1: T015 (`actions.test.js`) em paralelo com T016/T017 (`panel.test.js`, entre si em
  sequência).
- US4: T033 (`engine.test.js`) em paralelo com T034 (`actions.test.js`), e ambos em paralelo com
  US2/US3.
- Polish: T039, T040 e T041 em paralelo.

---

## Parallel Example: Foundational

```bash
Task: "T004 Testes de fill com dois valores em tests/view.test.js"
Task: "T005 Testes de availableActions/ACTIONS/buildActionArgs em tests/actions.test.js"
Task: "T008 Extrair readTransport de parseResponse em Model.js"
```

## Parallel Example: User Story 4 junto com User Story 2

```bash
Task: "T033 [US4] Testes de followUp em tests/engine.test.js"
Task: "T023 [US2] Testes de confirmMessage/confirmLabel em tests/actions.test.js"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 (Setup) e Phase 2 (Foundational).
2. Phase 3 (US1): Pause/Resume no painel, a ação mais frequente e de menor risco.
3. **Parar e validar** com o Moonraker falso (T022); na impressora real, só com o usuário.

### Incremental Delivery

1. Setup + Foundational → núcleo e executor de comandos.
2. US1 → pausar/retomar (MVP).
3. US2 → cancelar com confirmação.
4. US3 → parada de emergência.
5. US4 → atualização imediata e mensagens de falha.
6. Polish → README, versão, auditorias, ciclo de vida e teste em hardware. **A fatia só está
   concluída depois de T042 e T043** (Princípios VI e VII).

---

## Notes

- [P] = arquivos diferentes, sem dependência pendente.
- Os testes devem falhar antes da implementação correspondente.
- Commits só quando o usuário pedir; push só quando ele disser "push".
- Fora de escopo (spec): abrir a interface web, reiniciar firmware pelo painel, temperaturas,
  velocidade, iniciar impressões, ações pela barra ou atalho, notificações.
