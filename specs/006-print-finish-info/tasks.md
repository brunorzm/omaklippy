---

description: "Task list for 006-print-finish-info"
---

# Tasks: Quando termina (horário de término, camada e tempo no tooltip)

**Input**: Design documents from `specs/006-print-finish-info/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: OBRIGATÓRIOS (Princípio V). Escritos antes da implementação; devem falhar primeiro.
Cada tarefa de implementação faz passar só os testes da sua história.

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
- **Testes antigos que mudam de propósito**: "initialStatus is offline, waiting for the first
  answer" (`tests/response.test.js`, + `currentLayer: null`, `totalLayer: null`) e "planEstimate
  asks once per file for a printer with a print" (`tests/status-polish.test.js`, o `estimate`
  pendente ganha `layerCount: null`). Os testes de `tooltip` de `tests/view.test.js` **não** mudam
  (os status deles não têm tempo restante). Qualquer outro teste antigo que quebrar: registrar aqui
  antes de atualizar.
- **Fuso fixo nos testes**: `tests/finish-info.test.js` fixa `process.env.TZ =
  "America/Sao_Paulo"` na primeira linha, antes de criar qualquer `Date`.
- **Lint real do QML**, **recarregar** (`omarchy-restart-shell`), **segurança** (só `GET`; nunca
  `pkill -f`/`pgrep -f` com padrão do próprio comando) e **Princípios II, III, V, VIII**: como nas
  fatias anteriores.
- Textos visíveis em inglês, em `Model.TEXT`. Novas funções públicas no `module.exports`.
- Commits só quando o usuário pedir.

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 [P] Criar `tests/finish-info.test.js` com `process.env.TZ = "America/Sao_Paulo"` na primeira linha, o cabeçalho dos outros suites e os helpers `reading(name)` e `status(fixture, prev)`; um helper `at(y, mo, d, h, mi, s)` que devolve `new Date(y, mo - 1, d, h, mi, s || 0).getTime()`; sem casos ainda
- [X] T002 [P] Criar `tests/fixtures/printing-layers.synthetic.json` a partir de `printing.synthetic.json` com `print_stats.info` = `{ "current_layer": 12, "total_layer": 62 }` e `tests/fixtures/printing-layer-no-total.synthetic.json` com `{ "current_layer": 5, "total_layer": null }`; citar as duas em `tests/fixtures/README.md`

---

## Phase 2: Foundational

Nenhuma: US1 e US2 usam o tempo restante da 005 (`blendRemaining`) sem mudança; os dados de
camada só servem à US3 e ficam na fase dela.

---

## Phase 3: User Story 1 - Saber a que horas a impressão termina (Priority: P1) 🎯 MVP

**Goal**: `Ends 16:52` no painel, 24 h, com "tomorrow" ou o dia quando não é hoje.

**Independent Test**: Moonraker falso com `printing.synthetic` + metadados → linha `Ends` = relógio
+ tempo restante (±1 min); com "—" no restante, sem `Ends`.

### Tests for User Story 1

- [X] T003 [US1] Em `tests/finish-info.test.js`: `formatFinish` com agora = `at(2026, 9, 30, 16, 15)` e cada linha da tabela do [data-model](./data-model.md#formatfinishfinishms-nowms--string) (`16:52`, `16:53` pelo arredondamento, `tomorrow 02:10`, `tomorrow 00:00` quando o arredondamento vira o dia, `Sat 08:00`, `7 Oct 08:00`); zero à esquerda (`tomorrow 09:05` para qui 01/10 09:05); entradas inválidas (`null`, `NaN`, `"x"`) → `""`; `detailFor(printer, status, now).finishText`: com `printing.synthetic` e `estimate.seconds` 1343 → `formatFinish(now + R·1000, now)` com `R = blendRemaining(...)`; sem tempo restante (`printing` do heat-soak sem estimativa) → `""`; ociosa → `""`; um caso extra com `TZ` de um fuso com horário de verão (`America/New_York`, rodado num processo filho com `node -e` e `TZ` no ambiente, porque o fuso do processo já foi fixado): término que atravessa a mudança de horário segue o relógio local

### Implementation for User Story 1

- [X] T004 [US1] Em `Model.js`: `TEXT.panel.ends = "Ends"`, `TEXT.finish` (`tomorrow: "tomorrow %1"`, `days`, `months` do [contrato](./contracts/model-api.md#textos-novos-em-text)), `formatFinish(finishMs, nowMs)` (arredonda ao minuto mais próximo; mesmo dia → `HH:MM`; dia seguinte → `tomorrow HH:MM`; até 6 dias → `Ddd HH:MM`; depois → `D Mmm HH:MM`; sempre 24 h) e `detailFor.finishText`; exportar `formatFinish`; T003 passa
- [X] T005 [US1] Em `Panel.qml`: `InfoRow` com `label: Model.TEXT.panel.ends`, `value: root.selected.finishText`, `visible: (root.selected.finishText || "") !== ""`, logo abaixo da linha `Remaining`
- [X] T006 [US1] (2026-09-30: "Ends 17:07" às 16:53:51 com 12m49s restantes; heat-soak sem metadados → sem Ends; pausado, 17:17 → 17:19 em 2 min) Validar pelo [quickstart §2](./quickstart.md#2-moonraker-falso) cenários 1, 2 e 6 com o Moonraker falso da 005 (horário contra o relógio da barra; pausado com o painel aberto, o horário avança)

**Checkpoint**: MVP entregue.

---

## Phase 4: User Story 2 - Ver o tempo restante sem abrir o painel (Priority: P1)

**Goal**: tooltip do ícone com ` · 26m left`; menu "Printer" inalterado.

**Independent Test**: teste puro do `buildIconState.tooltip`; ao vivo, o usuário passa o mouse.

### Tests for User Story 2

- [X] T007 [US2] Em `tests/finish-info.test.js`: `tooltipLine` = `summaryLine` + ` · <formatDuration(R)> left` com impressão (imprimindo e pausada) e `R` conhecido (`printing.synthetic` + `estimate.seconds` 1343 → termina em `" · 12m left"`); igual a `summaryLine` sem `R`, ociosa, em erro e offline; `buildIconState(...).tooltip` usa `tooltipLine`; `buildPanelModel(...).rows[].optionLabel` continua igual a `summaryLine` (FR-007)

### Implementation for User Story 2

- [X] T008 [US2] Em `Model.js`: `TEXT.left = "%1 left"`, `tooltipLine(printer, status)` pelo [data-model](./data-model.md#tooltiplineprinter-status--string) e `buildIconState` usando-a; exportar `tooltipLine`; T007 passa, e os testes de `tests/view.test.js` continuam passando sem mudança
- [X] T009 [US2] (2026-09-30: menu "Printer" sem "left" com duas impressoras falsas; tooltip com o tempo restante conferido pelo usuário na Voron) Validar pelo quickstart §2 cenários 1, 7 e 8: o tooltip é conferido **pelo usuário** passando o mouse (o assistente não tem mouse); o assistente confere o menu "Printer" com duas impressoras falsas

---

## Phase 5: User Story 3 - Saber em que camada a impressão está (Priority: P2)

**Goal**: `Layer 12/62` quando a impressora informa a camada atual; total da impressora ou dos
metadados.

**Independent Test**: `printing-layers.synthetic` → `Layer 12/62`; `printing-layer-no-total` +
metadados ok → `Layer 5/13`; sem `info` → sem linha.

### Tests for User Story 3

- [X] T010 [US3] Em `tests/response.test.js`: **atualizar** "initialStatus is offline, waiting for the first answer" (+ `currentLayer: null`, `totalLayer: null`); novos: `parseResponse` com `printing-layers.synthetic` → `currentLayer 12`, `totalLayer 62`; `printing.synthetic` e `printing` (Voron real, `info` nulo) → `null`, `null`; `applyReading` copia os dois e zera offline
- [X] T011 [US3] Em `tests/status-polish.test.js`: **atualizar** "planEstimate asks once per file for a printer with a print" (estimate pendente com `layerCount: null`; pronto com `layerCount` do `acceptEstimate`); em `tests/finish-info.test.js`: `parseMetadataLayers` com `metadata-ok` → 13, `metadata-missing`/`refused` → `null`, `layer_count` 0/texto → `null`; `acceptEstimate(..., 1343, 13)` grava `layerCount: 13` e sem o 6º argumento grava `null`; `detailFor.layerText`: `printing-layers.synthetic` → `"12/62"`; `printing-layer-no-total.synthetic` + `estimate.layerCount` 13 → `"5/13"`; sem total nem metadados → `""`; `printing` (sem `info`) → `""`; atual maior que o total (70/62) → `"62/62"` (FR-010); ociosa → `""`

### Implementation for User Story 3

- [X] T012 [US3] Em `Model.js`: `currentLayer`/`totalLayer` em `emptyReading`/`parseResponse` (inteiros: `current_layer ≥ 0`, `total_layer > 0`, senão `null`), em `initialStatus`/`applyReading` (zerados offline); `parseMetadataLayers`; `layerCount` no `estimate` de `planEstimate` e o parâmetro opcional em `acceptEstimate`; `TEXT.panel.layer = "Layer"` e `detailFor.layerText`; exportar `parseMetadataLayers`; T010–T011 passam
- [X] T013 [US3] Em `BarWidget.qml`: o `estimateComponent` passa `Model.parseMetadataLayers(output, exitCode)` como `layerCount` a `root.acceptEstimate` (que ganha o parâmetro e o repassa a `Model.acceptEstimate`); em `Panel.qml`, `InfoRow` `Layer` logo abaixo de `Ends`, visível com `layerText`
- [X] T014 [US3] (2026-09-30: "Layer 12/62"; "5/13" com o total dos metadados; sem `info` → sem linha) Validar pelo quickstart §2 cenários 3, 4 e 5 com o Moonraker falso

### Correção do teste em hardware (2026-09-30)

- [X] T021 [US1] Aquecimento (FR-013, apontado pelo usuário na Voron: "Ends 17:07" durante o heat-soak era falso): testes em `tests/finish-info.test.js` (aquecendo: "6m + warm-up", sem `Ends`, tooltip "warming up"; depois da primeira extrusão tudo volta) e **atualização de propósito** de dois testes antigos ("detailFor shows the blended remaining time…" da 005 → `"22m + warm-up"`; o tooltip do heat-soak em `finish-info.test.js` → `"… · warming up"`); em `Model.js`, `isWarmingUp` (impressão com `printDuration === 0`), `remainingText`/`finishText` e `tooltipLine`; nota de correção no FR-005 da 005 e no README; conferido ao vivo na Voron durante o heat-soak

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T015 [P] Atualizar `README.md`: `Ends` (24 h, "tomorrow"/dia), `Layer` (só quando a impressora informa a camada; no OrcaSlicer, o comando de troca de camada que grava `SET_PRINT_STATS_INFO`) e o tempo restante no tooltip
- [X] T016 [P] Em `manifest.json`, `version` de `0.5.0` para `0.6.0`
- [X] T017 [P] Auditorias: Princípios VIII, I e III como na 005
- [ ] T018 (2026-09-30 com o falso: conclusão → 1 notificação, Escape, disable/enable sem `curl` sobrando. **Falta**: remove/reinstalar depois do push) Ciclo de vida ([quickstart §3](./quickstart.md#3-ciclo-de-vida-princípio-vi)): o de sempre com o Moonraker falso; `remove`/reinstalar só depois do push, com cópia da pasta e `.specify/feature.json` restaurado
- [X] T019 (2026-09-30, Voron: "Ends 17:24" a partir da primeira extrusão, fim real 17:24:27; aquecimento de ~17 min sem horário após a correção T021; tooltip conferido pelo usuário; `Layer` escondida; ver `hardware-test.md`) Teste em hardware ([quickstart §4](./quickstart.md#4-teste-em-hardware-princípio-vii)) **com o usuário** na Voron: `Ends` contra o relógio da barra (±1 min), tooltip (usuário), linha `Layer` escondida (metade negativa do SC-003); a metade positiva do SC-003 (camada igual à da interface web) só é conferida ao vivo se o usuário ativar o comando de camada no OrcaSlicer, passo **opcional**; senão fica coberta pelo Moonraker falso (T014) e registrada assim no `hardware-test.md`; registrar em `specs/006-print-finish-info/hardware-test.md`
- [ ] T020 Marcar a fatia como concluída no `spec.md` só depois de T018 (com remove/reinstalar) e T019

---

## Dependencies & Execution Order

- **Setup (Phase 1)**: T001 e T002 em paralelo.
- **US1, US2, US3**: dependem só do Setup e são independentes entre si; como `Model.js`,
  `tests/finish-info.test.js` e `Panel.qml` são compartilhados, rodam em sequência
  (US1 → US2 → US3).
- **Polish**: T015–T017 depois das histórias; T018–T020 no fim.

```text
Setup ─┬─ US1 ─ US2 ─ US3 ─ Polish
```

### Parallel Opportunities

- Setup: T001 e T002.
- Polish: T015, T016 e T017.

## Parallel Example: Polish

```bash
Task: "T015 README"
Task: "T016 manifest 0.6.0"
Task: "T017 Auditorias"
```

## Implementation Strategy

1. Setup.
2. US1: horário de término (MVP) → validar com o falso (T006).
3. US2: tooltip.
4. US3: camada.
5. Polish → README, versão, auditorias, ciclo de vida e hardware. **A fatia só está concluída
   depois de T018 e T019.**

## Notes

- Os testes devem falhar antes da implementação correspondente.
- Commits só quando o usuário pedir; push só quando ele disser "push".
- Fora de escopo (spec): estimar camada pela altura do bico, notificação "falta pouco", horário
  de início, filamento, miniatura, histórico, configuração do formato.
