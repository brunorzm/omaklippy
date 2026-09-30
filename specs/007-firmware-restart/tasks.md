---

description: "Task list for 007-firmware-restart"
---

# Tasks: Reiniciar o firmware pelo painel

**Input**: Design documents from `specs/007-firmware-restart/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: OBRIGATÓRIOS (Princípio V). Escritos antes da implementação; devem falhar primeiro.
Cada tarefa de implementação faz passar só os testes da sua história.

**Organization**: tarefas agrupadas por história de usuário (US1–US2 da spec).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência pendente)
- **[Story]**: história da spec (US1, US2)
- Caminhos relativos à raiz do plugin (`~/.config/omarchy/plugins/io.github.brunorzm.omaklippy/`)

## Regras que valem para TODAS as tarefas

- **Gate de tarefa (Princípio VI)**: `omarchy plugin validate .` e
  `qmllint -I "$OMARCHY_PATH/shell" BarWidget.qml Panel.qml` sem erro, e `node --test tests/` no
  estado esperado (implementação: tudo passa; escrita de testes: os anteriores passam e os novos
  falham só pela implementação que falta).
- **Testes antigos**: nenhum deve mudar. `availableActions(state)` fica igual (os testes da 002
  continuam valendo); os testes com `error` em `tests/actions.test.js`/`tests/web.test.js` montam
  o status sem `klippyState` e continuam sem botão. Qualquer teste antigo que quebrar: registrar
  aqui antes de atualizar.
  - **Atualizado de propósito (T006)**: "ACTIONS table: paths, confirmation and slots"
    (`tests/actions.test.js`): a lista de ações com confirmação ganha `firmwareRestart` (FR-003).
- **Segurança**: só `GET` nas impressoras reais; parada de emergência e reinício na Voron são
  feitos **pelo usuário**. Nunca `pkill -f`/`pgrep -f` com padrão do próprio comando.
- **Recarregar** (`omarchy-restart-shell`) depois de mudar código; lint real do QML com `qs/` em
  scratch; Princípios II, III, V, VIII como nas fatias anteriores.
- Textos visíveis em inglês, em `Model.TEXT`. Novas funções públicas no `module.exports`.
- Commits só quando o usuário pedir.

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 [P] Criar `tests/firmware-restart.test.js` com o cabeçalho de `tests/actions.test.js` (`node:test`, `assert/strict`, `loadModel`, `loadFixture`), um `printers()` com uma impressora válida (`Voron`, `192.168.1.50`) e o helper `from(fixture, prev)` = `M.applyReading(prev || M.initialStatus(key), M.parseResponse(f.stdout, f.exitCode), 1000)`; sem casos ainda
- [X] T002 [P] Criar `tests/fixtures/klippy-error.synthetic.json` a partir de `shutdown.synthetic.json` com `webhooks.state = "error"` e `state_message` de erro de configuração (ex.: `"Option 'rotation_distance' in section 'extruder' must be specified\n\nOnce the underlying issue is corrected, use the \"RESTART\" command to reload the config and restart the host software.\nPrinter is halted\n"`); citar em `tests/fixtures/README.md` (erro de configuração do Klipper, fatia 007)

---

## Phase 2: Foundational

Nenhuma: US2 usa o ciclo de falha das ações da 002 sem mudança e depende só da ação criada na US1.

---

## Phase 3: User Story 1 - Recuperar a impressora depois de uma parada (Priority: P1) 🎯 MVP

**Goal**: "Restart firmware" no painel só com o Klipper em `shutdown`/`error`, com confirmação,
enviando `POST /printer/firmware_restart`; o painel acompanha até "idle".

**Independent Test**: Moonraker falso em `shutdown` → botão; confirmar → 1 POST
`/printer/firmware_restart` e o painel passa por "Klippy Disconnected", inicialização e "idle".

### Tests for User Story 1

- [X] T003 [US1] Em `tests/firmware-restart.test.js`, disponibilidade ([data-model](./data-model.md#disponibilidade-actionsforstatus)): `canRestartFirmware` `true` para `from("shutdown")`, `from("shutdown.synthetic")`, `from("klippy-error.synthetic")`; `false` para `startup`, `klippy-restarting`, `klippy-disconnected`, `print-error.synthetic`, `unauthorized`, `standby.synthetic`, `printing.synthetic`, `paused.synthetic`, um status offline (`timeout`) e `null`/`undefined`/`{}`/`"lixo"` (sem lançar); `actionsFor` → `["firmwareRestart"]` nos três primeiros, `[]` nos casos negativos de erro/offline, e igual a `availableActions(state)` em printing/paused/idle; `actionsFor` devolve lista nova; `from("klippy-restarting", from("shutdown")).klippyState === ""` (o botão some no 503); `availableActions("error")` continua `[]`
- [X] T004 [US1] Em `tests/firmware-restart.test.js`, envio e painel ([model-api](./contracts/model-api.md#funções-alteradas)): `planCommand(M.emptyCommands wrapped, printer, from("shutdown"), "firmwareRestart", 3000, 5)` aceito, slot `busy` com `action: "firmwareRestart"`, `args` terminam em `http://192.168.1.50/printer/firmware_restart` (`baseUrl` + path) com `-X POST` e `--max-time 60`, `guardMs` 61000; clique duplo (segundo `planCommand` sobre o resultado) → `null` e mesmo `commands`; com `estop` ocupado → `null`; em `startup`, `klippy-restarting`, `print-error.synthetic`, `standby.synthetic` → `null`; `buildActionsModel` em `shutdown`: `primary` = um botão `{ id: "firmwareRestart", label: "Restart firmware", glyph: "\u{f0709}", confirm: true, urgent: false, busy: false, enabled: true }`, `emergency: null`, `web` presente quando a impressora tem `webUrl`; em andamento: `busy: true`, `enabled: false`; `cursorStops` com o botão (e sem ele quando em andamento); `confirmMessage("firmwareRestart", "Voron")` = `"Restart the firmware on Voron? Klipper and the printer's boards will restart."`; `confirmLabel("firmwareRestart")` = `"Restart"`; `acceptCommandResult` com `action("action-ok.synthetic")` libera o slot sem falha
- [X] T005 [US1] Em `tests/firmware-restart.test.js`, notificações (FR-010): `observe` sobre a sequência `shutdown` → `klippy-restarting` → `startup` → `standby.synthetic` (encadeando `watch`) gera 0 eventos, com `protectedNow` `true` e com `false`

### Implementation for User Story 1

- [X] T006 [US1] Em `Model.js`: `ACTIONS.firmwareRestart = { path: "/printer/firmware_restart", confirm: true, slot: "busy" }`; `ACTION_GLYPHS.firmwareRestart = "\u{f0709}"` (nf-md-restart); `TEXT.actions.firmwareRestart = "Restart firmware"`, `TEXT.confirm.restart = "Restart"`, `TEXT.confirm.restartMessage = "Restart the firmware on %1? Klipper and the printer's boards will restart."`; `canRestartFirmware(status)` (`state === "error"` e `klippyState` `"shutdown"` ou `"error"`) e `actionsFor(status)` (`availableActions(state)` + `firmwareRestart` quando `canRestartFirmware`; nunca lança); `planCommand` e `buildActionsModel` usam `actionsFor(status)` no lugar de `availableActions(status.state)`; `confirmMessage`/`confirmLabel` com `firmwareRestart`; exportar `canRestartFirmware` e `actionsFor`; T003–T005 passam e toda a suíte continua passando (inclusive o teste de textos em inglês)
- [X] T007 [US1] (2026-09-30: nada a mudar; `activate`, `cursorStops`, a confirmação e o fechamento automático são genéricos pelo id; só "openWebUi" é tratado à parte) Conferir que `Panel.qml` e `BarWidget.qml` não precisam mudar: o botão chega por `actions.primary` (largura total, sem fundo de alerta, acima de "Open web UI"), a confirmação usa `confirmMessage`/`confirmLabel`, `activate` aceita o id por `cursorStops`, e `runAction` aplica `protectStart`/`protectFinish`; se algo depender de uma lista fixa de ids de ação, ajustar e registrar aqui
- [X] T008 [US1] (2026-09-30: `server.py` no scratchpad da sessão 3c69ae3e, portas 7125/7126, `next-<porta>` com várias linhas; `shell.json` com Fake e Fake2, backup em `shell.json.bak007`) Recriar o Moonraker falso no scratchpad desta sessão a partir do `fake/server.py` da 002 (GET pelo arquivo `state`, POST pelo `code`/`delay`, `posts.log`), com o arquivo `next` aceitando **várias linhas**: a cada GET depois de um POST, o `state` avança uma linha (ex.: `klippy-restarting`, `klippy-restarting`, `startup`, `startup`, `standby.synthetic`); `shell.json` só com impressoras falsas (backup e restauração)
- [X] T009 [US1] (2026-09-30: pelo teclado, cenários 1, 4, 5 e 6; o usuário interrompeu o envio de teclas e fez o resto pelo mouse: 2 botão com o erro de configuração; 3 sem botão em startup, 503, erro de impressão, printing e offline, que volta no shutdown; 9 confirmação fecha sozinha ao tirar a Fake do `shell.json` com o diálogo aberto, 0 POST; 5 pelo mouse até idle; 10 0 notificações do reinício pelo `dbus-monitor`. As 4 notificações do log vieram do roteiro do cenário 3, printing → offline 25 s → shutdown, esperadas pela 004) Validar pelo [quickstart §2](./quickstart.md#2-moonraker-falso) cenários 1–6, 9 e 10 e pelo §3 (teclado) com o Moonraker falso: botão só em `shutdown`/`klippy-error.synthetic`; desistir não envia; confirmar por mouse (usuário) e teclado envia 1 POST `/printer/firmware_restart`; painel passa por "Klippy Disconnected", inicialização e "idle" sozinho; clique duplo com `delay` → 1 POST; troca de impressora fecha a confirmação; 0 notificações

**Checkpoint**: MVP entregue.

---

## Phase 4: User Story 2 - Saber se o reinício deu certo (Priority: P2)

**Goal**: `Restart firmware failed: <motivo>` quando o comando falha; o botão volta quando a
impressora volta a entrar em erro.

**Independent Test**: falso recusando o POST (503/400/conexão fechada) → mensagem; falso voltando
a `shutdown` depois do POST → "error" com o motivo e o botão de novo.

### Tests for User Story 2

- [X] T010 [US2] (2026-09-30: passaram sem mudança no código, como a T011 previa) Em `tests/firmware-restart.test.js`: `acceptCommandResult` do `firmwareRestart` com `action("action-klippy-disconnected.synthetic")` → `failure.message` `"Restart firmware failed: Klippy Host not connected"`; com `action("action-refused.synthetic")` → a mensagem do corpo; com `action("timeout")` → `"Restart firmware failed: no response (timeout) — check the printer before trying again"`; com `action("refused")` → motivo de conexão recusada; `buildActionsModel` depois da falha em `shutdown`: `failureText` preenchido e o botão habilitado de novo; `clearFailures` a apaga; sequência `shutdown` → (POST ok) → `klippy-restarting` → `startup` → `shutdown`: `canRestartFirmware` `false`, `false`, `true` (US2.2)

### Implementation for User Story 2

- [X] T011 [US2] (2026-09-30: nenhuma mudança; o ciclo de falha da 002 cobre o reinício) Em `Model.js`, só se T010 falhar: ajustar para que as falhas do `firmwareRestart` sigam a tabela de `parseActionResponse`/`acceptCommandResult` da 002 com o rótulo `TEXT.actions.firmwareRestart`; esperado: nenhuma mudança além da T006 (registrar o resultado aqui)
- [X] T012 [US2] (2026-09-30, pelo usuário: 503 → `Restart firmware failed: Klippy Host not connected`; 400 → `… FIRMWARE_RESTART refused (fake)`; conexão fechada → `… network error (curl 52)`, o texto genérico da consulta; 200 com a falha persistindo → Klippy Disconnected, inicialização e de volta a error com o botão, sem mensagem de falha) Validar pelo quickstart §2 cenários 7 e 8 com o Moonraker falso: POST 503, 400 e `down` → `Restart firmware failed: …` com o motivo; POST 200 com `next` = `shutdown` → "error" com o motivo e o botão de novo

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T013 [P] Atualizar `README.md`: "Restart firmware" no painel (só com o Klipper em shutdown/erro, com confirmação; não resolve o serviço do Klipper desconectado; endpoint `POST /printer/firmware_restart` na lista de chamadas ao Moonraker, se houver)
- [X] T014 [P] Em `manifest.json`, `version` de `0.6.0` para `0.7.0`
- [X] T015 [P] Notas "Fatia 007" nas tabelas de disponibilidade da 002 (`specs/002-panel-print-actions/data-model.md` e `specs/002-panel-print-actions/contracts/display.md`), apontando para [data-model.md](./data-model.md#disponibilidade-actionsforstatus) e [contracts/display.md](./contracts/display.md), como a 003 fez
- [X] T016 [P] (2026-09-30: nenhuma cor, tamanho ou binário novo no diff; nenhum symlink; validate e qmllint ok) Auditorias: Princípio VIII (nenhuma cor/tamanho fixo novo), I (nenhum symlink, manifesto válido) e III (nenhum binário novo; endpoint novo só com confirmação)
- [X] T017 (2026-09-30: clique, Escape, summon/hide, disable/enable e reinício do shell ok, sem `curl` sobrando; `remove`/reinstalar feito depois do push de `e015de3`) Ciclo de vida ([quickstart §4](./quickstart.md#4-ciclo-de-vida-princípio-vi)): o de sempre com o Moonraker falso; `remove`/reinstalar só depois do push, com cópia da pasta e `.specify/feature.json` restaurado
- [X] T018 (2026-09-30, Voron: parada de emergência e reinício pelo painel feitos pelo usuário; shutdown → 503 "Klippy Host not connected" → startup → ready em 4 s; 3 interações; 0 notificações; ver `hardware-test.md`) Teste em hardware ([quickstart §5](./quickstart.md#5-teste-em-hardware-princípio-vii)) **com o usuário** na Voron ociosa e fria: o assistente liga o observador (GET de `webhooks`/`print_stats` a cada segundo, com horário) e captura o painel; o usuário faz Emergency stop pelo painel e depois Restart firmware pelo painel; conferir botão só em shutdown, sequência 503 → `startup` → `ready`, "idle" em até 2 ciclos depois de o Klipper ficar pronto (SC-002), 3 interações (SC-001), 0 notificações (SC-005); registrar versões e resultados em `specs/007-firmware-restart/hardware-test.md`
- [X] T019 Marcar a fatia como concluída no `spec.md` só depois de T017 (com remove/reinstalar) e T018

---

## Dependencies & Execution Order

- **Setup (Phase 1)**: T001 e T002 em paralelo.
- **US1**: depende do Setup. T003–T005 (testes) → T006 → T007 → T008 → T009.
- **US2**: depende da T006 (a ação existe); T010 → T011 → T012. Compartilha
  `tests/firmware-restart.test.js` e `Model.js` com a US1, então roda depois dela.
- **Polish**: T013–T016 depois das histórias; T017–T019 no fim.

```text
Setup ─ US1 ─ US2 ─ Polish
```

### Parallel Opportunities

- Setup: T001 e T002.
- Polish: T013, T014, T015 e T016.

## Parallel Example: Polish

```bash
Task: "T013 README"
Task: "T014 manifest 0.7.0"
Task: "T015 notas Fatia 007 na 002"
Task: "T016 Auditorias"
```

## Implementation Strategy

1. Setup.
2. US1: disponibilidade, envio e confirmação (MVP) → validar com o falso (T009).
3. US2: falhas e erro persistente.
4. Polish → README, versão, notas, auditorias, ciclo de vida e hardware. **A fatia só está
   concluída depois de T017 e T018.**

## Notes

- Os testes devem falhar antes da implementação correspondente.
- Commits só quando o usuário pedir; push só quando ele disser "push".
- Fora de escopo (spec): reiniciar o serviço do Klipper/Moonraker ou o computador da impressora,
  reinício automático, diagnóstico de falhas, reinício pela barra ou por atalho.
