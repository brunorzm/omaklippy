---

description: "Task list for 003-open-web-ui"
---

# Tasks: Abrir a interface web da impressora pelo painel

**Input**: Design documents from `specs/003-open-web-ui/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: OBRIGATÓRIOS. A constituição (Princípio V) exige teste automatizado para toda função
pura nova ou alterada. Os testes são escritos antes da implementação e devem falhar primeiro.

**Organization**: tarefas agrupadas por história de usuário (US1–US3 da spec).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência pendente)
- **[Story]**: história da spec (US1…US3)
- Caminhos relativos à raiz do plugin (`~/.config/omarchy/plugins/io.github.brunorzm.omaklippy/`)

## Regras que valem para TODAS as tarefas

- **Gate de tarefa (Princípio VI)**: toda tarefa só termina quando `omarchy plugin validate .` e
  `qmllint -I "$OMARCHY_PATH/shell" BarWidget.qml Panel.qml` passam sem erro e `node --test tests/`
  está no estado esperado:
  - **tarefas de implementação e de verificação**: todos os testes passam;
  - **tarefas que escrevem testes**: os anteriores continuam passando (salvo os que a própria
    tarefa atualiza) e os novos falham só pela implementação que falta, nunca por erro de
    sintaxe ou `require`.
- **Testes antigos que mudam de propósito** (não são regressão do SC-005): a expectativa de
  `emptyCommands()` (ganha `web: null`), as listas de `buttons` e de `cursorStops` (ganham
  `openWebUi` no fim) e "error/offline → `buttons: []`" (passa a ter só `openWebUi`). São
  exatamente estes testes: em `tests/actions.test.js`, "emptyCommands", "planCommand accepts an
  available action and fills the busy slot" (a entrada ganha `web: null`), "buildActionsModel:
  buttons per state", "buildActionsModel: enabled matches planCommand everywhere" e
  "buildActionsModel shows a failure even when no button is left (printer went offline)"; em
  `tests/panel.test.js`, "buildPanelModel without printers is the empty state" (o bloco de ações
  vazio ganha `web: null`; achado na implementação), "buildPanelModel without commands still
  carries the selected printer's actions", "buildPanelModel uses the commands of the selected printer only" e "cursorStops lists
  the dropdown and the enabled buttons in reading order". Cada tarefa que muda um deles diz qual.
  Nenhum outro teste da 001/002 pode mudar.
- **Lint real do QML**: usar um diretório no scratchpad com `qs/Commons` e `qs/Ui` apontando
  para `/usr/share/omarchy/shell/{Commons,Ui}` e somar `-I <scratch>` (nunca symlinks no plugin).
- **Recarregar**: depois de mudar código, `omarchy-restart-shell` e esperar ~12 s antes de
  `summon`. Editar qualquer arquivo do plugin (até `tasks.md`) durante um teste ao vivo dispara
  hot reload e congela o polling: reiniciar o shell depois.
- **Segurança**: esta fatia não envia nada às impressoras. O assistente só faz `GET` nas
  impressoras reais e não aciona Pause/Resume/Cancel/Emergency stop nelas. Testes manuais com o
  Moonraker falso da [002](../002-panel-print-actions/quickstart.md#2-moonraker-falso-falhas-e-cliques-sem-risco),
  com backup e restauração do `shell.json`.
- **Princípio II**: a abertura roda num `Process` com guarda de 10 s; nada síncrono.
- **Princípio III**: argv sem shell (`["omarchy-launch-browser", url]`); nenhum outro binário novo.
- **Princípio V**: lógica só em `Model.js` (puras, sem `Date.now()`, nunca lançam, devolvem o
  **mesmo** objeto quando nada muda). Novas funções públicas entram no `module.exports`.
- **Princípio VIII**: nenhuma cor, fonte ou dimensão literal em QML.
- Todo texto visível em inglês, em `Model.TEXT` (o teste de `tests/view.test.js` cobre as chaves
  novas).
- Contratos: [model-api.md](./contracts/model-api.md), [display.md](./contracts/display.md),
  tabelas do [data-model.md](./data-model.md) (cada linha de tabela é um caso de teste).
- Commits só quando o usuário pedir.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: arquivo de teste novo que as fases seguintes usam.

- [X] T001 Criar `tests/web.test.js` com o cabeçalho dos outros suites (`const test = require("node:test")`, `const assert = require("node:assert/strict")`, `const M = require("./helpers").loadModel()`) e um `printer(overrides)` que devolve `M.normalizePrinters([{ name: "Voron", address: "voron.local", ...overrides }])[0]`; sem casos ainda

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: endereço derivado, estado da abertura e o processo no `BarWidget`, que todas as
histórias usam.

**⚠️ CRITICAL**: nenhuma história começa antes desta fase.

### Tests (escrever primeiro; devem falhar)

- [X] T002 [P] Em `tests/web.test.js`, testes de `deriveWebUrl` com cada linha da tabela de [data-model.md](./data-model.md#deriveweburlbaseurl): `http://voron.local` → igual; `http://192.168.1.51:7125` → `http://192.168.1.51`; `https://p.lan:7125/x` → `https://p.lan/x`; `http://p.lan:8080` → igual; `http://h/mainsail` → igual; `""`, `null`, `5` → `""`; e o caso `http://h:17125` → igual (só a porta exata 7125 sai)
- [X] T003 Em `tests/web.test.js`, testes de `buildWebLaunchArgs` (`"http://x"` → `["omarchy-launch-browser", "http://x"]`; `""`/`null` → `[]`) e de `parseWebLaunchResult` pela tabela `WebLaunchResult` do data model: `(0, true)` → `{ ok: true, message: "" }`; `(-1, false)` → `{ ok: false, message: "omarchy-launch-browser not found" }`; `(1, true)` → `"browser launcher exited with code 1"`; `(-2, true)` → `"no answer from the browser launcher"`; nunca lança com entradas estranhas
- [X] T004 Em `tests/web.test.js`, testes de `planOpenWeb(commands, printer, now)`: aceita com `webUrl` válido (`request = { key, seq: 1, args: ["omarchy-launch-browser", "http://voron.local"], guardMs: 10000 }`, slot `web = { action: "openWebUi", seq: 1, startedAt: now }`, `failure` limpo); recusa devolvendo o **mesmo** `commands` e `request: null` quando `printer` não é objeto, quando `printer.webUrl === ""` e quando `web` já está ocupado; aceita com `busy` ou `estop` ocupados (FR-014); `seq` compartilhado com os comandos (depois de um `planCommand` com seq 1, a abertura recebe seq 2)
- [X] T005 [P] Em `tests/actions.test.js`: **atualizar** o teste `emptyCommands` para `{ busy: null, estop: null, web: null, failure: null, seq: 0 }` e "planCommand accepts an available action and fills the busy slot" (a entrada esperada ganha `web: null`; achado na implementação); novo teste "planCommand ignores the web slot" (com `web` ocupado, Pause/Cancel/Emergency stop são aceitos); novos casos de `acceptCommandResult` com o slot `web`: `seq` certo e `ok` → `web: null`, `failure: null`; `seq` certo e falha `{ ok: false, message: "x" }` → `failure.message === "Open web UI failed: x"` e `failure.action === "openWebUi"`; `seq` errado → mesmo objeto

### Implementation

- [X] T006 Em `Model.js`: `TEXT.actions.openWebUi = "Open web UI"`, `TEXT.launcherNotFound`, `TEXT.launcherExitCode` (`"browser launcher exited with code %1"`), `TEXT.launcherTimeout`; `ACTION_GLYPHS.openWebUi = "\u{f03cc}"` (conferir no bar que é o glifo "open in new" do Nerd Font; se não for, usar o código certo e anotar no research R4); `WEB_LAUNCH_TIMEOUT_SEC = 10`; `MOONRAKER_DEFAULT_PORT = 7125`; `deriveWebUrl(baseUrl)` pelo contrato; `normalizePrinters` preenche `webUrl: deriveWebUrl(baseUrl)` em todo item (o campo explícito vem no T017); exportar `WEB_LAUNCH_TIMEOUT_SEC` e `deriveWebUrl`. `ACTIONS` **não** ganha `openWebUi`
- [X] T007 Em `Model.js`: `emptyCommands()` com `web: null`; `buildWebLaunchArgs`, `parseWebLaunchResult`, `planOpenWeb` pelo contrato; `acceptCommandResult` procura o `seq` em `busy`, `estop` e `web`; `planCommand` sem mudança (continua olhando só `busy`/`estop`); exportar as funções novas. T002–T005 passam
- [X] T008 Em `BarWidget.qml`: `openWebUi(key)` (acha a impressora em `config.printers`, `Model.planOpenWeb(commands, printer, Date.now())`, atribui `commands`, cria `webLaunchComponent` em `requestHolder` com `{ key, seq, args, guardMs }` quando há `request`), `acceptWebLaunch(key, seq, result)` (`commands = Model.acceptCommandResult(...)`; se `result.ok && opened`, `close()`; **sem** `requestFollowUp`/`dispatch`) e o `Component` `webLaunchComponent` com o esqueleto do `commandComponent` sem stdout: `onStarted` → `launched = true`; `onExited(code)` → `complete(Model.parseWebLaunchResult(code, true))`; `onRunningChanged` com `!running && !launched && !finished` → `complete(Model.parseWebLaunchResult(-1, false))`; guarda → `complete(Model.parseWebLaunchResult(-2, true))`; `stop()` igual aos outros (sem resultado). Comentário curto explicando por que fecha só na saída 0 (research R1)

**Checkpoint**: lógica e executor prontos; nada visível no painel ainda.

---

## Phase 3: User Story 1 - Abrir a interface web da impressora selecionada (Priority: P1) 🎯 MVP

**Goal**: botão "Open web UI" em linha própria abaixo do e-stop, em qualquer estado, que abre o
endereço derivado da impressora selecionada e fecha o painel.

**Independent Test**: com duas impressoras cadastradas, selecionar cada uma, acionar Open web UI
(mouse e teclado) e conferir que o navegador abre a interface daquela impressora e o painel fecha;
em erro e offline o botão continua lá.

### Tests for User Story 1

- [X] T009 [P] [US1] Em `tests/settings.test.js`, casos de `webUrl` derivado em `normalizePrinters`: `voron.local` → `http://voron.local`; `ender.local:7125` → `http://ender.local`; `https://p.lan:7125/x` → `https://p.lan/x`; `a b` → `""`; `key`, `baseUrl` e `displayName` iguais aos de antes (o teste existente "derives key, order, baseUrl…" continua sem mudança)
- [X] T010 [US1] Em `tests/actions.test.js`: **atualizar** "buttons per state" (as listas de `buttons` ganham `openWebUi` no fim; em `error`/`offline`, `buttons` passa a ser `[openWebUi]` e `emergency` continua `null`; `primary` e `emergency` sem mudança) e "enabled matches planCommand everywhere" (compara só os botões com `id !== "openWebUi"`; para `openWebUi`, compara com `planOpenWeb(...).request !== null`); novos testes: campo `web` = `{ id: "openWebUi", label: "Open web UI", glyph: M.ACTION_GLYPHS.openWebUi, confirm: false, urgent: false, busy: false, enabled: true }` em todos os estados (`printing`, `paused`, `idle`, `error`, `offline`); `web: null` e sem `openWebUi` em `buttons` quando `printer.webUrl === ""`; com o slot `web` ocupado → `busy: true, enabled: false`; com `busy`/`estop` ocupados → `web.enabled` continua `true`; **atualizar** "buildActionsModel shows a failure even when no button is left (printer went offline)" (offline com falha → `buttons.map(b => b.id)` é `["openWebUi"]`, `failureText` igual); acrescentar a "buildActionsModel never throws" que o modelo vazio tem `web: null` (chave presente, não `undefined`)
- [X] T011 [US1] Em `tests/panel.test.js`: **atualizar** o teste de `cursorStops` (as listas ganham `"openWebUi"` no fim: `["printer", "pause", "cancel", "emergencyStop", "openWebUi"]` etc.; sem impressoras continua `[]`), "buildPanelModel without commands still carries the selected printer's actions" (`["pause", "cancel", "emergencyStop", "openWebUi"]`) e "buildPanelModel uses the commands of the selected printer only" (`[["emergencyStop", false], ["openWebUi", false]]`); `buildPanelModel([], …).actions.web === null` e **atualizar** "buildPanelModel without printers is the empty state" (bloco de ações com `web: null`); novos casos: impressora com endereço inválido (`a b`) mas status offline → `actions.buttons` vazio e `cursorStops` sem `openWebUi` (derivado `""`); impressora offline com endereço válido → `cursorStops` termina em `"openWebUi"`; slot `web` ocupado → `openWebUi` fora de `cursorStops`

### Implementation for User Story 1

- [X] T012 [US1] Em `Model.js`: o modelo inicial de `buildActionsModel` passa a ser `{ buttons: [], primary: [], emergency: null, web: null, failureText: "", filename: "" }` (a chave `web` sempre existe); `buildActionsModel` acrescenta `web` (pelo data model, `enabled` = `planOpenWeb` aceitaria agora) e o põe no fim de `buttons` quando `printer.webUrl !== ""`, sem mexer em `primary`/`emergency`; `cursorStops` acrescenta `openWebUi` depois de `emergencyStop` quando `actions.web` existe e está `enabled`. T009–T011 passam
- [X] T013 [US1] Em `Panel.qml`, dentro da `Column` de ações, depois do `emergencyButton` e antes da linha de falha: um `Item` espaçador de `Style.space(12)` visível quando o botão web e (a linha primary ou o e-stop) estão visíveis, e um `ActionButton` `webButton` com `visible: !!root.actions.web` (robusto a `null` e `undefined`), `width: parent.width`, `actionData: root.actions.web || ({})` e fundo transparente (sem `urgent`); atualizar o valor padrão de `actions` no topo para incluir `web: null`
- [X] T014 [US1] Em `Panel.qml`, `activate(id)`: antes da regra da 002, `if (id === "openWebUi") { if (stops.indexOf(id) >= 0 && hostWidget) hostWidget.openWebUi(selected.key); return }` (sem confirmação; a chave vai junto, FR-009)
- [X] T015 [US1] Validar US1 pelo [quickstart §3 US1](./quickstart.md#3-cenários) com o Moonraker falso (fixtures `printing`, `standby`, `shutdown`, servidor parado) e a configuração da §2 (linhas Fake e Fake7125): posição e visual do botão, URL aberta por impressora, painel fechando, teclado (`j` até a última parada e Enter), troca de impressora seguida de acionamento, sem impressoras → sem área de ações; capturas de tela no scratchpad (feito em 2026-09-29 pelo teclado com `wtype`: painel fecha e o Chromium abre `127.0.0.1:7126` e `127.0.0.1` para a Fake7125; o clique com o mouse fica para o usuário, não há ferramenta de mouse)

**Checkpoint**: MVP entregue (Voron e Biqu já funcionam sem configurar nada).

---

## Phase 4: User Story 2 - Endereço da interface web diferente do endereço do Moonraker (Priority: P2)

**Goal**: campo opcional `webUrl` por impressora, com prioridade sobre o derivado.

**Independent Test**: impressora com Moonraker numa porta diferente de 7125 e `webUrl`
separado → abre o `webUrl`; sem o campo → volta ao derivado; `webUrl` inválido → só o botão
some.

### Tests for User Story 2

- [X] T016 [P] [US2] Em `tests/settings.test.js`, casos de `webUrl` informado pela tabela de [data-model.md](./data-model.md#printerconfig-saída-de-normalizeprinters-campo-novo): `{ address: "lab.local:7130", webUrl: "http://lab.local:8080" }` → `http://lab.local:8080`; `webUrl: "voron.local:7125"` → `http://voron.local:7125` (explícito **não** perde a 7125); `webUrl: "http://h/web/"` → `http://h/web`; `webUrl: "a b"` e `"ftp://x"` → `""` com `baseUrl`, `invalidReason` e `key` inalterados; `webUrl: ""`, `"   "`, `5`, `null` → derivado; `{ address: "a b", webUrl: "http://ok" }` → `webUrl: "http://ok"` e `invalidReason: "invalid address"`; `readSettings` com `printers` como texto JSON contendo `webUrl` preserva o campo

### Implementation for User Story 2

- [X] T017 [US2] Em `Model.js`, `normalizePrinters`: quando `item.webUrl` é string e `trim()` não é vazio, `webUrl = normalizeAddress(item.webUrl)` (inválido → `""`, sem derivar); senão `deriveWebUrl(baseUrl)`. `key` continua `baseUrl + "#" + order`. T016 passa
- [X] T018 [US2] Validar US2 pelo [quickstart §3 US2](./quickstart.md#3-cenários) com as linhas FakeWeb, BadWeb e BadAddr da §2: URL aberta, botão ausente em BadWeb com status normal, BadAddr offline "invalid address" com o botão presente; configurações sem `webUrl` continuam iguais (SC-005) (feito em 2026-09-29: FakeWeb → `127.0.0.1:7125/web`, BadWeb sem botão e idle, BadAddr offline "invalid address" com botão → `127.0.0.1:7126/badaddr`)

**Checkpoint**: US1 e US2 funcionam de forma independente.

---

## Phase 5: User Story 3 - Saber quando a interface web não pôde ser aberta (Priority: P3)

**Goal**: falha ao abrir vira mensagem no painel, que continua aberto.

**Independent Test**: com um launcher falso que sai com 1, acionar Open web UI e ver
`Open web UI failed: browser launcher exited with code 1`; trocar de impressora limpa.

### Tests for User Story 3

- [X] T019 [P] [US3] Em `tests/web.test.js`: depois de `planOpenWeb` + `acceptCommandResult` com falha, `buildActionsModel(...).failureText === "Open web UI failed: <motivo>"`, inclusive com a impressora `offline` e com `error`; `clearFailures` limpa; um `planOpenWeb` ou `planCommand` seguinte limpa `failure` ("até a próxima ação"); falha de um comando da 002 também é limpa por `planOpenWeb`

### Implementation for User Story 3

- [X] T020 [US3] Conferir em `BarWidget.qml` e `Panel.qml` que nada fecha o painel ou esconde a linha de falha quando `result.ok` é falso (a linha de falha da 002 já lê `actions.failureText`; `showActions` já é verdadeiro com `failureText`); ajustar só se a verificação falhar. T019 passa
- [ ] T021 [US3] (**não realizável**, 2026-09-30: o `PATH` do shell começa com `/usr/share/omarchy/bin` e o launcher falso é ignorado; arquivo criado com aprovação e removido; US3 coberta pelos testes automáticos, ver `hardware-test.md`) Validar US3 pelo [quickstart §3 US3](./quickstart.md#3-cenários) **com aprovação do usuário** (arquivo fora da pasta do plugin): criar `~/.local/bin/omarchy-launch-browser` com `#!/bin/sh` e `exit 1`, `chmod +x`, acionar Open web UI e conferir a mensagem e o painel aberto; trocar de impressora e conferir que some; **remover o arquivo** e conferir `command -v omarchy-launch-browser` → `/usr/share/omarchy/bin/omarchy-launch-browser`; captura de tela no scratchpad

**Checkpoint**: todas as histórias funcionam.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T022 [P] Atualizar `README.md`: botão Open web UI na lista do painel (posição, em qualquer estado, fecha o painel, mensagem de falha), remover "Opening the web UI is not there yet", coluna/descrição de `webUrl` na tabela de configuração (opcional; sem ele, o endereço cadastrado sem a porta 7125) com um exemplo, linha nova em **Dependencies** para `omarchy-launch-browser` (obrigatório em runtime só para este botão; do pacote `omarchy`; ausente → "Open web UI failed: omarchy-launch-browser not found") e **Privileges** dizendo que o plugin abre o navegador padrão quando o usuário aciona o botão
- [X] T023 [P] Em `manifest.json`, `version` de `0.2.0` para `0.3.0`
- [X] T024 [P] Em `specs/002-panel-print-actions/contracts/display.md`, nota curta abaixo da tabela de estados apontando que a fatia 003 a substituiu (FR-013 da 003, [display.md da 003](../003-open-web-ui/contracts/display.md))
- [X] T025 [P] Auditorias: Princípio VIII `grep -nE '#[0-9a-fA-F]{3,8}|Qt\.rgba|Qt\.rgb|font\.family *: *"|pixelSize *: *[0-9]' BarWidget.qml Panel.qml` sem resultados; Princípio I `find . -type l -not -path './.git/*'` vazio e `moduleName` intacto; Princípio III `grep -n 'Process\|execDetached\|openUrlExternally' BarWidget.qml Panel.qml` só com os processos esperados (curl e o launcher)
- [X] T026 Validar FR-014 pelo [quickstart §3](./quickstart.md#3-cenários) (relação com a 002): Moonraker falso com `POST` atrasado 10 s, acionar Pause e, com o spinner, Open web UI → navegador abre, painel fecha, o `POST` aparece uma vez no log e o Pause termina (feito em 2026-09-29: um único `POST /printer/print/pause`, concluído 10 s depois, com o navegador já aberto)
- [X] T027 (feito em 2026-09-29/30; clique com o mouse e FR-015 conferidos pelo usuário; `remove`/reinstalar feito em 2026-09-30 depois do push; ver `hardware-test.md`) Checklist de ciclo de vida ([quickstart §4](./quickstart.md#4-ciclo-de-vida-princípio-vi)): clique, Escape, summon/hide, disable/enable (recadastrar as impressoras), `omarchy-restart-shell` com o navegador aberto pelo botão (o navegador continua); `remove` só depois do push e com cópia da pasta no scratchpad
- [X] T028 Teste em hardware ([quickstart §5](./quickstart.md#5-teste-em-hardware-princípio-vii)) com a Voron e a Biqu, com o usuário presente: acionar Open web UI em cada uma, conferir que o Mainsail/Fluidd certo abre e o painel fecha; medir SC-003 com o observador `hyprctl clients -j`; nenhum comando às impressoras; registrar em `specs/003-open-web-ui/hardware-test.md` com o bloco do quickstart
- [X] T029 Atualizar `specs/003-open-web-ui/checklists/requirements.md` se preciso e marcar a fatia como concluída no `spec.md` (`Status`), com todos os gates verdes. O Princípio VI exige o checklist de ciclo de vida completo, **incluindo** `omarchy plugin remove` e a reinstalação do T027: só marcar como concluída depois de o trabalho estar no GitHub e o remove/reinstall ter sido feito e registrado no `hardware-test.md` (mesmo acordo da 002); até lá, `Status` fica "Implementada; remove pendente do push"

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências.
- **Foundational (Phase 2)**: depende do T001 e bloqueia todas as histórias.
- **US1 (Phase 3)**: depende da fase 2. É o MVP.
- **US2 (Phase 4)**: a lógica (T016, T017) depende só do T006; a validação (T018) depende de US1
  (o botão precisa existir no painel).
- **US3 (Phase 5)**: T019 depende do T007 e do T012 (`failureText` via `buildActionsModel`);
  T020/T021 dependem de US1.
- **Polish (Phase 6)**: T022–T025 podem começar depois de US1; T026–T029 depois de todas as
  histórias.

### User Story Dependencies

```text
Setup → Foundational ─┬─ US1 ─┬─ US2 (validação) ─┐
                      │       └─ US3 ─────────────┼─ Polish
                      └─ US2 (lógica) ────────────┘
```

### Within Each User Story

- Testes (falhando) → `Model.js` → `BarWidget.qml`/`Panel.qml` → validação ao vivo.
- `Model.js`, `Panel.qml`, `tests/web.test.js`, `tests/actions.test.js` e
  `tests/settings.test.js` são arquivos únicos: tarefas no mesmo arquivo nunca rodam em paralelo,
  mesmo marcadas [P] em fases diferentes.

### Parallel Opportunities

- Foundational: T002 → T003 → T004 (`web.test.js`, em sequência) em paralelo com
  T005 (`actions.test.js`).
- US1: T009 (`settings.test.js`) em paralelo com T010 (`actions.test.js`) e T011
  (`panel.test.js`).
- US2 (T016) em paralelo com US1 (arquivo de teste diferente de T010/T011; em sequência com
  T009 no mesmo arquivo).
- Polish: T022, T023, T024 e T025 em paralelo.

---

## Parallel Example: Foundational

```bash
Task: "T002 Testes de deriveWebUrl em tests/web.test.js"
Task: "T005 emptyCommands/planCommand/acceptCommandResult com slot web em tests/actions.test.js"
```

## Parallel Example: User Story 1

```bash
Task: "T009 [US1] webUrl derivado em tests/settings.test.js"
Task: "T010 [US1] ActionsModel com openWebUi em tests/actions.test.js"
Task: "T011 [US1] cursorStops com openWebUi em tests/panel.test.js"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 (Setup) e Phase 2 (Foundational).
2. Phase 3 (US1): o botão com o endereço derivado já cobre a Voron e a Biqu.
3. **Parar e validar** com o Moonraker falso (T015).

### Incremental Delivery

1. Setup + Foundational → endereço derivado, slot `web`, launcher no `BarWidget`.
2. US1 → botão no painel (MVP).
3. US2 → campo `webUrl`.
4. US3 → falha visível e validada com launcher falso.
5. Polish → README, versão, auditorias, FR-014, ciclo de vida e hardware. **A fatia só está
   concluída depois de T027 e T028** (Princípios VI e VII).

---

## Notes

- [P] = arquivos diferentes, sem dependência pendente.
- Os testes devem falhar antes da implementação correspondente.
- Commits só quando o usuário pedir; push só quando ele disser "push".
- Fora de escopo (spec): abrir pela barra, atalho global ou IPC; interface embutida; escolher o
  navegador; descoberta na rede; reiniciar firmware pelo painel.
