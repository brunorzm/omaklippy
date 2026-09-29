---

description: "Task list for 001-printer-status-bar"
---

# Tasks: Status das impressoras 3D na barra

**Input**: Design documents from `specs/001-printer-status-bar/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: OBRIGATÓRIOS. A constituição (Princípio V) exige teste automatizado para toda função
pura nova ou alterada. Os testes de cada história são escritos antes da implementação e devem
falhar primeiro.

**Organization**: tarefas agrupadas por história de usuário (US1–US5 da spec).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência pendente)
- **[Story]**: história da spec (US1…US5)
- Caminhos relativos à raiz do plugin (`~/.config/omarchy/plugins/io.github.brunorzm.omaklippy/`)

## Regras que valem para TODAS as tarefas

- **Gate de tarefa (Princípio VI)**: toda tarefa só termina quando `omarchy plugin validate .` e
  `qmllint -I "$OMARCHY_PATH/shell" BarWidget.qml` (mais `Panel.qml`, quando ele existir) passam
  sem erro, e quando `node --test tests/` está no estado esperado:
  - **tarefas de implementação e de verificação**: todos os testes passam;
  - **tarefas que escrevem testes** (TDD): os testes **anteriores** continuam passando e os
    **novos** falham só por causa da implementação que falta (função inexistente ou resultado
    errado), nunca por erro de sintaxe, de fixture ou de `require`. A tarefa de implementação
    seguinte deixa tudo verde.
- **Princípio II**: nenhuma chamada síncrona em QML/JS; toda requisição tem timeout.
- **Princípio V**: lógica só em `Model.js` (funções puras, sem `Date.now()`; recebem `now`); o QML
  só cuida de ciclo de vida, processos, timers, bindings e layout.
- **Princípio VIII**: nenhuma cor, fonte ou dimensão literal em QML; usar `Color.*`, `Style.*`,
  `Util.alpha`, `bar.barForeground`, `bar.urgent` e `bar.fontFamily`.
- `Model.js` não usa `.pragma library` e termina com
  `if (typeof module !== "undefined") module.exports = { ... }`, exportando toda função pública.
- `moduleName: "io.github.brunorzm.omaklippy"` em todo arquivo QML.
- Contratos de referência: [model-api.md](./contracts/model-api.md) (assinaturas e tabelas de
  casos), [display.md](./contracts/display.md) (visual e interações),
  [settings.md](./contracts/settings.md), [moonraker.md](./contracts/moonraker.md).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: deixar o plugin carregável e com a estrutura do plano; hoje ele não carrega (o
`Model.js` não existe e o `Panel.qml` é uma cópia do `BarWidget.qml` do relógio).

- [ ] T001 Remover `Panel.qml` (cópia acidental do BarWidget do relógio; será recriado em US3) com `git rm Panel.qml`
- [ ] T002 Criar `Model.js` com a constante `PRINTER_GLYPH` (glifo Nerd Font de impressora 3D, p. ex. `"\u{f042b}"` md-printer-3d, conferido na fonte do bar) e o rodapé `module.exports`; precisa existir antes do T003, que o importa
- [ ] T003 Reescrever `BarWidget.qml` como esqueleto mínimo: `BarWidget { id: root; moduleName: "io.github.brunorzm.omaklippy" }` com `implicitWidth`/`implicitHeight` de um `BarIconButton { id: button; anchors.fill: parent; bar: root.bar; text: Model.PRINTER_GLYPH }`, importando `QtQuick`, `Quickshell`, `Quickshell.Io`, `qs.Commons`, `qs.Ui` e `"Model.js" as Model`; remover o relógio, o `SystemClock`, o `Loader` do painel e o `IpcHandler` `omarchy.clock`
- [ ] T004 [P] Reescrever `manifest.json` conforme [contracts/settings.md](./contracts/settings.md#manifest): corrigir a descrição ("3D printer status and control for Klipper/Moonraker"), manter `kinds: ["bar-widget"]`, `entryPoints.barWidget: "BarWidget.qml"`, `category: "Devices"`, `allowMultiple: true`, `defaultSection: "right"`, adicionar `defaults` `{ "printers": [], "refreshIntervalSec": 5, "timeoutSec": 3 }` e `schema` com os inteiros `refreshIntervalSec` (min 2, max 3600, step 1, defaultValue 5) e `timeoutSec` (min 1, max 30, step 1, defaultValue 3)
- [ ] T005 [P] Criar `LICENSE` (MIT, autor "Bruno", ano 2026), como já declarado no manifest, e um `README.md` mínimo (Princípio III: todo binário externo documentado **antes** de ser usado) com o que o plugin faz, a seção **Dependências** (`curl`, obrigatório em tempo de execução, usado para consultar o Moonraker com tempo limite; `node`, só para rodar os testes) e a seção **Privilégios** (sem sudo, sem scripts de instalação, nenhum arquivo fora da pasta do plugin)
- [ ] T006 [P] Criar `tests/fixtures/README.md` descrevendo o formato de fixture: um JSON `{ "exitCode": <int>, "stdout": "<corpo>\n<http_code>" }`, ou seja, a saída crua do curl com `-w '\n%{http_code}'`; o sufixo `.synthetic.json` marca as sintéticas; incluir o comando de captura de [quickstart.md §2](./quickstart.md#2-conferir-a-impressora-fora-do-shell)
- [ ] T007 [P] Criar `tests/helpers.js` com `loadModel()` (faz `require("../Model.js")`) e `loadFixture(name)` (lê `tests/fixtures/<name>.json` e retorna `{ exitCode, stdout }`)
- [ ] T008 Rodar o gate de tarefa; habilitar o plugin (`omarchy plugin enable io.github.brunorzm.omaklippy`) e confirmar que o glifo aparece na barra sem erro em `qs log -p "$OMARCHY_PATH/shell" --tail 100`

**Checkpoint**: o plugin carrega e mostra um ícone estático; validate, qmllint e node passam.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: ler a configuração, consultar cada impressora de forma assíncrona e com timeout, e
interpretar uma resposta de sucesso. Todas as histórias dependem disso.

**⚠️ CRITICAL**: nenhuma história começa antes desta fase.

### Tests (escrever primeiro; devem falhar)

- [ ] T009 [P] Criar fixtures sintéticas de sucesso em `tests/fixtures/` (`printing`, `paused`, `standby`, `complete`, `cancelled`, `no-heater-bed`, todas `.synthetic.json`, com exitCode 0 e HTTP 200) a partir dos exemplos de [moonraker.md](./contracts/moonraker.md#respostas-esperadas); `printing` com `virtual_sdcard.progress` 0.427, `print_duration` 1200.1, `filename` "hook.gcode", extruder 214.8/215, heater_bed 60.1/60
- [ ] T010 [P] Escrever `tests/settings.test.js` (node:test + node:assert) cobrindo `readSettings` e os limites "intervalo 5 s em [2, 3600]; timeout 3 s em [1, 30]; valor inválido usa o padrão", `printers` que não é array → `[]`, "itens sem `address` são ignorados", e cada linha da tabela de `normalizeAddress` em [model-api.md](./contracts/model-api.md#normalizeaddresstext--string), além de `normalizePrinters` (`key` = `baseUrl + "#" + índice`, `order`, `invalidReason` "endereço inválido" quando `baseUrl === ""`, "nome vazio → host da URL")
- [ ] T011 [P] Escrever `tests/request.test.js` cobrindo `buildQueryUrl` (URL exata do contrato) e `buildCurlArgs(url, 3)` (array exato de [model-api.md](./contracts/model-api.md#buildcurlargsurl-timeoutsec--string))
- [ ] T012 [P] Escrever `tests/response.test.js` cobrindo `parseResponse` com as fixtures de T009 (campos de `Reading` de [data-model.md](./data-model.md#reading-resultado-de-uma-consulta-produzido-por-parseresponse); "campos ausentes viram `null`/`""`", "números não finitos viram `null`"; progresso de `virtual_sdcard` com fallback para `display_status`), `deriveState` para `printing`/`paused`/`standby`/`complete`/`cancelled`/`""`, cada caso de `computePercent` (`0.427 → 42`, `0.999 → 99`, `1 → 99`, `-0.1 → 0`, `null` fora de printing/paused), `estimateRemaining` (`null` se `progress < 0.01`, `printDuration <= 0` ou fora de printing/paused), `stateLabel`, `initialStatus(key)` (`state: "offline"`, `reason: "aguardando primeira resposta"`, `offlineSince: null`, `lastSeenAt: null`, `pending: false`, `seq: 0`, sem percent/temperaturas) e `applyReading` no caminho alcançável (`offlineSince = null`, `lastSeenAt = now`)
- [ ] T013 [P] Escrever `tests/engine.test.js` cobrindo as funções do motor de consulta de [model-api.md](./contracts/model-api.md#motor-de-consulta): `reconcileStatuses` (mantém o status de chaves que continuam; cria `initialStatus` para as novas; impressora com `invalidReason` → offline com esse motivo; remove chaves que saíram; não altera o objeto de entrada), `planDispatch` (só impressoras válidas com `pending: false`; incrementa `seq`, marca `pending: true`; devolve `requests` com `key`, `seq` e `args` de `buildCurlArgs`; nenhuma requisição para quem está pendente) e `acceptResult` (aplica `applyReading` e zera `pending` só se a chave existe, `pending === true` e `seq` confere; seq antigo, chave removida ou segundo resultado com o mesmo seq → devolve `statuses` inalterado)

### Implementation

- [ ] T014 Implementar `readSettings`, `normalizeAddress` e `normalizePrinters` em `Model.js` para T010 passar (sem `disambiguateNames` ainda: `displayName = name`)
- [ ] T015 Implementar `buildQueryUrl` e `buildCurlArgs` em `Model.js` para T011 passar
- [ ] T016 Implementar `parseResponse` (só o caminho exitCode 0 + HTTP 200; os demais podem retornar um `Reading` degradado genérico até US2), `deriveState`, `computePercent`, `estimateRemaining`, `stateLabel`, `initialStatus(key)` e `applyReading` em `Model.js` para T012 passar
- [ ] T017 Implementar `reconcileStatuses`, `planDispatch` e `acceptResult` em `Model.js` para T013 passar
- [ ] T018 Implementar o motor de consulta em `BarWidget.qml`: `readonly property var config: Model.readSettings(root.settings)`; um `Instantiator` sobre `config.printers` criando, por impressora válida, um `QtObject` com `Process` (`command` = `args` do item de `requests` devolvido por `planDispatch`, `stdout: StdioCollector { waitForEnd: true }`) e `onExited(exitCode)` → `statuses = Model.acceptResult(statuses, key, seq, Model.parseResponse(text, exitCode), Date.now())`; `property var statuses` sempre substituída pelo objeto novo que o `Model` devolve (para notificar os bindings) e inicializada/atualizada com `Model.reconcileStatuses(statuses, config.printers)` quando `config` muda; `Timer { repeat: true; triggeredOnStart: true; interval: config.intervalMs }` que chama `Model.planDispatch(statuses, config.printers, config.timeoutMs)`, grava os `statuses` devolvidos e inicia um processo para cada item de `requests` (com o `seq` guardado no objeto do processo); e um `Timer` de guarda por requisição (`timeoutMs + 1000`) que faz `running = false` no processo e chama `acceptResult` com `{ reachable: false, errorMessage: "sem resposta (tempo limite)" }`. **Nenhuma decisão de estado no QML**: quem consultar, o que aceitar e o que limpar vêm do `Model` (Princípio V)
- [ ] T019 Adicionar `IpcHandler { target: "io.github.brunorzm.omaklippy"; function refresh(): void { root.broadcast("refresh") } }` e `function refresh()` (ciclo imediato respeitando `pending`) em `BarWidget.qml`; em `Component.onDestruction`, parar todos os processos em andamento
- [ ] T020 Rodar o gate; cadastrar uma impressora real (`omarchy bar set io.github.brunorzm.omaklippy printers '[{"name":"Teste","address":"<ip>"}]' --json`) e confirmar com `pgrep -af 'curl.*printer/objects'` que há no máximo um curl por impressora e que o log continua limpo

**Checkpoint**: o widget consulta as impressoras no intervalo configurado e mantém `statuses`
atualizado; as histórias podem começar.

---

## Phase 3: User Story 1 - Ver de relance na barra se a impressão vai bem (Priority: P1) 🎯 MVP

**Goal**: só o ícone na barra, com indicador de progresso, cor de alerta em erro, esmaecido em
offline e tooltip de uma linha, representando a impressora mais relevante.

**Independent Test**: com uma impressora real, iniciar, pausar e terminar uma impressão e
observar o ícone ([quickstart.md §4 US1](./quickstart.md#4-cenários-por-história-de-usuário-impressora-real)).

### Tests for User Story 1

- [ ] T021 [US1] Escrever `tests/view.test.js` cobrindo `pickHighlighted` ("Prioridade `error` > `printing` > `paused` > `offline` > `idle`; empate pela menor `order`"; lista vazia → `null`; impressoras com `invalidReason` contam como `offline`) e `buildIconState` (cada `mode` de [display.md](./contracts/display.md#ícone-na-barra); `progress` = `percent / 100` só em printing/paused; tooltips exatos `"Voron — imprimindo 42%"`, `"Voron — pausada 42%"`, `"Voron — ociosa"`, `"Voron — erro"`, `"Voron — offline"`, `"OmaKlippy — nenhuma impressora configurada"`)

### Implementation for User Story 1

- [ ] T022 [US1] Implementar `pickHighlighted` e `buildIconState` em `Model.js` para T021 passar
- [ ] T023 [US1] Em `BarWidget.qml`, adicionar `readonly property var iconState: Model.buildIconState(config.printers, statuses)` e trocar o `text` do `BarIconButton` por um `iconComponent` com o `OpticalGlyph` (`Model.PRINTER_GLYPH`, `fontFamily: button.fontFamily`) e, sob ele, dentro de `Style.bar.iconCanvas`, uma barra de progresso de dois `Rectangle`s (trilho `Util.alpha(root.bar.barForeground, …)`, preenchimento `root.bar.barForeground` com largura proporcional a `iconState.progress`, opacidade reduzida em `paused`; espessura e margens via `Style.space()`), visível só em printing/paused; `active` + `useActiveColor` com `activeColor: root.bar.urgent` em `error` (glifo e barra em urgent); `dimmed: iconState.mode === "offline"`; `tooltipText: iconState.tooltip`
- [ ] T024 [US1] Conferir o ícone em barra vertical (`omarchy bar position left`) e com dois temas diferentes (a barra de progresso acompanha as cores); voltar a posição original
- [ ] T025 [US1] Rodar o gate e os cenários de US1 do quickstart numa impressora real

**Checkpoint**: MVP. A barra mostra de relance se há impressão, o progresso aproximado, erro e
offline.

---

## Phase 4: User Story 2 - Saber quando a impressora está inacessível (Priority: P1)

**Goal**: timeouts, falhas de rede, Klipper fora do ar, 401 e respostas atrasadas viram
"offline" ou "erro" corretamente, sem sobrar dado velho.

**Independent Test**: desligar a impressora, o Wi-Fi, usar endereço errado, M112, parar o Klipper
e bloquear o IP ([quickstart.md §4 US2](./quickstart.md#4-cenários-por-história-de-usuário-impressora-real)).

### Tests for User Story 2

- [ ] T026 [P] [US2] Criar as fixtures sintéticas de falha em `tests/fixtures/` (`timeout` exitCode 28 stdout `"000"`, `refused` 7, `dns` 6, `bad-url` 3, `curl-missing` -1, `klippy-disconnected` 503 com `{"error":{"code":503,"message":"Klippy Host not connected"}}`, `unauthorized` 401, `shutdown` e `startup` com `webhooks.state`, `print-error` com `print_stats.state: "error"` e `message`, `garbage` 200 com HTML), todas `.synthetic.json`
- [ ] T027 [US2] Escrever `tests/errors.test.js` cobrindo cada linha das duas tabelas de `parseResponse` em [model-api.md](./contracts/model-api.md#parseresponsestdout-exitcode--reading) (mensagens exatas: "endereço inválido", "host não encontrado", "conexão recusada", "sem resposta (tempo limite)", "curl não encontrado", `"falha de rede (curl <código>)"`, "resposta inesperada", "acesso não autorizado — libere este computador em trusted_clients", `error.message` ou `"HTTP <código>"`), a ordem de avaliação de `deriveState` (passos 1–4), `applyReading` com `reachable:false` ("limpa `percent`, `remainingSec`, `filename`, `nozzle` e `bed`", "preserva `offlineSince` se já estava offline") e um teste de "nunca lança" para toda função exportada com `null`, `undefined`, `{}` e `"lixo"`

### Implementation for User Story 2

- [ ] T028 [US2] Completar `parseResponse`, `deriveState` e `applyReading` em `Model.js` para T027 passar (incluindo o `try/catch` em volta do `JSON.parse`)
- [ ] T029 [US2] Em `BarWidget.qml`, conferir que o descarte de respostas atrasadas ou fora de ordem (FR-012) passa só por `Model.acceptResult` (o `onExited` depois da guarda é ignorado porque `pending` já é `false`) e que impressoras com `invalidReason` não geram `Process` (`planDispatch` não as inclui); acrescentar a `tests/engine.test.js` o cenário "guarda dispara → offline; `onExited` tardio com o mesmo seq → ignorado"
- [ ] T030 [US2] Verificar empiricamente como o `Process` do Quickshell reporta um binário inexistente (rodar com `command: ["curl-nao-existe"]` e observar `onExited`/`running` no log); mapear esse caso para `Model.parseResponse("", -1)` em `BarWidget.qml` e registrar a observação num comentário curto
- [ ] T031 [US2] Rodar o gate e os cenários de US2 do quickstart (desligada, Wi-Fi, endereço errado, endereço inválido, M112, klipper parado, 401)

**Checkpoint**: nenhum dado velho aparece como atual; o ícone fica esmaecido em offline e na cor
de alerta em erro.

---

## Phase 5: User Story 3 - Ver os detalhes de uma impressora no painel (Priority: P1)

**Goal**: o clique no ícone abre um painel nativo (padrão Wi-Fi/Tailscale) com os detalhes da
impressora selecionada, atualizado ao vivo, que fecha com Escape, clique fora ou novo clique.

**Independent Test**: durante uma impressão real, abrir o painel, comparar com a interface web e
fechar pelas três formas ([quickstart.md §4 US3](./quickstart.md#4-cenários-por-história-de-usuário-impressora-real)).

### Tests for User Story 3

- [ ] T032 [US3] Escrever `tests/panel.test.js` cobrindo `formatTemp` (`{current:214.8,target:215}` → `"215/215 °C"`; target 0 → `"25 °C"`; `null` → `"—"`), `formatDuration` (`3725` → `"1h 02m"`; `59` → `"<1m"`; `null` → `"—"`), `formatAgo` (`95000` → `"há 1 min"`; `< 60000` → `"há <1 min"`), `resolveSelection` com `selectedKey` `""` (→ chave de `pickHighlighted`; sem impressoras → `""`) e `buildPanelModel` com uma impressora em cada estado, conforme a tabela "Variações do bloco de detalhe" de [display.md](./contracts/display.md#painel) (`showJob` só em printing/paused; `remainingText` "—" quando indisponível; `freshnessText` "sem resposta há 3 min" em offline e "atualizado há <1 min" fora dele; `rows` vazio com uma impressora)

### Implementation for User Story 3

- [ ] T033 [US3] Implementar `formatTemp`, `formatDuration`, `formatAgo`, `resolveSelection` e `buildPanelModel` (campos `empty`, `selected`, `showJob`; `rows` sempre `[]` por enquanto) em `Model.js` para T032 passar
- [ ] T034 [US3] Criar `Panel.qml`: raiz `Panel` (qs.Ui) com `moduleName: "io.github.brunorzm.omaklippy"`, `manageIpc: false`, as propriedades injetáveis `anchorItem` e `hostWidget`; `open()`/`close()` via `root.controller.show()`/`hide()`; um `KeyboardPanel` (`anchorItem`, `owner: root`, `bar: root.bar`, `open: root.opened`, `focusTarget: keyCatcher`, `contentWidth: panel.fittedContentWidth(Style.space(360))`, `contentHeight: panel.fittedContentHeight(column.implicitHeight, Style.space(560))`) contendo `PanelKeyCatcher` (`onCloseRequested: root.close()`, `onTabRequested: root.switchPanel(direction)`) → `Flickable` → `Column` com: `PanelHero` (título = nome, `meta` = "estado · N%", `detail` = motivo, `iconComponent` com o glifo), bloco de impressão (barra de progresso com %, arquivo, "Restante") visível só com `showJob`, temperaturas ("Bico", "Mesa") e a linha de atualização; o conteúdo vem de `hostWidget.panelModel`; seguir `tailscale/Panel.qml:403-470` como referência de estrutura e estilo
- [ ] T035 [US3] Em `BarWidget.qml`, implementar o contrato de painel do guia: `Loader { id: panelLoader; source: Qt.resolvedUrl("Panel.qml"); onLoaded: { injectPanel(); Qt.callLater(injectPanel) } }`, `injectPanel()` (bar, settings, anchorItem = button, hostWidget = root), `onBarChanged`/`onSettingsChanged: injectPanel()`, `readonly property bool opened`, `readonly property bool popoutSwitchClosing`, `open()`, `close()`, `toggle()`, `closeForPopoutSwitch()` repassados ao painel; `onPressed` do botão: botão esquerdo → `toggle()`, os outros não fazem nada; `readonly property var panelModel: Model.buildPanelModel(config.printers, statuses, "", now)`, com `property real now` atualizado por um `Timer` de 15 s ativo só com `opened`
- [ ] T036 [US3] Rodar o gate (qmllint com `BarWidget.qml` e `Panel.qml`), os cenários de US3 do quickstart e os passos Clique, Escape, Summon, Hide e Troca de painel do checklist de ciclo de vida ([quickstart.md §5](./quickstart.md#5-checklist-de-ciclo-de-vida-princípio-vi))

**Checkpoint**: o painel abre, mostra os detalhes e fecha como os painéis nativos.

---

## Phase 6: User Story 4 - Alternar entre impressoras no painel (Priority: P2)

**Goal**: com várias impressoras, a lista no painel permite escolher qual exibir; a escolha dura
a sessão do shell; nomes repetidos são distinguíveis.

**Independent Test**: cadastrar duas impressoras (uma pode ser um endereço inexistente), trocar a
seleção por mouse e teclado, fechar e reabrir ([quickstart.md §4 US4](./quickstart.md#4-cenários-por-história-de-usuário-impressora-real)).

### Tests for User Story 4

- [ ] T037 [US4] Estender os testes: em `tests/settings.test.js`, `disambiguateNames` ("mesmo `name`, sem diferenciar maiúsculas e ignorando espaços nas pontas" → `"<name> (<host[:porta]>)"`; nomes únicos inalterados); em `tests/panel.test.js`, `resolveSelection` com chave manual existente (mantida) e removida (→ mais relevante), e `buildPanelModel.rows` (todas as impressoras na ordem de cadastro com `key`, `displayName`, `stateLabel`, `percentText`, `selected`; vazio com uma impressora só)

### Implementation for User Story 4

- [ ] T038 [US4] Implementar `disambiguateNames` (chamado por `normalizePrinters`), `resolveSelection` completo e `rows` em `buildPanelModel` em `Model.js` para T037 passar
- [ ] T039 [US4] Em `BarWidget.qml`: `property string selectedKey: ""` (só em memória, nunca gravado), `function selectPrinter(key)`, zerar `selectedKey` quando a chave deixa de existir em `config.printers`, e passar `selectedKey` para `buildPanelModel`
- [ ] T040 [US4] Em `Panel.qml`: `PanelSectionHeader` "Impressoras" e um `Repeater` sobre `panelModel.rows` (visível só com `rows.length > 0`), com cada linha mostrando `displayName` à esquerda e "estado N%" à direita, a linha selecionada destacada com `Style.selectedFill`/tokens nativos, clique → `hostWidget.selectPrinter(key)`; cursor de teclado com `PanelKeyCatcher.onMoveRequested` (j/k/setas) e `onActivateRequested` (Enter) seguindo o padrão de cursor do `tailscale/Panel.qml`
- [ ] T041 [US4] Rodar o gate e os cenários de US4 do quickstart

**Checkpoint**: várias impressoras são navegáveis no painel.

---

## Phase 7: User Story 5 - Cadastrar impressoras nas configurações do widget (Priority: P2)

**Goal**: sem impressoras há um estado vazio útil; cadastrar, editar e remover impressoras vale
na hora, sem reiniciar; o README explica como.

**Independent Test**: começar sem impressoras, cadastrar, alterar o intervalo e remover, sempre
sem reiniciar ([quickstart.md §4 US5](./quickstart.md#4-cenários-por-história-de-usuário-impressora-real)).

### Tests for User Story 5

- [ ] T042 [US5] Estender `tests/panel.test.js` e `tests/view.test.js` com o estado vazio: `buildPanelModel` com `printers: []` → `empty: true`; `setupCommand()` retorna exatamente `omarchy bar set io.github.brunorzm.omaklippy printers '[{"name":"Minha impressora","address":"192.168.1.50"}]' --json`; `buildIconState` vazio → `mode: "empty"`

### Implementation for User Story 5

- [ ] T043 [US5] Implementar `setupCommand()` e o caminho `empty` em `Model.js` para T042 passar
- [ ] T044 [US5] Em `BarWidget.qml`, tratar mudanças de configuração ao vivo (FR-024): quando `config` muda, aplicar `statuses = Model.reconcileStatuses(statuses, config.printers)` (o `Model` decide o que entra e sai), parar os processos cujas chaves não existem mais em `statuses`, reiniciar o `Timer` com o novo `intervalMs` e disparar `refresh()` imediato; nenhuma comparação de listas no QML
- [ ] T045 [US5] Em `Panel.qml`, o estado vazio: `PanelHero` "OmaKlippy" / "nenhuma impressora configurada" e o texto de `Model.setupCommand()` num `TextEdit` somente leitura e selecionável (`readOnly: true`, `selectByMouse: true`, cores e fonte dos tokens)
- [ ] T046 [P] [US5] Completar o `README.md` criado no T005 (mantendo as seções Dependências e Privilégios): instalação (`omarchy plugin add`/`enable`), cadastro e ajustes via `omarchy bar set` (tabela de [settings.md](./contracts/settings.md)), requisito de `trusted_clients` no `moonraker.conf`, dependências (`curl` em tempo de execução; `node` só para testes), IPC `refresh`, como rodar os testes e o que fica para a fatia 002
- [ ] T047 [US5] Rodar o gate e os cenários de US5 do quickstart

**Checkpoint**: todas as histórias funcionam.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T048 Capturar fixtures reais de uma impressora (Princípio VII) com o comando de [quickstart.md §2](./quickstart.md#2-conferir-a-impressora-fora-do-shell) para `printing`, `paused`, `standby`, `complete`, `cancelled`, `shutdown`, `startup`, `klippy-disconnected` e `unauthorized`, salvando em `tests/fixtures/<nome>.json` (sem o sufixo `.synthetic`), adicionar casos em `tests/response.test.js`/`tests/errors.test.js` que usam as reais e ajustar `Model.js` se alguma divergir das sintéticas
- [ ] T049 [P] Auditoria do Princípio VIII: `grep -nE '#[0-9a-fA-F]{3,8}|Qt\.rgba|Qt\.rgb|font\.family *: *"|pixelSize *: *[0-9]' BarWidget.qml Panel.qml` sem resultados, e corrigir o que aparecer
- [ ] T050 [P] Auditoria do Princípio I: `moduleName` igual ao id do manifest em `BarWidget.qml` e `Panel.qml`; `grep -rn "omarchy.clock" --include=*.qml .` vazio; `find . -type l -not -path './.git/*'` vazio
- [ ] T051 Verificar SC-007: cadastrar 5 impressoras (3 inexistentes), confirmar no máximo 5 `curl` simultâneos por instância, o painel abrindo sem atraso e o log limpo
- [ ] T052 Executar o checklist de ciclo de vida completo ([quickstart.md §5](./quickstart.md#5-checklist-de-ciclo-de-vida-princípio-vi)), incluindo desabilitar com o painel aberto, reabilitar, `omarchy-restart-shell` e remover (reinstalar em seguida)
- [ ] T053 Executar o quickstart inteiro numa impressora real e registrar o resultado no bloco de [quickstart.md §6](./quickstart.md#6-registro-do-teste-em-hardware-princípio-vii), salvo em `specs/001-printer-status-bar/hardware-test.md` (Princípio VII)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências.
- **Foundational (Phase 2)**: depende do Setup e bloqueia todas as histórias.
- **US1 (Phase 3)**: depende só da fase 2. É o MVP.
- **US2 (Phase 4)**: depende da fase 2. Usa o ícone de US1 para mostrar erro/offline, mas a
  lógica (T026–T028) independe de US1.
- **US3 (Phase 5)**: depende da fase 2. Usa `pickHighlighted` (T022, de US1) via `resolveSelection`.
- **US4 (Phase 6)**: depende de US3 (lista dentro do painel).
- **US5 (Phase 7)**: depende da fase 2; T045 (estado vazio no painel) depende de US3. T046
  (README) pode ser feito a qualquer momento depois da fase 2.
- **Polish (Phase 8)**: depois de todas as histórias.

### User Story Dependencies

```text
Setup → Foundational ─┬─ US1 ─┬─ US3 ─ US4
                      │       └─ (US2 visual)
                      ├─ US2 (lógica)
                      └─ US5 (T044, T046) ── T045 depende de US3
                                  ↓
                               Polish
```

### Within Each User Story

- Fixtures → testes (falhando) → `Model.js` → QML → gate + quickstart.
- `Model.js`, `BarWidget.qml` e `Panel.qml` são arquivos únicos: tarefas no mesmo arquivo nunca
  rodam em paralelo.

### Parallel Opportunities

- Setup: T004, T005, T006 e T007 em paralelo (arquivos diferentes), depois de T001–T003
  (T002 cria o `Model.js` que o T003 importa).
- Foundational: T009–T013 em paralelo (fixtures e quatro arquivos de teste distintos).
- US2: T026 (fixtures) em paralelo com o fim de US1.
- US5: T046 (README) em paralelo com qualquer tarefa de código.
- Polish: T049 e T050 em paralelo.

---

## Parallel Example: Foundational

```bash
Task: "T009 Criar fixtures sintéticas de sucesso em tests/fixtures/"
Task: "T010 Escrever tests/settings.test.js"
Task: "T011 Escrever tests/request.test.js"
Task: "T012 Escrever tests/response.test.js"
Task: "T013 Escrever tests/engine.test.js"
```

## Parallel Example: User Story 2 + User Story 5

```bash
Task: "T026 [US2] Criar fixtures sintéticas de falha em tests/fixtures/"
Task: "T046 [US5] Criar README.md"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 (Setup) e Phase 2 (Foundational).
2. Phase 3 (US1): o ícone com indicador já responde "a impressão vai bem?" de relance.
3. **Parar e validar** com a impressora real (T025).

### Incremental Delivery

1. Setup + Foundational → o plugin consulta as impressoras.
2. US1 → ícone de relance (MVP).
3. US2 → confiança: offline e erro corretos.
4. US3 → painel de detalhes.
5. US4 → várias impressoras.
6. US5 → estado vazio, configuração ao vivo e README.
7. Polish → fixtures reais, auditorias, ciclo de vida e registro de hardware. **A fatia só está
   concluída depois de T052 e T053** (Princípios VI e VII).

---

## Notes

- [P] = arquivos diferentes, sem dependência pendente.
- Commitar ao fim de cada tarefa ou grupo lógico, sempre com o gate passando.
- Os testes devem falhar antes da implementação correspondente.
- Os botões de ação (pausar/retomar, cancelar, parada de emergência, abrir interface web) **não**
  entram aqui (FR-021); são a fatia 002.
