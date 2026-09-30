---

description: "Task list for 004-print-notifications"
---

# Tasks: Notificações de impressão no desktop

**Input**: Design documents from `specs/004-print-notifications/`

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

- **Gate de tarefa (Princípio VI)**: `omarchy plugin validate .` e
  `qmllint -I "$OMARCHY_PATH/shell" BarWidget.qml Panel.qml` sem erro, e `node --test tests/` no
  estado esperado (implementação/verificação: tudo passa; escrita de testes: os anteriores passam,
  salvo os que a tarefa atualiza, e os novos falham só pela implementação que falta).
- **Testes antigos que mudam de propósito** (não são regressão): em `tests/response.test.js`,
  "initialStatus is offline, waiting for the first answer" (ganha `printState: ""` e
  `requestedAt: null`); em `tests/panel.test.js`, "buildPanelModel without printers is the empty
  state" (ganha `notifyWarning: ""`). Se outro teste antigo quebrar por campo novo, registrá-lo
  aqui antes de atualizar; nenhum teste pode mudar por outro motivo.
- **Lint real do QML**: diretório no scratchpad com `qs/Commons` e `qs/Ui` apontando para
  `/usr/share/omarchy/shell/{Commons,Ui}` e `-I <scratch>` (nunca symlinks no plugin). O aviso
  `QProcess::ExitStatus … onExited` é o mesmo dos processos existentes.
- **Recarregar**: depois de mudar código, `omarchy-restart-shell` e esperar ~12 s. **`Shared.js`
  sobrevive ao hot reload**: mudanças nele só valem com o restart. Editar qualquer arquivo do
  plugin durante um teste ao vivo dispara hot reload: reiniciar o shell depois.
- **Segurança**: o assistente só faz `GET` nas impressoras reais; nunca provoca erro, parada de
  emergência ou desligamento nelas. Conclusão e pausa reais são feitas pelo usuário. Testes
  manuais com o Moonraker falso da [002](../002-panel-print-actions/quickstart.md#2-moonraker-falso-falhas-e-cliques-sem-risco),
  com backup e restauração do `shell.json`. Para parar processos, usar `pgrep` + `kill <pid>`,
  nunca `pkill -f` (mata o próprio shell do assistente).
- **Dois monitores**: o `summon` abre o painel nas duas barras; antes de uma rajada de `wtype`,
  conferir com uma tecla e captura que ela chegou ao painel.
- **Princípios**: II (envio em `Process` com guarda de 10 s), III (argv sem shell; `notify-send`
  documentado como opcional), V (regras em `Model.js`, puras; `Shared.js` só guarda objetos),
  VIII (nenhuma cor, fonte ou dimensão literal).
- Todo texto visível em inglês, em `Model.TEXT` (coberto pelo teste de `tests/view.test.js`). Novas
  funções públicas entram no `module.exports`.
- Contratos: [model-api.md](./contracts/model-api.md), [widget.md](./contracts/widget.md) e as
  tabelas do [data-model.md](./data-model.md) (cada linha é um caso de teste).
- Commits só quando o usuário pedir.

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 [P] Criar `tests/notify.test.js` com o cabeçalho dos outros suites (`node:test`, `node:assert/strict`, `const M = require("./helpers").loadModel()`, `loadFixture`) e helpers `status(state, extra)` (a partir de `M.initialStatus("k#0")`) e `answered(state, extra)` que já traz `printState`, `filename`, `nozzle`/`bed`; sem casos ainda
- [X] T002 [P] Criar `tests/fixtures/standby-heating.synthetic.json` a partir de `standby.synthetic.json` com `extruder.target` = `200.0` e `extruder.temperature` = `134.0` (Klipper pronto, `print_stats.state` `standby`), e citar a fixture na lista de `tests/fixtures/README.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: campos novos no status, o acompanhamento (`watch`) com semeadura, a montagem e o
envio da notificação, o estado compartilhado e o líder. Nenhuma regra de evento ainda.

**⚠️ CRITICAL**: nenhuma história começa antes desta fase.

### Tests (escrever primeiro; devem falhar)

- [X] T003 [P] Em `tests/response.test.js` e `tests/engine.test.js`: **atualizar** "initialStatus is offline, waiting for the first answer" (+ `printState: ""`, `requestedAt: null`, `klippyState: ""`); novos: `applyReading` com `printing.synthetic` → `printState "printing"` e `klippyState "ready"`, com `startup.synthetic` → `klippyState "startup"`, com `complete` → `"complete"` e `state "idle"`, offline → `printState ""`, e `requestedAt` preservado; `planDispatch(s, ps, 3000, "", 1234)` → `requestedAt 1234` em cada impressora consultada e intacto nas não consultadas; sem `now` → `requestedAt null`
- [X] T004 Em `tests/notify.test.js`: `emptyWatch()` = `{ seeded: false, last: null, silent: 0, lostNotified: false }`; `observe` semeia na primeira leitura **com resposta** sem eventos (para cada estado: `printing`, `paused`, `idle` com `printState "complete"`, `error`); leituras `offline` antes de semear não mudam nada nem geram eventos; `last` = `{ state, printState, filename, heating }` com `heating` = `nozzle.target > 0 || bed.target > 0`; estado repetido não gera evento; `observe` com `watch` inválido trata como vazio; `status` inválido devolve o mesmo `watch` e `[]`; `reconcileWatches` mantém só chaves existentes e devolve o mesmo objeto sem mudança
- [X] T005 Em `tests/notify.test.js`: `buildNotification` pela tabela `Notification` do data model para os quatro tipos (urgência `normal` para complete/paused e `critical` para failed/lostContact; títulos; corpo com e sem arquivo; `args` = `["notify-send", "-a", "OmaKlippy", "-u", <urgência>, "-i", "printer", <título>, <corpo>]`); tipo desconhecido → `null`; `parseNotifyResult` pela tabela `NotifyResult` (`(0,true)` ok; `(-1,false)` "notify-send not found"; `(-2,true)` "no answer from notify-send"; `(1,true)` "notification service unavailable (exit 1)"); `notifyWarning({available:false,message:"x"})` → `"Notifications unavailable: x"`, `available` `true`/`null` → `""`
- [X] T006 Em `tests/notify.test.js`: registro — `emptyRegistry()`; `registerInstance` devolve ids 1, 2; `isLeader` só para o primeiro; `unregisterInstance(1)` faz o 2 líder; remover id inexistente devolve o mesmo objeto; entradas inválidas nunca lançam

### Implementation

- [X] T007 Em `Model.js`: `printState`, `requestedAt` e `klippyState` em `initialStatus`/`applyReading` (offline → `printState ""` e `klippyState ""`; `requestedAt` nunca mexido por `applyReading`), parâmetro opcional `now` em `planDispatch` (ausente → `null`); T003 passa
- [X] T008 Em `Model.js`: `TEXT.notify` (textos do contrato), `NOTIFY_LOST_AFTER = 3`, `NOTIFY_TIMEOUT_SEC = 10`, `emptyWatch`, `observe` só com semeadura/atualização de `last`/contagem de `silent` (sem regras de evento ainda), `reconcileWatches`, `buildNotification`, `parseNotifyResult`, `notifyWarning`, `emptyRegistry`, `registerInstance`, `unregisterInstance`, `isLeader`; exportar; T004–T006 passam
- [X] T009 Criar `Shared.js` exatamente como em [widget.md](./contracts/widget.md#sharedjs-novo-pragma-library) (`.pragma library`, `var state = { registry: null, protections: {}, notify: { available: null, message: "" } }`)
- [X] T010 Em `BarWidget.qml`: `import "Shared.js" as Shared`; `instanceId` registrado em `Component.onCompleted` (criando `Shared.state.registry` com `Model.emptyRegistry()` se nulo) e removido em `Component.onDestruction` (junto com o `stopRequests(false)` existente, **num único** handler); `property var watches: ({})` reconciliado em `syncConfig`; `dispatch` passa `Date.now()` a `planDispatch`; em `accept`, só quando `acceptResult` devolveu objeto novo, `r = Model.observe(watches[key], statuses[key], false)` e `watches` atualizado; `sendNotification(key, event)` + `notifyComponent` (esqueleto do `webLaunchComponent`, sem stdout, guarda `NOTIFY_TIMEOUT_SEC`, `Model.parseNotifyResult`) enviando só se `Model.isLeader(...)`; `acceptNotify` grava `Shared.state.notify`; `stopRequests(true)` passa a ignorar itens com `key === ""`

**Checkpoint**: estrutura pronta; nenhum evento é gerado ainda.

> **Desvio registrado (2026-09-30)**: ao escrever `observe` no T008, as regras de evento (conclusão,
> falha, pausa, contato perdido e descarte com `protectedNow`) entraram junto. Os testes das
> histórias (T011, T014, T015, T018) passam a ser de verificação: escritos depois e passando de
> primeira, em vez de falhar antes.

---

## Phase 3: User Story 1 - Saber que a impressão terminou (Priority: P1) 🎯 MVP

**Goal**: uma notificação "Print complete" por conclusão, nunca por cancelamento, nunca no início
do shell, uma só com várias barras.

**Independent Test**: com uma impressão falsa em andamento, trocar para `complete` e ver 1
notificação com impressora e arquivo; cancelar (pausada → `standby`) e ver 0.

### Tests for User Story 1

- [X] T011 [US1] Em `tests/notify.test.js`, regra de conclusão: `last` printing/paused → leitura `idle` com `printState "complete"` → um evento `{ type: "complete", filename }` com o arquivo da leitura (ou de `last` se vazio); `complete` repetido → nada; `last` idle → `complete` → nada; cancelamentos: paused → `standby`, printing → `cancelled`, printing → `standby` → nada (FR-004, Voron); semeado já em `complete` → nada (SC-003)

### Implementation for User Story 1

- [X] T012 [US1] Em `Model.js`, `observe`: regra de conclusão pelo data model (`hasJob(last.state)` e `printState === "complete"` e `state !== "error"`); T011 passa
- [X] T013 [US1] Validar pelo [quickstart §3](./quickstart.md#3-cenários-com-o-moonraker-falso-dois-monitores-ligados) cenários 1, 5, 10 e 12 com o Moonraker falso e os dois monitores ligados, contando pelo [§2](./quickstart.md#2-contar-notificações) (conferir o formato dos arquivos do serviço na primeira vez); capturas de tela no scratchpad

**Checkpoint**: MVP entregue.

---

## Phase 4: User Story 2 - Saber que a impressão falhou (Priority: P1)

**Goal**: "Print failed" (fica na tela) quando imprimindo/pausada ou ociosa aquecendo vai para
erro; "Printer not responding" (fica na tela) após 3 leituras sem resposta durante uma impressão.

**Independent Test**: fixture `print-error.synthetic` durante uma impressão falsa → 1 falha;
servidor parado 4+ ciclos → 1 contato perdido; 2 ciclos → 0; `standby-heating` → `shutdown` → 1;
`standby` → `shutdown` → 0.

### Tests for User Story 2

- [X] T014 [US2] Em `tests/notify.test.js`, regra de falha: `last` printing/paused → `error` → `{ type: "failed", reason: status.reason, filename }`; `last` idle com `heating` → `error` → `failed` com `filename ""`; `last` idle sem aquecedor → `error` → nada; `error` repetido → nada; `error` → `idle` → nada; Klipper reiniciando (`klippyState "startup"`) a partir de printing ou de idle aquecendo → nada (FIRMWARE_RESTART, análise C1)
- [X] T015 [US2] Em `tests/notify.test.js`, contato perdido: `last` printing + 1 e 2 leituras `offline` → nada, e a volta → nada (SC-007 negativo); 3 `offline` seguidas → um `{ type: "lostContact", filename }`; 4ª e 5ª → nada (`lostNotified`); volta com resposta zera `silent`/`lostNotified`, e uma nova queda de 3 notifica de novo; `last` idle + 5 offline → nada; queda e volta já `complete` ou `error` → evento `complete`/`failed` normal (comparação com o último estado com resposta)

### Implementation for User Story 2

- [X] T016 [US2] Em `Model.js`, `observe`: regras de falha (as duas) e de contato perdido pelo data model (`NOTIFY_LOST_AFTER`); T014 e T015 passam
- [X] T017 [US2] Validar pelo quickstart §3 cenários 2, 6, 7, 8 e 9 (o 8 com `standby-heating.synthetic`); conferir que falha e contato perdido continuam na tela depois de 1 minuto e que a conclusão do US1 some sozinha (SC-009)

---

## Phase 5: User Story 3 - Saber que a impressão pausou sozinha (Priority: P2)

**Goal**: "Print paused" para toda pausa que não veio do painel; ações do painel (qualquer
monitor) protegem a impressora até a primeira leitura depois da resposta.

**Independent Test**: fixture `paused.synthetic` sem usar o painel → 1; Pause pelo painel → 0;
Pause do painel com `POST` recusado e depois uma pausa externa → 1.

### Tests for User Story 3

- [X] T018 [US3] Em `tests/notify.test.js`, regra de pausa: `last` printing → `paused` → `{ type: "paused", filename }`; `paused` repetido → nada; `last` paused → printing → paused → notifica de novo; com `protectedNow = true`, qualquer transição (pausa, falha, conclusão) → `[]`, mas o `watch` é atualizado (a leitura seguinte, sem proteção e ainda pausada, não notifica)
- [X] T019 [US3] Em `tests/notify.test.js`, proteções (por instância, análise I1): `protectStart` cria `{ pending: 1, answeredAt: null, released: {} }`, soma e zera `released`; `protectFinish(now)` subtrai (mínimo 0) e grava `answeredAt`; `isProtected(p, key, id)`; `releaseProtection(p, key, requestedAt, id, registry)` só libera `id` com `pending === 0` e `requestedAt >= answeredAt` (antes da resposta, com `requestedAt` anterior, com `null` → mesmo objeto); com duas instâncias, a liberação da 2 **não** libera a 1 (a consulta antiga da 1 ainda lida protegida) e a entrada só some quando as duas liberaram; dois comandos (Pause e Emergency stop) só liberam depois dos dois; sem entrada → mesmo objeto; nunca lança

### Implementation for User Story 3

- [X] T020 [US3] Em `Model.js`: regra de pausa em `observe`, descarte de eventos com `protectedNow`, e `protectStart`, `protectFinish`, `isProtected`, `releaseProtection` pelo contrato; exportar; T018–T019 passam
- [X] T021 [US3] Em `BarWidget.qml`: `runAction` chama `protectStart` em `Shared.state.protections` quando o comando é realmente criado; `acceptCommand` chama `protectFinish(key, Date.now())` antes do resto; `accept` passa `Model.isProtected(...)` a `observe` e depois aplica `releaseProtection(..., statuses[key].requestedAt)` (ordem do [widget.md](./contracts/widget.md#barwidgetqml))
- [X] T022 [US3] (2026-09-30: cenário 3 → 1; Pause pelo painel do DP-3 → 0; Pause do painel recusado (400) e pausa externa → 1. Pause pelo painel do eDP-1 feito pelo usuário no teste em hardware → 0) Validar pelo quickstart §3 cenários 3 e 4 com os dois monitores, acionando o Pause pelo painel **do monitor que não é o líder** (a proteção precisa valer entre instâncias); repetir o 4 com o falso recusando o `POST` (400) seguido de `paused.synthetic` → 1 notificação

---

## Phase 6: User Story 4 - Escolher o que notificar (Priority: P3)

**Goal**: quatro chaves `On`/`Off` na configuração, ligadas por padrão.

**Independent Test**: `notifyComplete: "Off"` → conclusão falsa gera 0; volta a `"On"` → 1.

### Tests for User Story 4

- [X] T023 [P] [US4] Em `tests/settings.test.js`: `readSettings({}).notify` = `{ complete: true, failed: true, paused: true, lostContact: true }`; `"Off"`, `"off"` e `false` desligam cada chave (`notifyComplete`, `notifyFailed`, `notifyPaused`, `notifyLostContact`); `"On"`, `true`, `"x"`, `5`, ausência → ligado
- [X] T024 [US4] Em `tests/notify.test.js`: `filterEvents` mantém só os tipos ligados (`lostContact` ↔ `notify.lostContact`), devolve `[]` com tudo desligado e nunca lança

### Implementation for User Story 4

- [X] T025 [US4] Em `Model.js`: `readSettings.notify` e `filterEvents` pelo contrato; em `BarWidget.qml`, `sendNotification` só para `Model.filterEvents(r.events, config.notify)`; T023–T024 passam
- [X] T026 [US4] Em `manifest.json`: as quatro entradas `enum` do [widget.md](./contracts/widget.md#manifesto) no `schema` e `"On"` nos `defaults`
- [X] T027 [US4] (feito em 2026-09-30: Off → 0, On → 1) Validar pelo quickstart §3 cenário 11 (editar o `shell.json`; a mudança vale ao vivo)

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T028 Indisponibilidade (FR-012): testes em `tests/panel.test.js` para `buildPanelModel(..., notifyWarningText)` (campo `notifyWarning`, também no modelo vazio; **atualizar** "buildPanelModel without printers is the empty state") e implementação em `Model.js`; em `BarWidget.qml`, `property string notifyWarningText` atualizado por `refreshNotifyWarning()` em `panelOpened()`, no timer de 15 s e em `acceptNotify`, e a sondagem `notify-send --version` uma vez ao virar líder com algum tipo ligado; em `Panel.qml`, a linha do [widget.md](./contracts/widget.md#panelqml) acima de "updated … ago"
- [X] T029 [P] Atualizar `README.md`: seção de notificações (quando cada uma aparece, quais ficam na tela, cancelamento e ações do painel não avisam, contato perdido após 3 leituras, uma por evento com vários monitores, "Não perturbe" guarda no histórico), as quatro chaves na tabela de configuração, `notify-send` (libnotify) como dependência **opcional** em **Dependencies** com o que acontece sem ele, e **Privileges** (mostra notificações do desktop)
- [X] T030 [P] Em `manifest.json`, `version` de `0.3.0` para `0.4.0`
- [X] T031 [P] Auditorias: Princípio VIII (`grep -nE '#[0-9a-fA-F]{3,8}|Qt\.rgba|Qt\.rgb|font\.family *: *"|pixelSize *: *[0-9]' BarWidget.qml Panel.qml` vazio); Princípio I (`find . -type l -not -path './.git/*'` vazio, `moduleName` intacto); Princípio III (processos só `curl`, `omarchy-launch-browser`, `notify-send`)
- [X] T032 (2026-09-30: summon/hide, Escape, restart do shell com a impressora concluída → 0, hot reload no meio → 1, disable/enable → 1 e sem processos sobrando. desconectar um monitor ficou opcional e não foi feito, troca de líder coberta pelo hot reload. remove/reinstalar feito depois do push de `44d5060`) Ciclo de vida ([quickstart §5](./quickstart.md#5-ciclo-de-vida-princípio-vi)): o de sempre mais, com dois monitores, um evento → 1 notificação; hot reload no meio de uma impressão falsa e conclusão → 1; `omarchy-restart-shell` com a impressora falsa concluída → 0; `remove`/reinstalar só depois do push, com cópia da pasta no scratchpad
- [X] T033 (2026-09-30, Voron; ver `hardware-test.md`; cancelamento real opcional não repetido) Teste em hardware ([quickstart §6](./quickstart.md#6-teste-em-hardware-princípio-vii)) **com o usuário**: impressão curta até o fim (SC-001, medir o atraso com um `GET` em laço), pausa pelo Mainsail → 1 e pelo painel → 0 (SC-005), cancelamento → 0 (SC-004); registrar em `specs/004-print-notifications/hardware-test.md`
- [X] T034 Marcar a fatia como concluída no `spec.md` (`Status`) e atualizar `checklists/requirements.md` se preciso, só depois do T032 completo (incluindo remove/reinstalar) e do T033

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências; T001 e T002 em paralelo.
- **Foundational (Phase 2)**: depende do Setup; bloqueia todas as histórias. T003 (arquivos
  `response`/`engine`) em paralelo com T004–T006 (`notify.test.js`, em sequência entre si).
- **US1 (Phase 3)**: depende da fase 2. É o MVP.
- **US2 (Phase 4)**: depende da fase 2; independente da US1 (mesmos arquivos: em sequência).
- **US3 (Phase 5)**: depende da fase 2; T021 depende de T010.
- **US4 (Phase 6)**: T023–T025 dependem só da fase 2; T027 depende de US1 (usa a conclusão).
- **Polish (Phase 7)**: T028–T031 depois da fase 2; T032–T034 depois de todas as histórias.

### User Story Dependencies

```text
Setup → Foundational ─┬─ US1 ─┬─ US4 (validação) ─┐
                      ├─ US2 ─┤                    ├─ Polish
                      ├─ US3 ─┘                    │
                      └─ US4 (lógica) ─────────────┘
```

### Within Each User Story

- Testes (falhando) → `Model.js` → `BarWidget.qml`/`Panel.qml`/`manifest.json` → validação ao vivo.
- `Model.js`, `BarWidget.qml` e `tests/notify.test.js` são arquivos únicos: tarefas no mesmo
  arquivo nunca rodam em paralelo, mesmo em histórias diferentes.

### Parallel Opportunities

- Setup: T001 e T002.
- Foundational: T003 junto com T004→T005→T006.
- US4: T023 (`settings.test.js`) em paralelo com testes de outras histórias em `notify.test.js`.
- Polish: T029, T030 e T031 juntos.

---

## Parallel Example: Foundational

```bash
Task: "T003 printState/requestedAt em tests/response.test.js e tests/engine.test.js"
Task: "T004 emptyWatch/observe (semeadura) em tests/notify.test.js"
```

## Parallel Example: Polish

```bash
Task: "T029 README"
Task: "T030 manifest.json version 0.4.0"
Task: "T031 Auditorias"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Setup e Foundational.
2. US1: aviso de conclusão, uma vez, sem cancelamento nem início do shell.
3. **Parar e validar** com o Moonraker falso e dois monitores (T013).

### Incremental Delivery

1. Foundational → status com `printState`/`requestedAt`, watch, envio, líder.
2. US1 → conclusão (MVP).
3. US2 → falha, aquecendo sem impressão, contato perdido.
4. US3 → pausa e proteção das ações do painel entre monitores.
5. US4 → liga/desliga por tipo.
6. Polish → aviso de indisponibilidade, README, versão, auditorias, ciclo de vida e hardware.
   **A fatia só está concluída depois de T032 e T033** (Princípios VI e VII).

---

## Notes

- [P] = arquivos diferentes, sem dependência pendente.
- Os testes devem falhar antes da implementação correspondente.
- Commits só quando o usuário pedir; push só quando ele disser "push".
- Fora de escopo (spec): som próprio, progresso, primeira camada, e-mail/celular, histórico no
  painel, ações na notificação, tempo real.
