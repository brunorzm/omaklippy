---

description: "Task list for 010-realtime-status"
---

# Tasks: Status em tempo real pela conexão contínua com o Moonraker

**Input**: Design documents from `specs/010-realtime-status/`

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
  conferir com uma sonda que a análise está ligada), e `node --test tests/` no estado esperado.
- **Nenhum teste antigo sai.** Os de `planDispatch`, `parseResponse`, `buildPanelModel` e
  `detailFor` continuam passando sem mudança; qualquer quebra: registrar aqui antes de mexer.
- **Testes ao vivo**: o usuário aquece, imprime, reinicia o Moonraker e para o Klipper (Mainsail ou
  painel); o assistente só conecta/inscreve (leitura) e faz `GET`, prepara observadores em Python
  (sem `bc`) e confere. Editar arquivos da pasta do plugin recarrega o widget:
  `omarchy-restart-shell` antes de cada conferência ao vivo. Nunca `pkill -f`/`pgrep -f` com padrão
  do próprio comando.
- **Repositório público**: fixtures reais reduzidas aos campos usados.
- Textos visíveis em inglês, em `Model.TEXT`. Novas funções públicas no `module.exports`.
- Commits só quando o usuário pedir.

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 [P] Criar `tests/live.test.js` com o cabeçalho das outras suítes (`node:test`, `assert/strict`, `loadModel`, `loadFixture`), um helper `msg(name)` que devolve o `message` das fixtures `ws-*`, `printers()` com Voron (`voron.local`) e Biqu (`biqu.local:7125`) e a constante `T0`; sem casos ainda
- [X] T002 [P] Documentar em `tests/fixtures/README.md` as fixtures `ws-*` ([connection.md](./contracts/connection.md#fixtures)): o formato `{ "message": "<texto recebido>" }`, quais são reais (Voron, 2026-10-01, parada) e quais sintéticas, e que a `ws-proc-stat.synthetic` foi reduzida (a real traz o tráfego de rede das interfaces)

---

## Phase 2: Foundational (Blocking Prerequisites)

Leitura das mensagens e o arquivo QML isolado servem às três histórias.

- [X] T003 Em `tests/live.test.js` ([model-api](./contracts/model-api.md#mensagens)): `readingFromStatus(JSON.parse(fixture).result.status)` é igual a `parseResponse` para `standby`, `printing`, `paused`, `shutdown`, `startup`, `klippy-error.synthetic`, `printing-layers.synthetic` (mesmos campos, `httpStatus` 200); `liveUrl`: `http://voron.local` → `ws://voron.local/websocket`, `http://biqu.local:7125` → `ws://biqu.local:7125/websocket`, `https://x/moon` → `wss://x/moon/websocket`, `""`/lixo → `""`; `buildSubscribeMessage(3)` é JSON-RPC `printer.objects.subscribe` com `id` 3 e exatamente os objetos de [connection.md](./contracts/connection.md#enviado-só-isto-fr-015); `parseLiveMessage`: `ws-subscribe-voron` → `result` (id 2, `status.webhooks.state` `ready`), `ws-update-voron` → `update` com `diff` só de temperaturas, `ws-update-printing.synthetic` → `update`, `ws-subscribe-error.synthetic` → `error` (id 2, "Klippy Host not connected"), `ws-klippy-disconnected.synthetic`/`ws-klippy-ready.synthetic` → `klippyDisconnected`/`klippyReady`, `ws-proc-stat.synthetic` → `ignore`, lixo → `ignore`; `mergeStatus` sobrepõe por objeto sem mexer no anterior e aceita objeto novo; `isUrgentDiff`: `webhooks` ou `print_stats.state` → `true`, só temperaturas ou progresso → `false`; textos novos no teste de inglês; "nunca lança" para todas
- [X] T004 Em `Model.js`: `TEXT.live`, `TEXT.liveUnavailable`, `TEXT.liveInstall`, `liveUrl`, `buildSubscribeMessage`, `parseLiveMessage` (descarta `notify_proc_stat_update` pelo começo do texto, sem `JSON.parse`), `mergeStatus`, `isUrgentDiff`, `readingFromStatus` (e `parseResponse` passa a usá-la, sem mudar o resultado); exportar; T003 passa e a suíte inteira continua passando
- [X] T005 Criar `LiveConnection.qml`: `import QtWebSockets`, um `WebSocket` com `url` e `active` vindos de fora, sinais `opened()`, `message(string text)`, `ponged()` e `closed(string reason)` (fechado ou erro, uma vez por conexão), funções `send(text)`, `ping()` e `stop()`; sem lógica de decisão; manifesto/validate aceitam o arquivo; `omarchy-restart-shell` logo depois de criá-lo e conferir no log que o shell resolve o `import QtWebSockets` (research R1)

**Checkpoint**: mensagens lidas por funções puras; o arquivo de conexão carrega no shell.

---

## Phase 3: User Story 1 - Ver mudanças da impressora na hora (Priority: P1) 🎯 MVP

**Goal**: com a conexão de pé, status ao vivo (≤2 s), sem consulta periódica, `live` no painel.

**Independent Test**: Voron ociosa: `live` no painel, 0 consultas de status em 60 s, e o usuário
aquece o bico pelo Mainsail e vê o alvo em ≤2 s.

### Tests for User Story 1

- [X] T006 [US1] Em `tests/live.test.js`, máquina da conexão — caminho feliz ([data-model](./data-model.md#liveconnection-por-impressora-liveskey)): `emptyLive(url)` = `{ state: "idle", url, attempt: 0, retryAt: null, lastFrameAt: null, subscribeId: 0, buffer: null, dirty: false, urgent: false }`; `reconcileLives` cria uma entrada por impressora com `liveUrl` não vazio, tira as que saíram e recria a que mudou de `url` (mesmo objeto quando nada muda); `liveTick` com `idle` → ação `open` e estado `connecting`; `liveOpened` → `open` e ação `send` com `buildSubscribeMessage(subscribeId + 1)`; `liveMessage` com o `result` do mesmo `id` → `subscribed`, `buffer` = `status`, `dirty`+`urgent`, `attempt` 0, `entered: true`; `result` de outro `id` → mesmo objeto; `update` → `buffer` mesclado, `dirty`, `urgent` só com `isUrgentDiff`; `liveFlush(lives, key, false)` entrega leitura só com `urgent`, `liveFlush(lives, key, true)` entrega com `dirty`, e depois `dirty: false`; sem `dirty` → `reading: null`; `livePong` só mexe em `lastFrameAt`; "nunca lança"
- [X] T007 [US1] Em `tests/live.test.js`, motor: `acceptLive(statuses, key, reading, T0)` aplica a leitura como `applyReading`, marca `live: true` e `requestedAt: T0` sem mexer em `pending`/`seq`; chave desconhecida → mesmo objeto; `leaveLive` → `live: false` (já `false` → mesmo objeto); `planDispatch` pula a impressora com `live: true` e pede a outra; `detailFor` de um status ao vivo (não `offline`) → `freshnessText` `"live"`, e de um não ao vivo → o texto de hoje; `planEstimate` e `planServiceInfo` funcionam com statuses vindos de `acceptLive` (impressão com arquivo → pedido de metadata; `klippyDownSince` não é marcado por leitura ao vivo)

### Implementation for User Story 1

- [X] T008 [US1] Em `Model.js`: `emptyLive`, `reconcileLives`, `liveTick` (só `open` nesta história; `ping`/morte na US2), `liveOpened`, `liveMessage` (`result`, `update`; `error`/`klippy*` na US2), `livePong`, `liveFlush`, `acceptLive`, `leaveLive`; `planDispatch` pula `live: true`; `detailFor` usa `TEXT.live`; exportar; T006–T007 passam
- [X] T009 [US1] Em `BarWidget.qml`: `property var lives` com `Model.reconcileLives` no `syncConfig`; um `Instantiator` sobre as chaves de `lives` (fora do `requestHolder`) criando um `Loader` de `LiveConnection.qml` por impressora com `url`/`active` de `lives[key]`; um `Timer` de 1 s que roda `liveTick`, executa as ações (`open`, `send`, `ping`, `close`) e faz `liveFlush(…, true)`; nas mensagens, `liveMessage` + `liveFlush(…, false)` (entrega urgente na hora); cada leitura entregue → `acceptLive` + `observe(key)` + `planEstimate`/`planServiceInfo` (extrair de `dispatch()` para uma função comum); `Component.onDestruction` para todas as conexões
- [X] T010 [US1] Validar com o usuário (quickstart §2.1–2.3): `omarchy-restart-shell`; painel `live` na Voron e na Biqu; contar por 60 s os `curl … /printer/objects/query` (observador Python com `pgrep -a -x curl` a cada 0,2 s): 0; o usuário põe um alvo no bico pelo Mainsail e o painel mostra o alvo em ≤2 s (medir com prints a cada 0,5 s); conferir no log nenhum erro e, com `ss -tnp`, uma conexão por impressora por barra

**Checkpoint**: MVP — status ao vivo com as impressoras de pé.

---

## Phase 4: User Story 2 - Nunca pior do que hoje: alternativa e reconexão (Priority: P2)

**Goal**: queda percebida em ≤10 s com volta imediata à consulta periódica; reconexão sozinha;
Klipper desconectado como na 008; aviso sem o módulo.

**Independent Test**: o usuário reinicia o Moonraker da Biqu: em ≤10 s `updated … ago`, de volta a
`live` em ≤30 s; parar o serviço do Klipper como na 008 e ver o "Restart Klipper" em 15 s.

### Tests for User Story 2

- [X] T011 [US2] Em `tests/live.test.js`, falhas ([connection.md](./contracts/connection.md#tempos)): `liveTick` em `subscribed` → ação `ping` a cada 5 s (não a cada tick); 10 s sem quadro (`lastFrameAt`) → ação `close`, estado `waiting`, `left: true`; `liveClosed` → `waiting`, `retryAt` = now + 2, 4, 8, 16, 30, 30 s nas tentativas seguidas, `buffer: null`, `left` só se estava `subscribed`; `liveTick` antes do `retryAt` → nada, depois → `open`; uma inscrição bem-sucedida zera `attempt` (próxima queda espera 2 s); `liveMessage` com `error` do pedido atual → continua `open`, sem `entered`; `klippyDisconnected` em `subscribed` → `open`, `buffer: null`, `left: true`; `klippyReady` → ação `send` de nova inscrição com `id` + 1; `liveWarning(true)` = `"Live updates unavailable: install qt6-websockets"`, `liveWarning(false)` = `""`; `buildPanelModel` com o parâmetro novo → `liveWarning`, sem ele → `""` (os testes atuais de `buildPanelModel` passam sem mudança); "nunca lança"

### Implementation for User Story 2

- [X] T012 [US2] Em `Model.js`: `ping` e morte por 10 s sem quadro em `liveTick`, `liveClosed` com espera crescente, `error`/`klippyDisconnected`/`klippyReady` em `liveMessage`, `liveWarning`, `buildPanelModel` com `liveWarning`; exportar; T011 passa
- [X] T013 [US2] Em `BarWidget.qml`: `closed` da conexão → `liveClosed`; toda saída (`left`) → `leaveLive` + `dispatch(key)` na hora; `Loader.status === Loader.Error` → `liveUnavailable = true` (uma vez, para todas) e nenhuma tentativa; `panelModel` com `Model.liveWarning(liveUnavailable)`; em `Panel.qml`, o aviso `liveWarning` com o mesmo estilo do aviso de notificações ([display.md](./contracts/display.md))
- [X] T014 [US2] Servidor falso no scratchpad (`qml` com `WebSocketServer` do `QtWebSockets`, em 127.0.0.1, fora da pasta do plugin) e `shell.json` temporário só com ele (backup antes, restaurado depois): (a) aceita e responde a inscrição com `ws-subscribe-voron`, depois para de mandar quadros e de responder `pong` → o widget sai do `live` em ≤10 s e consulta por HTTP (o mesmo servidor responde a consulta com `standby`); (b) responde a inscrição com `ws-subscribe-error.synthetic` → nunca `live`, consulta periódica; (c) volta a responder → `live` de novo dentro da espera; e `Loader` com módulo inexistente num `qml` de teste → `Loader.Error` (o aviso real é conferido pelo teste puro)
- [X] T015 [US2] Validar com o usuário (quickstart §3.1–3.3): o usuário reinicia o Moonraker da Biqu (Mainsail → Machine) → `updated … ago` em ≤10 s e `live` de novo em ≤30 s, medidos; o usuário para o serviço do Klipper na Voron (como na 008) → sai do `live`, `Restart Klipper` depois de 15 s, e ao reiniciá-lo pelo painel volta a `live`; com uma impressora desligada (se o usuário quiser), `offline` como hoje e tentativas espaçadas sem erros no log

---

## Phase 5: User Story 3 - Efeito dos comandos sem consulta extra (Priority: P3)

**Goal**: com a impressora ao vivo, nenhum follow-up HTTP depois de um comando; proteção de
notificação (004) como hoje.

**Independent Test**: o usuário pausa e retoma uma impressão pelo painel na Voron ao vivo: estados
em ≤2 s, nenhuma notificação, nenhuma consulta extra.

- [X] T016 [US3] Em `tests/live.test.js`: `afterCommand(statuses, key)` → `{ statuses, dispatch }`: ao vivo → `dispatch: false` e statuses iguais (sem `followUp`); não ao vivo → o comportamento de hoje (`requestFollowUp` e `dispatch: true`); proteção: depois de `protectStart`/`protectFinish(answeredAt = T0)`, uma leitura de `acceptLive(…, T0 + 1)` libera com `releaseProtection(prot, key, status.requestedAt, id, registry)` e uma de `T0 - 1` não; `observe` sobre leituras ao vivo seguidas (printing → paused protegido) não gera evento
- [X] T017 [US3] Em `Model.js`, `afterCommand`; em `BarWidget.qml`, `acceptCommand` usa `afterCommand` (sem `dispatch(key)` quando ao vivo); T016 passa
- [X] T018 [US3] Validar com o usuário (quickstart §2.4), só se houver uma impressão que ele queira usar: pausar e retomar pelo painel com a Voron ao vivo → `paused`/`printing` em ≤2 s de cada mudança, 0 notificações (`dbus-monitor` como na 008), 0 consultas `objects/query` depois do comando; sem impressão, a US3 fica validada pelos testes puros (T016) e registrada assim no `hardware-test.md`

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T019 [P] Atualizar `README.md`: atualização ao vivo pela conexão contínua (inscrição só de leitura; comandos continuam por HTTP), consulta periódica como alternativa (o que `refreshIntervalSec` passa a valer), `qt6-websockets` na tabela de dependências como opcional com o que a ausência desliga e o aviso, linha nova em Privileges, `live` no painel
- [X] T020 [P] Em `manifest.json`, `version` de `0.9.0` para `0.10.0`
- [X] T021 [P] Auditorias: Princípio VIII (nenhuma cor/tamanho fixo novo), I (nenhum symlink, manifesto válido, `LiveConnection.qml` na raiz) e III (nenhum binário novo; a conexão só envia a inscrição e o `ping`; nenhuma escrita de arquivo)
- [X] T022 Ciclo de vida ([quickstart §4](./quickstart.md#4-ciclo-de-vida-princípio-vi)): clique e Escape pelo usuário; summon/hide, disable/enable (restaurar o `shell.json` do backup), reinício do shell por comando; depois de `disable` e do reinício, nenhuma conexão do `quickshell` com as impressoras (`ss -tnp`) além das do widget reiniciado; `remove`/reinstalar depois do push (o usuário roda o `remove`), com cópia da pasta e `.specify/feature.json` restaurado
- [X] T023 Registrar em `specs/010-realtime-status/hardware-test.md` (Princípio VII): latência medida, consultas por minuto antes e depois, tempo de queda e de volta, Klipper parado, versões (Moonraker v0.11.0 na Voron, v0.10.0 na Biqu)
- [X] T024 Marcar a fatia como concluída no `spec.md` só depois de T022 (com remove/reinstalar) e T023

---

## Dependencies & Execution Order

- **Setup (Phase 1)**: T001 e T002 em paralelo.
- **Foundational (Phase 2)**: T003 → T004; T005 em paralelo com T003–T004 (arquivo diferente);
  bloqueia as histórias.
- **US1**: T006–T007 → T008 → T009 → T010.
- **US2**: depende da US1 (a máquina e o `Instantiator`); T011 → T012 → T013 → T014 → T015.
- **US3**: depende da US1; T016 → T017 → T018. Pode vir antes da US2.
- **Polish**: T019–T021 depois das histórias; T022–T024 no fim.

```text
Setup ─ Foundational ─ US1 ─┬─ US2 ─┬─ Polish
                            └─ US3 ─┘
```

### Parallel Opportunities

- Setup: T001 e T002.
- Foundational: T005 (`LiveConnection.qml`) com T003–T004 (`Model.js`/testes).
- Polish: T019, T020 e T021.

## Parallel Example: Polish

```bash
Task: "T019 README"
Task: "T020 manifest 0.10.0"
Task: "T021 Auditorias"
```

## Implementation Strategy

1. Setup e Foundational (mensagens + arquivo de conexão).
2. US1: conexão, inscrição, entregas ao vivo (MVP) → validar na Voron e na Biqu (T010).
3. US2: queda, reconexão, Klipper desconectado e aviso → servidor falso (T014) e impressoras (T015).
4. US3: comandos sem follow-up.
5. Polish → README, versão, auditorias, ciclo de vida, registro. **A fatia só está concluída
   depois de T022 e T023.**

## Notes

- Os testes devem falhar antes da implementação correspondente.
- Commits só quando o usuário pedir; push só quando ele disser "push".
- Fora de escopo (spec): comandos pela conexão contínua, conexão compartilhada entre barras,
  histórico, webcam, respostas de G-code, chave de API.

## Implementation notes (2026-10-01)

- As funções puras da US1, US2 e US3 (T006–T008, T011–T012, T016–T017) foram escritas juntas, com
  os testes antes; a parte QML da US1 e da US2 (T009, T013) também, para uma só rodada de testes
  com o usuário.
- O aviso de módulo ausente vem de `hostWidget.liveWarningText` no `Panel.qml`, e não de um campo
  novo em `buildPanelModel`: o campo novo quebraria o `deepEqual` do teste do painel vazio
  (`tests/panel.test.js`), e a regra desta lista é não mexer em teste antigo.
- Servidor falso (T014, `WebSocketServer` num `qml` do scratchpad, `shell.json` só com ele e
  restaurado igual): ao vivo, 0 consultas; conexão silenciosamente morta (`SIGSTOP`) percebida em
  10,7 s com o limite de 10 s → limite baixado para **9 s** (tique de 1 s), medido de novo **9,2 s**;
  depois do `SIGCONT`, ao vivo de novo em menos de 2 s; inscrição recusada → nunca ao vivo, consulta
  periódica (painel "network error (curl 52)", o que um servidor só de WebSocket responde a HTTP).
- Achado no servidor falso: com a inscrição recusada, a conexão "open" não mandava `ping` e era
  fechada a cada ~15 s (o Moonraker real manda `proc_stat` todo segundo, mas não dá para contar com
  isso): o `ping` vale agora também para a conexão aberta esperando o Klipper.
- No shell real (um monitor, eDP-1): uma conexão por impressora pelo nginx da porta 80, 0 consultas
  de status em 20 s, painel `live`.
