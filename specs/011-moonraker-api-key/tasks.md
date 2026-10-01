---

description: "Task list for 011-moonraker-api-key"
---

# Tasks: Chave de API do Moonraker por impressora

**Input**: Design documents from `specs/011-moonraker-api-key/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: OBRIGATÓRIOS (Princípio V). Escritos antes da implementação; devem falhar primeiro.

**Organization**: tarefas agrupadas por história de usuário (US1–US3 da spec).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência pendente)
- **[Story]**: história da spec (US1, US2, US3)
- Caminhos relativos à raiz do plugin (`~/.config/omarchy/plugins/io.github.brunorzm.omaklippy/`)

## Regras que valem para TODAS as tarefas

- **Gate de tarefa (Princípio VI)**: `omarchy plugin validate .` e
  `qmllint -I "$OMARCHY_PATH/shell" BarWidget.qml Panel.qml LiveConnection.qml` sem erro (e o lint
  real com `qs/` em scratch sem avisos novos fora das classes conhecidas; arquivo com 0 avisos →
  conferir com uma sonda; nenhuma função chamada `escape`), e `node --test tests/` no estado esperado.
- **Testes antigos que mudam de propósito**: `tests/errors.test.js:45` e `:132` (texto de
  "unauthorized", FR-005) e `tests/printer-setup.test.js:377` (a conferência recusada passa a dizer
  `needsKey: true`, US3) e o `setupCursorStops` de `tests/printer-setup.test.js` com impressora
  selecionada (ganha `setKey` depois de `remove`, US3). Para não mudar `klipper-restart.test.js:144` e `status-polish.test.js:83`,
  que comparam pedidos inteiros, o campo `stdin` só entra no pedido quando há chave. Qualquer outro teste antigo que quebrar: registrar aqui antes de mexer.
- **A chave nunca** em `args`, endereços, `console.log`, mensagens do painel ou notificações; nos
  testes, só chaves de exemplo (ex.: `0123456789abcdef0123456789abcdef`).
- **Impressoras reais**: o assistente não lê a chave delas (`/access/api_key`) nem mexe em
  `moonraker.conf`; tirar o computador dos `trusted_clients` e informar a chave são passos do
  usuário. `shell.json` com backup antes de qualquer gravação de teste, conferido depois.
- **Testes ao vivo**: o usuário clica e digita; `omarchy-restart-shell` antes de cada conferência ao
  vivo. Nunca `pkill -f`/`pgrep -f` com padrão do próprio comando.
- Textos visíveis em inglês, em `Model.TEXT`. Novas funções públicas no `module.exports`.
- Commits só quando o usuário pedir.

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 [P] Criar `tests/api-key.test.js` com o cabeçalho das outras suítes, a constante `KEY = "0123456789abcdef0123456789abcdef"`, `printers()` com uma impressora com chave (`lab.local`, `apiKey: KEY`) e uma sem (`voron.local`), e um helper `noKeyIn(value)` que falha se `KEY` aparecer em qualquer texto dentro de `value` (listas e objetos, recursivo)
- [X] T002 [P] Documentar em `tests/fixtures/README.md` as fixtures `server-info-unauthorized.synthetic`, `ws-identify-ok.synthetic` e `ws-identify-error.synthetic` (formato das mensagens do Moonraker v0.10/v0.11, código em research R1)

---

## Phase 2: Foundational (Blocking Prerequisites)

Configuração, pedidos com chave e mensagens servem às três histórias.

- [X] T003 Em `tests/api-key.test.js` ([model-api](./contracts/model-api.md#configuração), [Respostas](./contracts/model-api.md#respostas)): `normalizeApiKey` (`"  KEY  "` → `KEY` válida; `""` válida sem chave; `"a b"`, `"é"`, 257 caracteres → inválida); `normalizePrinters` dá `apiKey` e `apiKeyHint` (`"…cdef"`), sem chave `""`/`""`, chave inválida → `invalidReason: TEXT.invalidApiKey`; a lista em texto JSON (caminho da 001) também; `keyedRequest(args, KEY)` → `args` com `-H`, `@-` antes da URL (última posição continua a URL) e `stdin` `"X-Api-Key: KEY\n"`, `keyedRequest(args, "")` → mesmos `args` e `stdin` `""`; `readTransport`/`parseResponse` com a fixture `unauthorized` → `TEXT.unauthorized` (texto novo, com "or set an API key") sem chave e `TEXT.apiKeyRejected` com `hasKey`; `parseActionResponse` idem; `parseMoonrakerCheck(server-info-unauthorized.synthetic)` → `{ ok: false, needsKey: true }` sem chave e `API key rejected` com chave; "nunca lança"
- [X] T004 Em `Model.js`: textos de [model-api](./contracts/model-api.md#textos) (incluindo o novo `TEXT.unauthorized`), `normalizeApiKey`, `apiKey`/`apiKeyHint`/`invalidReason` em `normalizePrinters`, `keyedRequest`, `hasKey` em `readTransport`/`parseResponse`/`parseActionResponse`/`parseMoonrakerCheck`; atualizar de propósito os dois asserts de `tests/errors.test.js` para o texto novo; exportar; T003 passa e a suíte inteira continua passando

**Checkpoint**: a chave é lida, validada e transformada em pedido sem aparecer nos argumentos.

---

## Phase 3: User Story 1 - Usar uma impressora que exige chave (Priority: P1) 🎯 MVP

**Goal**: com a chave na configuração, status (consulta e conexão contínua) e comandos funcionam;
chave errada → "API key rejected".

**Independent Test**: servidor falso que exige a chave: sem chave "unauthorized … or set an API
key"; com a chave no `shell.json`, status, `live` e um comando aceitos; chave errada → "API key
rejected".

### Tests for User Story 1

- [X] T005 [US1] Em `tests/api-key.test.js`, pedidos: `planDispatch`, `planEstimate` (impressão com arquivo), `planServiceInfo` (Klipper desconectado) e `planCommand` (pausa) para a impressora com chave → cada pedido com `-H @-` e `stdin` com a chave, e `noKeyIn(request.args)`; para a sem chave → `stdin` `""` e `args` iguais aos de hoje (comparar com os testes atuais); `buildWebLaunchArgs`/`planOpenWeb` de uma impressora com chave → `noKeyIn`; "nunca lança"
- [X] T006 [US1] Em `tests/api-key.test.js`, conexão contínua ([data-model](./data-model.md#liveconnection-010--mudanças)): `buildIdentifyMessage(1, KEY, "0.11.0")` é JSON-RPC `server.connection.identify` com `client_name` "OmaKlippy", `type` "other", `api_key` KEY; `reconcileLives` guarda `apiKey` e recria a entrada quando a chave muda; `liveOpened` com chave → só `send` do `identify` (sem inscrição), sem chave → inscrição (como na 010); `liveMessage` com `ws-identify-ok.synthetic` (id do `identify`) → `send` da inscrição; com `ws-identify-error.synthetic` → `keyRejected: true`, sem inscrição, sem `entered`; com `keyRejected`, `notify_klippy_ready` não inscreve; "nunca lança"

### Implementation for User Story 1

- [X] T007 [US1] Em `Model.js`: chave nos pedidos de `planDispatch`, `planEstimate`, `planServiceInfo` e `planCommand` (via `keyedRequest`, campo `stdin` no pedido); `buildIdentifyMessage`; `apiKey`, `identifyId`, `keyRejected` no `emptyLive`/`reconcileLives`; `liveOpened`/`liveMessage` com o `identify` antes da inscrição; exportar; T005–T006 passam (os testes da 010 continuam passando)
- [X] T008 [US1] Em `BarWidget.qml`: os componentes de consulta, estimativa, serviço e comando recebem `stdin` (texto); com `stdin` não vazio, `stdinEnabled: true`, `write(stdin)` em `onStarted` e `stdinEnabled = false` logo depois (fecha a entrada, research R2); sem `stdin`, `stdinEnabled: false`; as leituras passam `hasKey` (impressora com chave) para `parseResponse`/`parseActionResponse`; conexão contínua usa as ações novas sem mudança no `LiveConnection.qml`
- [X] T009 [US1] Servidor falso no scratchpad (quickstart §2): HTTP em Python em 127.0.0.1:7198 que responde 401 sem `X-Api-Key` certo, a fixture `standby` em `/printer/objects/query`, 200 em `POST /printer/print/pause` e em `/server/info`; `WebSocketServer` (`qml`) em 127.0.0.1:7197 que só aceita a inscrição depois de `identify` com a chave; `shell.json` (backup) com uma impressora HTTP falsa e uma WS falsa: sem chave → texto novo de "unauthorized"; `apiKey` certa → `idle` (HTTP) e `live` (WS); `apiKey` errada → "API key rejected" e WS sem inscrição; restaurar e conferir o `shell.json`

**Checkpoint**: MVP — impressora que exige chave funcionando pela configuração.

---

## Phase 4: User Story 2 - A chave não vaza (Priority: P2)

**Goal**: a chave nunca aparece em linhas de comando, no painel inteira ou em endereços.

**Independent Test**: varredura de `/proc/*/cmdline` durante consultas, comandos e conexão; painel
só com `…cdef`.

- [X] T010 [US2] Em `tests/api-key.test.js`: `buildPanelModel`, `buildSetupModel`, `detailFor`, `buildActionsModel`, `buildIconState`, `confirmMessage` e `buildNotification` com a impressora com chave → `noKeyIn` em todo o resultado (só `apiKeyHint` "…cdef" pode aparecer); motivos de erro de uma impressora com chave (`unauthorized`, `API key rejected`) sem a chave
- [X] T011 [US2] Conferir e corrigir o que T010 apontar em `Model.js`; em `BarWidget.qml`/`Panel.qml`, nenhum `console.log` com pedidos ou a configuração
- [X] T012 [US2] Varredura com o servidor falso da T009: um observador Python lê `/proc/*/cmdline` de todos os processos a cada 50 ms durante 60 s com consultas, um comando (pausa pelo painel, pelo usuário) e a conexão contínua → 0 ocorrências da chave; registrar

---

## Phase 5: User Story 3 - Informar a chave sem editar arquivo (Priority: P3)

**Goal**: Set/Remove API key para a selecionada; campo da chave no "Add by address" quando recusado;
nota na busca.

**Independent Test**: com o servidor falso, Add by address → "needs an API key" → chave → Check
again → adicionada; Set API key errada → "API key rejected"; certa → ok; Remove API key → sem
`apiKey`, resto igual.

### Tests for User Story 3

- [X] T013 [US3] Em `tests/api-key.test.js`, gravação e formulários: `addPrinterToList(raw, "lab.local", "Lab", KEY)` → item com `apiKey`; chave inválida → erro `TEXT.invalidApiKey`; `setPrinterApiKey(raw, 1, KEY)` grava só na ordem 1, preservando `webUrl`/campos extras das outras; `setPrinterApiKey(raw, 1, "")` tira o campo; inválida → erro, lista intacta; `submitForm(…, KEY)` → conferência com `stdin` da chave; `acceptCheck` com `needsKey` → estado `needsKey`; `submitForm` de novo com a chave → `checking`; `parseScanNeedsKey` com linhas `401` → IPs; candidatos `needsKey` na busca (`acceptScan` com eles) aparecem em `buildSetupModel` com `needsKey: true`; `buildSetupModel` traz `apiKeyHint`/`hasKey` da selecionada e `formNeedsKey`; `setupCursorStops` com `setKey`, `removeKey` (só com chave), `apiKeyField`/`saveKey` (campo aberto) e `checkAgain` (formulário em `needsKey`); `confirmMessage("removeApiKey", "Lab")` e `confirmLabel`; "nunca lança"

### Implementation for User Story 3

- [X] T014 [US3] Em `Model.js`: `addPrinterToList` com `apiKey`, `setPrinterApiKey`, `submitForm`/`acceptCheck` com `needsKey`, `parseScanNeedsKey` e os candidatos `needsKey` na busca, `buildSetupModel`/`setupCursorStops` novos, textos de confirmação; exportar; T013 passa e os testes da 009 continuam passando
- [X] T015 [US3] Em `BarWidget.qml`: `setApiKey(key, text)` e `removeApiKey(key)` com `setPrinterApiKey` + `savePrinters` (009); o formulário passa a chave; a verificação da busca lê também os 401; em `Panel.qml` ([display.md](./contracts/display.md)): "API key …cdef", "Set API key" (abre um `TextField` com `password: true`, vazio, + Save), "Remove API key" com `ConfirmDialog` (Back selecionado), mensagem `invalid API key`; no formulário, em `needsKey`, a nota, o campo da chave e "Check again"; nos resultados, a nota "needs an API key"; teclado e foco no padrão dos campos da 009 (o `keyCatcher` bloqueado com qualquer campo focado)
- [X] T016 [US3] Validar com o usuário (quickstart §2.5–2.6), com o servidor falso e backup do `shell.json`: Add by address da falsa → "needs an API key" → chave → Check again → adicionada e `live`; Set API key errada → "API key rejected"; certa → ok; Remove API key (Back antes, depois Remove) → `shell.json` sem `apiKey` e o resto igual

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T017 [P] Atualizar `README.md`: chave de API (onde pôr: painel ou `apiKey` no `shell.json`; como obtê-la no Moonraker), o aviso de que o `shell.json` é legível por outros usuários do computador e a sugestão de `trusted_clients` em computadores compartilhados, o texto novo de "unauthorized", "API key rejected", e na seção Privileges que a chave só vai à própria impressora, pela entrada do `curl` e pelo `identify`, nunca na linha de comando
- [X] T018 [P] Em `manifest.json`, `version` de `0.10.0` para `0.11.0`
- [X] T019 [P] Auditorias: Princípio VIII (nenhuma cor/tamanho fixo novo), I (nenhum symlink, manifesto válido) e III (nenhum binário novo; nenhuma escrita de arquivo; `grep` de `apiKey` em `console.`/`args` sem ocorrências fora do `stdin`)
- [X] T020 Sem regressão nas impressoras reais (quickstart §4): Voron e Biqu sem chave seguem `live`, consultas como na 010, um comando pelo usuário se ele quiser; e, **se o usuário quiser** (quickstart §3), o teste numa impressora real com o computador tirado dos `trusted_clients` por ele e a chave informada por ele
- [ ] T021 Ciclo de vida: clique e Escape (fora e dentro do campo da chave) pelo usuário; summon/hide, disable/enable (restaurar o `shell.json` do backup), reinício do shell; `remove`/reinstalar depois do push (o usuário roda o `remove`), com cópia da pasta e `.specify/feature.json` restaurado
- [ ] T022 Registrar em `specs/011-moonraker-api-key/hardware-test.md` (Princípio VII): servidor falso (cenários e varredura de processos), regressão nas impressoras reais, teste real se houver, versões
- [ ] T023 Marcar a fatia como concluída no `spec.md` só depois de T021 (com remove/reinstalar) e T022

---

## Dependencies & Execution Order

- **Setup (Phase 1)**: T001 e T002 em paralelo.
- **Foundational (Phase 2)**: T003 → T004; bloqueia as histórias.
- **US1**: T005–T006 → T007 → T008 → T009.
- **US2**: depende da US1 (os pedidos com chave); T010 → T011 → T012.
- **US3**: depende da Phase 2 e do `stdin` nos processos (T008); T013 → T014 → T015 → T016.
- **Polish**: T017–T019 depois das histórias; T020–T023 no fim.

```text
Setup ─ Foundational ─ US1 ─┬─ US2 ─┬─ Polish
                            └─ US3 ─┘
```

### Parallel Opportunities

- Setup: T001 e T002.
- Polish: T017, T018 e T019.

## Parallel Example: Polish

```bash
Task: "T017 README"
Task: "T018 manifest 0.11.0"
Task: "T019 Auditorias"
```

## Implementation Strategy

1. Setup e Foundational (configuração, pedidos com chave, mensagens).
2. US1: chave em todos os pedidos e na conexão contínua (MVP) → servidor falso (T009).
3. US2: varredura de vazamento (T010–T012).
4. US3: painel (Set/Remove API key, Add by address, busca).
5. Polish → README, versão, auditorias, regressão, ciclo de vida, registro. **A fatia só está
   concluída depois de T021 e T022.**

## Notes

- Os testes devem falhar antes da implementação correspondente.
- Commits só quando o usuário pedir; push só quando ele disser "push".
- Fora de escopo (spec): cofre de senhas do sistema, criptografar a configuração, login com usuário
  e senha, editar outros campos da impressora pelo painel.
