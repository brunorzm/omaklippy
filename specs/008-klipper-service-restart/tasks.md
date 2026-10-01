---

description: "Task list for 008-klipper-service-restart"
---

# Tasks: Reiniciar o serviço do Klipper pelo painel

**Input**: Design documents from `specs/008-klipper-service-restart/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: OBRIGATÓRIOS (Princípio V). Escritos antes da implementação; devem falhar primeiro.

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
- **Teste antigo que muda de propósito**: "initialStatus is offline, waiting for the first answer"
  (`tests/response.test.js`), que ganha `klippyDownSince: null` e `klipperService: null`. Os testes
  da 007 (`tests/firmware-restart.test.js`) **não** mudam: sem `now`, `actionsFor` e
  `buildActionsModel` se comportam como antes. Qualquer outro teste antigo que quebrar: registrar
  aqui antes de atualizar.
- **Testes ao vivo**: o usuário clica; o assistente prepara o servidor falso e os cronômetros e
  confere pelos logs. Não enviar teclas com `wtype` sem perguntar. Editar arquivos da pasta do
  plugin recarrega o widget: `omarchy-restart-shell` antes de cada conferência ao vivo.
- **Segurança**: só `GET` nas impressoras reais; parar o serviço do Klipper e acionar o reinício
  na Voron é com o usuário. Nunca `pkill -f`/`pgrep -f` com padrão do próprio comando.
- Textos visíveis em inglês, em `Model.TEXT`. Novas funções públicas no `module.exports`.
- Commits só quando o usuário pedir.

---

## Phase 1: Setup (Shared Infrastructure)

- [ ] T001 [P] Criar `tests/klipper-restart.test.js` com o cabeçalho de `tests/firmware-restart.test.js` (`node:test`, `assert/strict`, `loadModel`, `loadFixture`), `printers()`/`printer()` com a Voron em `192.168.1.50`, `reading(name)`, `from(fixture, prev, now)` = `M.applyReading(prev || M.initialStatus(key), reading(fixture), now === undefined ? 1000 : now)` e `action(name)`; sem casos ainda
- [ ] T002 [P] Citar em `tests/fixtures/README.md` as fixtures criadas no plano: `system-info.synthetic` (campos usados da leitura real da Voron de 2026-09-30 19:25; o `provider` é suposto), `system-info-instance.synthetic` (instância `klipper-1`), `system-info-no-klipper.synthetic` (`provider` `none`, sem `klipper`) e `action-service-not-allowed.synthetic` (400); e que `system_info` real é reduzido aos campos usados porque o resto traz IPs e números de série

---

## Phase 2: Foundational (Blocking Prerequisites)

O relógio de desconexão serve às duas histórias.

- [ ] T003 Em `tests/klipper-restart.test.js`, relógio ([data-model](./data-model.md#campos-novos-em-printerstatus)): `initialStatus` com `klippyDownSince: null` e `klipperService: null`; `from("klippy-disconnected", undefined, 1000).klippyDownSince === 1000`; um segundo 503 (`klippy-restarting`) em 6000 mantém 1000; `startup`, `standby.synthetic`, `shutdown` e offline (`timeout`) depois de um 503 → `null`; depois de zerar, um novo 503 em 9000 → 9000; `klipperService` `{ name: "klipper", pending: false, seq: 1 }` preservado por `startup` e por offline; `{ name: null, pending: false, seq: 1 }` vira `null` quando o relógio zera e é mantido enquanto o 503 continua; `clearKlippyDown(statuses, key)` zera o relógio, devolve o mesmo objeto se já nulo ou chave ausente; e **atualizar de propósito** "initialStatus is offline, waiting for the first answer" em `tests/response.test.js` com os dois campos novos
- [ ] T004 Em `Model.js`: `KLIPPY_DOWN_OFFER_MS = 15000`; `initialStatus` com `klippyDownSince: null` e `klipperService: null`; em `applyReading`, `klippyDownSince` = "leitura HTTP 503 → valor anterior se não nulo, senão `now`; qualquer outra leitura (inclusive offline) → `null`", e `klipperService` com `name: null` e `pending: false` volta a `null` quando o relógio zera; `clearKlippyDown(statuses, key)`; exportar `KLIPPY_DOWN_OFFER_MS` e `clearKlippyDown`; T003 passa e toda a suíte continua passando

---

## Phase 3: User Story 1 - Recuperar a impressora com o serviço do Klipper parado (Priority: P1) 🎯 MVP

**Goal**: "Restart Klipper" depois de 15 s de 503 contínuo, com confirmação, enviando
`POST /machine/services/restart?service=<nome>`; o painel acompanha até idle.

**Independent Test**: Moonraker falso em `klippy-disconnected` → botão só depois de 15 s;
confirmar → 1 POST com `?service=klipper` e o painel passa pela inicialização até idle.

### Tests for User Story 1

- [ ] T005 [US1] Em `tests/klipper-restart.test.js`, disponibilidade e envio ([model-api](./contracts/model-api.md)): `canRestartKlipper` com 503 desde 1000 → `false` em 15 999, `true` em 16 000; `false` para `shutdown` (sem relógio), `startup`, `standby.synthetic`, offline, `now` ausente/`NaN`, `null`/`undefined`/`{}`/`"lixo"` (sem lançar); `actionsFor(s, now)` → `["klipperRestart"]` com 503 há 15 s, `[]` há 10 s, e `actionsFor(s)` sem `now` → `[]`; `actionsFor(from("shutdown"), 99999)` continua `["firmwareRestart"]`; `buildActionArgs(base, "klipperRestart", 3, "klipper-1")` termina em `/machine/services/restart?service=klipper-1`, com `""`/`undefined` → `?service=klipper`, e um nome com espaço é codificado; `buildActionArgs(base, "pause", 3, "x")` igual ao de antes; `planCommand` aceito com 503 há 15 s e `klipperService.name` `"klipper-1"` → URL com `klipper-1`, slot `busy` com `action: "klipperRestart"`, `guardMs` 61000; recusado há 10 s; clique duplo → `null` e mesmo `commands`; `estop` ocupado → `null`
- [ ] T006 [US1] Em `tests/klipper-restart.test.js`, nome do serviço: `buildServiceInfoArgs(base, 3)` = `buildCurlArgs(base + "/machine/system_info", 3)` e `""` → `[]`; `parseServiceInfo`: `system-info.synthetic` → `"klipper"`, `system-info-instance.synthetic` → `"klipper-1"`, `system-info-no-klipper.synthetic`, `refused`, `timeout`, `garbage.synthetic`, `klippy-disconnected` → `null`; `planServiceInfo`: uma requisição para a impressora com relógio e `klipperService` nulo (marca `{ name: null, pending: true, seq: 1 }`), nenhuma para impressora sem relógio, com nome conhecido, pendente ou com `invalidReason`; segunda chamada → sem requisições e mesmo objeto; `acceptServiceInfo` grava `{ name, pending: false, seq }`, `null` quando o nome é vazio, e devolve o mesmo objeto com `seq` diferente, já não pendente ou chave ausente
- [ ] T007 [US1] Em `tests/klipper-restart.test.js`, painel e notificações: `buildActionsModel(p, s, M.emptyCommands(), now)` com 503 há 15 s → `primary` = `[{ id: "klipperRestart", label: "Restart Klipper", glyph: "\u{f0450}", confirm: true, urgent: false, busy: false, enabled: true }]`, `emergency: null`; sem `now` → `primary` vazio; em andamento → `busy: true`, `enabled: false`; `buildPanelModel` com o `now` passado oferece o botão; `confirmMessage("klipperRestart", "Voron")` = `"Restart the Klipper service on Voron? It will start again on the printer's computer."`; `confirmLabel("klipperRestart")` = `"Restart"`; `observe` sobre `klippy-disconnected` → `klippy-disconnected` → `startup` → `standby.synthetic` gera 0 eventos com `protectedNow` `true` e `false`

### Implementation for User Story 1

- [ ] T008 [US1] Em `Model.js`: `ACTIONS.klipperRestart = { path: "/machine/services/restart", confirm: true, slot: "busy" }`; `ACTION_GLYPHS.klipperRestart = "\u{f0450}"` (nf-md-reload); `DEFAULT_KLIPPER_SERVICE = "klipper"`; `TEXT.actions.klipperRestart = "Restart Klipper"` e `TEXT.confirm.klipperMessage = "Restart the Klipper service on %1? It will start again on the printer's computer."`; `canRestartKlipper(status, now)`; `actionsFor(status, now)`; `buildActionArgs(..., service)` (só o `klipperRestart` usa `?service=` + `encodeURIComponent(service || "klipper")`); `planCommand` passa `now` a `actionsFor` e `status.klipperService.name` a `buildActionArgs`; `buildServiceInfoArgs`, `parseServiceInfo`, `planServiceInfo`, `acceptServiceInfo`; `buildActionsModel(..., now)` e `buildPanelModel` passando o seu `now`; `confirmMessage`/`confirmLabel` com `klipperRestart`; exportar as funções novas; T005–T007 passam e toda a suíte continua passando (inclusive a da 007 e o teste de textos em inglês)
- [ ] T009 [US1] Em `BarWidget.qml`: no `dispatch`, depois do `planEstimate`, `Model.planServiceInfo(statuses, config.printers, config.timeoutMs)` e um `serviceInfoComponent` igual ao `estimateComponent` (um curl, guarda `config.timeoutMs + 1000`, exatamente um resultado) que chama `root.acceptServiceInfo(key, seq, Model.parseServiceInfo(output, exitCode))`; em `acceptCommand`, antes de `Model.acceptCommandResult`, se o slot `busy` da impressora tem esse `seq` com `action === "klipperRestart"` e `result.ok`, `statuses = Model.clearKlippyDown(statuses, key)`; processos do `system_info` parados com o widget, como os demais
- [ ] T010 [US1] Atualizar o servidor falso do scratchpad (`fake/server.py` da 007): `GET /machine/system_info` servindo a fixture de `sysinfo-<porta>` (padrão `system-info.synthetic`) e o log do POST com a query; registrar o caminho nas anotações desta tarefa
- [ ] T011 [US1] Validar pelo [quickstart §2](./quickstart.md#2-moonraker-falso) cenários 1–5, 8 e 9 **com o usuário clicando**: botão só depois de 15 s (e 1 `GET /machine/system_info`), alternância a cada 10 s sem botão, desistir sem POST, confirmar → 1 POST `?service=klipper` e inicialização até idle sem o botão reaparecer, `klipper-1` com a outra fixture, `shutdown` → Restart firmware, 0 notificações

**Checkpoint**: MVP entregue.

---

## Phase 4: User Story 2 - Saber se o reinício do serviço deu certo (Priority: P2)

**Goal**: `Restart Klipper failed: <motivo>` quando o comando falha; o botão volta se a
desconexão durar outros 15 s depois de um reinício aceito.

**Independent Test**: falso recusando o POST (400, conexão fechada) → mensagem; falso continuando
em 503 depois do POST → botão de novo 15 s depois.

### Tests for User Story 2

- [ ] T012 [US2] Em `tests/klipper-restart.test.js`: `acceptCommandResult` do `klipperRestart` com `action("action-service-not-allowed.synthetic")` → `failure.message` `"Restart Klipper failed: Service 'klipper' not allowed"`; com `action("timeout")` e `action("refused")` → motivos da 002; `buildActionsModel` depois da falha (com `now`): `failureText` preenchido e botão habilitado de novo; sequência do US2.2: 503 desde 1000, `clearKlippyDown` em 20 000, 503 em 21 000 → `canRestartKlipper` `false` em 30 000 e `true` em 36 000

### Implementation for User Story 2

- [ ] T013 [US2] Em `Model.js`, só se T012 falhar: ajustar para que as falhas do `klipperRestart` sigam o ciclo da 002 com o rótulo `TEXT.actions.klipperRestart`; esperado: nenhuma mudança além da T008 (registrar o resultado aqui)
- [ ] T014 [US2] Validar pelo quickstart §2 cenários 6 e 7 com o usuário clicando: POST 400 e conexão fechada → `Restart Klipper failed: …`; POST 200 com `next` só em 503 → botão volta 15 s depois

---

## Phase 5: Polish & Cross-Cutting Concerns

- [ ] T015 [P] Atualizar `README.md`: "Restart Klipper" no painel (depois de 15 s com o serviço desconectado, com confirmação; usa o nome do serviço informado pela impressora; precisa de o serviço estar na lista de serviços permitidos do Moonraker) e `GET /machine/system_info` e `POST /machine/services/restart` na lista de chamadas ao Moonraker; "Restart firmware" deixa de dizer que o caso do serviço desconectado exige outra ferramenta
- [ ] T016 [P] Em `manifest.json`, `version` de `0.7.0` para `0.8.0`
- [ ] T017 [P] Notas "Fatia 008" na tabela de disponibilidade da 007 (`specs/007-firmware-restart/data-model.md` e `specs/007-firmware-restart/contracts/display.md`) apontando para [data-model.md](./data-model.md#disponibilidade-actionsforstatus-now)
- [ ] T018 [P] Auditorias: Princípio VIII (nenhuma cor/tamanho fixo novo), I (nenhum symlink, manifesto válido) e III (nenhum binário novo; reinício de serviço só com confirmação, pelo Moonraker)
- [ ] T019 Ciclo de vida ([quickstart §4](./quickstart.md#4-ciclo-de-vida-princípio-vi)): clique e Escape pelo usuário; summon/hide, disable/enable (restaurar as impressoras depois do enable) e reinício do shell por comando, sem `curl` sobrando; `remove`/reinstalar só depois do push, com cópia da pasta e `.specify/feature.json` restaurado
- [ ] T020 Teste em hardware ([quickstart §5](./quickstart.md#5-teste-em-hardware-princípio-vii)) **com o usuário** na Voron ociosa e fria: o assistente liga o observador (com código HTTP) e captura `GET /machine/system_info` reduzido como `tests/fixtures/system-info-voron.json` (citado no README das fixtures, com um teste de `parseServiceInfo` → `"klipper"`); o usuário para o serviço do Klipper pelo Mainsail; conferir o botão só depois de 15 s; o usuário aciona Restart Klipper e confirma; conferir POST aceito com `?service=klipper`, volta a idle, 3 interações (SC-001), 0 notificações (SC-005); registrar em `specs/008-klipper-service-restart/hardware-test.md`
- [ ] T021 Marcar a fatia como concluída no `spec.md` só depois de T019 (com remove/reinstalar) e T020

---

## Dependencies & Execution Order

- **Setup (Phase 1)**: T001 e T002 em paralelo.
- **Foundational (Phase 2)**: T003 → T004; bloqueia as histórias (o relógio é usado por elas).
- **US1**: T005–T007 (testes) → T008 → T009 → T010 → T011.
- **US2**: depende da T008/T009 (ação e reset do relógio); T012 → T013 → T014.
- **Polish**: T015–T018 depois das histórias; T019–T021 no fim.

```text
Setup ─ Foundational ─ US1 ─ US2 ─ Polish
```

### Parallel Opportunities

- Setup: T001 e T002.
- Polish: T015, T016, T017 e T018.

## Parallel Example: Polish

```bash
Task: "T015 README"
Task: "T016 manifest 0.8.0"
Task: "T017 notas Fatia 008 na 007"
Task: "T018 Auditorias"
```

## Implementation Strategy

1. Setup e Foundational (relógio de desconexão).
2. US1: disponibilidade, nome do serviço, envio e reset (MVP) → validar com o falso (T011).
3. US2: falhas e desconexão persistente depois do reinício.
4. Polish → README, versão, notas, auditorias, ciclo de vida e hardware. **A fatia só está
   concluída depois de T019 e T020.**

## Notes

- Os testes devem falhar antes da implementação correspondente.
- Commits só quando o usuário pedir; push só quando ele disser "push".
- Fora de escopo (spec): reiniciar o Moonraker, outros serviços ou o computador da impressora;
  parar ou iniciar serviços; reinício automático; diagnóstico; reinício pela barra ou por atalho.
