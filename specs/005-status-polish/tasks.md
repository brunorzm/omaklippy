---

description: "Task list for 005-status-polish"
---

# Tasks: Polimento do status (mensagem, tempo restante, pausa no ícone)

**Input**: Design documents from `specs/005-status-polish/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: OBRIGATÓRIOS (Princípio V). Escritos antes da implementação; devem falhar primeiro.
Cada tarefa de implementação faz passar **só** os testes da sua história (na 004 as regras de
todas as histórias entraram de uma vez; aqui não).

**Organization**: tarefas agrupadas por história de usuário (US1–US3 da spec).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência pendente)
- **[Story]**: história da spec (US1…US3)
- Caminhos relativos à raiz do plugin (`~/.config/omarchy/plugins/io.github.brunorzm.omaklippy/`)

## Regras que valem para TODAS as tarefas

- **Gate de tarefa (Princípio VI)**: `omarchy plugin validate .` e
  `qmllint -I "$OMARCHY_PATH/shell" BarWidget.qml Panel.qml` sem erro, e `node --test tests/` no
  estado esperado (implementação: tudo passa; escrita de testes: os anteriores passam, salvo os que
  a tarefa atualiza, e os novos falham só pela implementação que falta).
- **Teste antigo que muda de propósito**: "initialStatus is offline, waiting for the first answer"
  (`tests/response.test.js`), que ganha `message: ""`, `progress: null`, `printDuration: null` e
  `estimate: null`. Se outro teste antigo quebrar por campo novo, registrá-lo aqui antes de
  atualizar.
- **Lint real do QML**: diretório no scratchpad com `qs/Commons` e `qs/Ui` e `-I <scratch>`. Os
  avisos `QProcess::ExitStatus … onExited` e `Member "caption"`/`"bodySmall" not found` são da
  mesma classe dos existentes.
- **Recarregar**: `omarchy-restart-shell` depois de mudar código; editar arquivos do plugin durante
  teste ao vivo dispara hot reload (reiniciar o shell depois).
- **Segurança**: só `GET` nas impressoras reais; impressão, pausa e troca de tema são feitas pelo
  usuário. Parar processos com `pgrep` + `kill <pid>`, nunca `pkill -f`/`pgrep -f` com um padrão
  que apareça no próprio comando.
- **Princípios**: II (busca da estimativa em `Process` com timeout e guarda), III (só `curl`, só
  leitura), V (regras em `Model.js`), VIII (nenhuma cor, fonte ou dimensão literal).
- Textos visíveis em inglês, em `Model.TEXT`. Novas funções públicas no `module.exports`.
- Commits só quando o usuário pedir.

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 [P] Criar `tests/status-polish.test.js` com o cabeçalho dos outros suites (`node:test`, `node:assert/strict`, `loadModel`, `loadFixture`) e helpers `reading(name)` (via `M.parseResponse`) e `status(fixture, prev)` (via `M.applyReading` a partir de `M.initialStatus("k#0")`); sem casos ainda
- [X] T002 [P] Fixtures: registrar em `tests/fixtures/README.md` as reais `metadata-ok.json` (Voron, `GET /server/files/metadata`, `estimated_time` 1343, OrcaSlicer) e `metadata-missing.json` (404 "Metadata not available"), já capturadas; criar `tests/fixtures/standby-stale-message.synthetic.json` a partir de `standby.synthetic.json` com `display_status.message` = `"Imprimindo"` e `printing-message.synthetic.json` a partir de `printing.synthetic.json` com `display_status.message` = `"  Nivelando a mesa  "` (espaços nas pontas, para o `trim`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: os campos novos da leitura e do status que US1 e US2 usam.

- [X] T003 Em `tests/response.test.js`: **atualizar** "initialStatus is offline, waiting for the first answer" (+ `message: ""`, `progress: null`, `printDuration: null`, `estimate: null`); novos: `parseResponse` com `printing.json` → `displayMessage "Aquecendo a Camara"`, com `printing-message.synthetic` → `"Nivelando a mesa"` (sem espaços), sem `display_status` → `""`; `applyReading` com `printing.synthetic` → `message ""`, `progress 0.427`, `printDuration 1200.1`; com `printing.json` → `message "Aquecendo a Camara"`, `printDuration 0`; com `standby.synthetic` (sem impressão, `virtual_sdcard.progress` 0) → `progress null`; offline → `message ""`, `progress null`, `printDuration null`
- [X] T004 Em `Model.js`: `displayMessage` em `emptyReading`/`parseResponse` (`display_status.message` com `trim()`, `""` se não for string); `message`, `progress`, `printDuration` e `estimate: null` em `initialStatus`; `applyReading` preenche os três primeiros com resposta (`progress` só com impressão, `null` sem ela: "null offline ou sem impressão") e zera no caminho offline (`estimate` ainda não é tocada; vem na US2); T003 passa

**Checkpoint**: status com os dados novos; nada visível ainda.

---

## Phase 3: User Story 1 - Ver o que a impressora está fazendo agora (Priority: P1) 🎯 MVP

**Goal**: a mensagem da impressora no painel, só imprimindo ou pausada.

**Independent Test**: Moonraker falso com `printing.json` (heat-soak real da Voron) → "Aquecendo a
Camara" no painel; `printing.synthetic` (mensagem vazia) → nenhuma linha; `standby-stale-message`
→ nenhuma linha.

### Tests for User Story 1

- [X] T005 [US1] Em `tests/status-polish.test.js`: `detailFor(printer, status, now).messageText` = mensagem com `printing.json` ("Aquecendo a Camara") e com `paused` + mensagem; `""` com mensagem vazia (`printing.synthetic`); `""` com `standby-stale-message.synthetic` (FR-004), com `shutdown.synthetic` e offline; `buildPanelModel` com uma impressora em `printing.json` → `selected.messageText === "Aquecendo a Camara"`

### Implementation for User Story 1

- [X] T006 [US1] Em `Model.js`, `detailFor`: `messageText` = `status.message` quando `hasJob(status.state)`, senão `""`; T005 passa
- [X] T007 [US1] Em `Panel.qml`, no bloco da impressão (`showJob`), logo abaixo da linha de progresso e acima de "File": `Text` com `visible: (root.selected.messageText || "") !== ""`, `width: parent.width`, `textFormat: Text.PlainText`, `wrapMode: Text.WordWrap`, cor `root.dim`, `root.fontFamily`, `Style.font.bodySmall` ([display.md](./contracts/display.md#painel-panelqml))
- [X] T008 [US1] (2026-09-30: "Aquecendo a Camara" com a fixture real do heat-soak; sem linha com mensagem vazia e com `standby` guardando "Imprimindo") Validar pelo [quickstart §2](./quickstart.md#2-moonraker-falso) cenários 1–3 com o Moonraker falso (fixtures `printing.json`, `printing.synthetic`, `standby-stale-message.synthetic`), com capturas; mensagem longa não alarga o painel

**Checkpoint**: MVP entregue.

---

## Phase 4: User Story 2 - Saber quanto falta desde o início da impressão (Priority: P1)

**Goal**: tempo restante desde o início, pela estimativa do fatiador combinada com a do progresso.

**Independent Test**: Moonraker falso com `printing.json` (`print_duration` 0) e metadados ok →
"Remaining 22m" no primeiro ou segundo ciclo; metadados 404 → "—" como hoje; o log do falso mostra
uma busca por barra por impressão.

### Tests for User Story 2

- [X] T009 [US2] Em `tests/status-polish.test.js`, busca: `buildMetadataArgs("http://v", "a b/c.gcode", 3)` = `buildCurlArgs("http://v/server/files/metadata?filename=a%20b%2Fc.gcode", 3)`; vazio → `[]`; `parseMetadataResponse` com `metadata-ok` → 1343, com `metadata-missing` → `null`, com `refused`, `timeout`, corpo sem `result`, `estimated_time` 0/negativo/texto → `null`; nunca lança
- [X] T010 [US2] Em `tests/status-polish.test.js`, ciclo de vida da estimativa: `planEstimate` pede para a impressora com impressão e `filename` (estimate `{ filename, seconds: null, pending: true, seq: 1 }`, pedido com `args` de `buildMetadataArgs`), não pede de novo enquanto pendente nem depois de pronta (inclusive com `seconds: null`, falha guardada), não pede para ociosa, offline, sem `filename` ou endereço inválido, e devolve o **mesmo** objeto sem pedidos; `acceptEstimate` grava com `seq` e `filename` certos e ignora os outros; `applyReading` mantém `estimate` na mesma impressão e zera ao ficar offline, ociosa ou trocar de arquivo; nova impressão do mesmo arquivo depois de ociosa → novo pedido (FR-009)
- [X] T011 [US2] Em `tests/status-polish.test.js`, `blendRemaining`: cada linha da tabela do [data-model](./data-model.md#blendremainingprogressremaining-slicertotal-printduration-progress--number--null); linha do tempo sintética de 0 a 99% com `E = 1343` e duração real 1500 s (e outra com `P` 3× errado a 2%) → nunca `≤ 0` com impressão (SC-004), nos primeiros 10% `R` entre `S` e `P` com `|R − S| ≤ 0,1·|P − S|` (SC-003) e, depois de 2%, entre passos seguidos `|R₂ − (R₁ − Δt)| ≤ 0,1·R₁`, com `Δt` o tempo impresso entre eles (SC-007), exceto no passo em que `E − d` fica `≤ 0`, que o teste identifica e confere à parte; `detailFor.remainingText` usa a combinação ("22m" com `printing.json` + `estimate.seconds 1343`) e cai no comportamento antigo sem estimativa ("—" com `printing.json`)

### Implementation for User Story 2

- [X] T012 [US2] Em `Model.js`: `buildMetadataArgs`, `parseMetadataResponse` (via `readTransport`), `planEstimate`, `acceptEstimate`, `blendRemaining` e a regra de `estimate` em `applyReading`, pelo [contrato](./contracts/model-api.md); `detailFor.remainingText` via `blendRemaining`; exportar; T009–T011 passam
- [X] T013 [US2] Em `BarWidget.qml`: em `dispatch`, depois do `planDispatch`, `Model.planEstimate(statuses, config.printers, config.timeoutMs)` e um `estimateComponent` por pedido (esqueleto do `requestComponent`: stdout + exit code + guarda `timeoutMs + 1000`, resultado único, com `key`); o resultado chama `Model.acceptEstimate(statuses, key, seq, filename, Model.parseMetadataResponse(stdout, exitCode))`
- [X] T014 [US2] (2026-09-30: "Remaining 22m" no heat-soak; 404 → "—"; uma busca por impressão, com o nome codificado `CONE1%2060_…`; nova busca numa nova impressão do mesmo arquivo; consultas de status mantidas em 5 s, 18 de 19 intervalos, o outro foi um follow-up) Servidor falso do scratchpad: responder `GET /server/files/metadata` com o `stdout` de `metadata-ok` ou `metadata-missing` (arquivo de estado) e registrar os pedidos; validar pelo quickstart §2 cenários 4–7 (tempo restante no primeiro/segundo ciclo, 404 → "—", uma busca por barra, nova busca numa nova impressão) e, pelo log do falso, que as consultas de status mantêm o ritmo de 5 s por barra enquanto os metadados são buscados (SC-006)

---

## Phase 5: User Story 3 - Distinguir "pausada" no ícone da barra (Priority: P2)

**Goal**: duas barrinhas de pausa no canto do selo de erro quando pausado.

**Independent Test**: `paused.synthetic` com progresso baixo → marcador visível; `printing` → some;
`shutdown` → selo de erro, sem marcador.

### Tests for User Story 3

- [X] T015 [P] [US3] Em `tests/status-polish.test.js`: `buildIconState` com a impressora representada pausada → `mode "paused"`, imprimindo → `"printing"`, erro → `"error"` (garante a entrada que o marcador usa; a lógica já existe)

### Implementation for User Story 3

- [X] T016 [US3] Em `BarWidget.qml`, no `iconComponent`: um `Item` no canto superior direito, `visible: root.iconState.mode === "paused"`, com duas barrinhas (`Rectangle`s) pelas medidas do [display.md](./contracts/display.md#ícone-barwidgetqml) (`button.markColor`, contorno `Color.bar.background`, `Style.space()`); a barra de progresso atenuada continua
- [X] T017 [US3] (2026-09-30, só o eDP-1: o DP-3 estava desconectado; o marcador foi redesenhado duas vezes depois das capturas ampliadas, ver hardware-test) Validar pelo quickstart §2 cenários 8–9 com capturas do ícone nos dois monitores (x ~988 no eDP-1, ~2590 no DP-3)

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T018 [P] Atualizar `README.md`: a mensagem da impressora no painel (só imprimindo/pausada), o tempo restante pelo fatiador combinado com o progresso (e o que acontece sem metadados), o marcador de pausa no ícone e, em **Moonraker**, o `GET /server/files/metadata` (uma vez por impressão)
- [X] T019 [P] Em `manifest.json`, `version` de `0.4.0` para `0.5.0`
- [X] T020 [P] Auditorias: Princípio VIII (`grep -nE '#[0-9a-fA-F]{3,8}|Qt\.rgba|Qt\.rgb|font\.family *: *"|pixelSize *: *[0-9]' BarWidget.qml Panel.qml` vazio); Princípio I (sem symlinks, `moduleName` intacto); Princípio III (processos só `curl`, `omarchy-launch-browser`, `notify-send`)
- [X] T021 (2026-09-30 com o falso: conclusão → 1 notificação, Escape, restart, disable/enable sem processos sobrando. remove/reinstalar feito depois do push de `e80b4cd`) Ciclo de vida ([quickstart §4](./quickstart.md#4-ciclo-de-vida-princípio-vi)): o de sempre com o Moonraker falso, mais uma conclusão falsa gerando 1 notificação e o tooltip de uma linha inalterado (FR-013); `remove`/reinstalar só depois do push, com cópia da pasta e restaurando `.specify/feature.json`
- [X] T022 (2026-09-30, Voron: pausado a 15% com "26m" = combinação exata e "Imprimindo"; marcador em tema escuro e claro; fim acompanhado, maior salto 7,5%; heat-soak não observado ao vivo, coberto pela fixture real; ver `hardware-test.md`) Teste em hardware ([quickstart §5](./quickstart.md#5-teste-em-hardware-princípio-vii)) **com o usuário**: impressão real, observador `GET` (mensagem, `print_duration`, progresso, tempo restante calculado pelas funções puras), SC-001 a SC-003 (SC-003: nos primeiros 10%, o tempo exibido fica entre `S` e `P` com `|R − S| ≤ 0,1·|P − S|`, conferido pelo observador; a diferença para o fim real fica só como observação), pausa com menos de 10% e capturas do ícone em dois temas (troca de tema feita pelo usuário, voltando ao dele); registrar em `specs/005-status-polish/hardware-test.md`
- [X] T023 Marcar a fatia como concluída no `spec.md` (`Status`) só depois de T021 (com remove/reinstalar) e T022

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 e T002 em paralelo.
- **Foundational (Phase 2)**: T003 → T004; bloqueia as histórias.
- **US1 (Phase 3)**: depende da fase 2. É o MVP.
- **US2 (Phase 4)**: depende da fase 2; independente da US1 (mesmos arquivos: em sequência).
- **US3 (Phase 5)**: depende só do Setup (a lógica do ícone já existe); T016 mexe no
  `BarWidget.qml`, em sequência com T013.
- **Polish (Phase 6)**: T018–T020 depois das histórias de código; T021–T023 no fim.

### User Story Dependencies

```text
Setup → Foundational ─┬─ US1 ─┐
                      └─ US2 ─┼─ Polish
Setup ─────────────────  US3 ─┘
```

### Within Each User Story

- Testes (falhando) → `Model.js` → QML → validação ao vivo.
- `Model.js`, `BarWidget.qml` e `tests/status-polish.test.js` são arquivos únicos: tarefas no mesmo
  arquivo nunca rodam em paralelo.

### Parallel Opportunities

- Setup: T001 e T002.
- T015 (US3, teste) junto com a fase 2.
- Polish: T018, T019 e T020.

---

## Parallel Example: Setup

```bash
Task: "T001 tests/status-polish.test.js"
Task: "T002 fixtures e README das fixtures"
```

## Parallel Example: Polish

```bash
Task: "T018 README"
Task: "T019 manifest 0.5.0"
Task: "T020 Auditorias"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Setup e Foundational.
2. US1: a mensagem do heat-soak no painel.
3. **Parar e validar** com o Moonraker falso (T008).

### Incremental Delivery

1. Foundational → dados novos no status.
2. US1 → mensagem (MVP).
3. US2 → tempo restante desde o início.
4. US3 → marcador de pausa.
5. Polish → README, versão, auditorias, ciclo de vida e hardware. **A fatia só está concluída
   depois de T021 e T022** (Princípios VI e VII).

---

## Notes

- [P] = arquivos diferentes, sem dependência pendente.
- Os testes devem falhar antes da implementação correspondente.
- Commits só quando o usuário pedir; push só quando ele disser "push".
- Fora de escopo (spec): camada atual/total, filamento, ETA, miniatura, histórico, escolha de
  estimativa.
