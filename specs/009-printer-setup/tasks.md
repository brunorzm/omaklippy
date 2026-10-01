---

description: "Task list for 009-printer-setup"
---

# Tasks: Cadastrar impressoras pelo painel, com descoberta na rede

**Input**: Design documents from `specs/009-printer-setup/`

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
  `qmllint -I "$OMARCHY_PATH/shell" BarWidget.qml Panel.qml` sem erro (e o lint real com `qs/` em
  scratch sem avisos novos fora das classes conhecidas), e `node --test tests/` no estado esperado.
- **Teste antigo que sai de propósito**: "setupCommand is the exact command shown in the empty
  panel" (`tests/panel.test.js`), com a função (FR-009). Qualquer outro teste antigo que quebrar:
  registrar aqui antes de atualizar.
- **`shell.json` do usuário**: qualquer teste que grave (adicionar/remover) começa com backup no
  scratchpad e termina conferindo a entrada do OmaKlippy contra o backup.
- **Testes ao vivo**: o usuário clica e digita; o assistente prepara e confere. Não enviar teclas
  com `wtype` sem perguntar. Editar arquivos da pasta do plugin recarrega o widget:
  `omarchy-restart-shell` antes de cada conferência ao vivo.
- **Rede**: a varredura real só roda quando combinada com o usuário; nas impressoras, só GET.
  Nunca `pkill -f`/`pgrep -f` com padrão do próprio comando.
- **Repositório público**: fixtures reais reduzidas aos campos usados (sem IPs de VPN, caminhos
  com usuário, números de série).
- Textos visíveis em inglês, em `Model.TEXT`. Novas funções públicas no `module.exports`.
- Commits só quando o usuário pedir.

---

## Phase 1: Setup (Shared Infrastructure)

- [ ] T001 [P] Criar `tests/printer-setup.test.js` com o cabeçalho das outras suítes (`node:test`, `assert/strict`, `loadModel`, `loadFixture`), `printers()` com Voron (`voron.local`, `webUrl` `http://voron.local:81`) e Biqu (`biqu.local`) e um helper `fx(name)` que devolve `{ stdout, exitCode }` da fixture; sem casos ainda
- [ ] T002 [P] Criar as fixtures de [commands.md](./contracts/commands.md#fixtures) em `tests/fixtures/`: `ip-addr.synthetic` (JSON do `ip -j -4 addr show` com `lo` 127.0.0.1/8, `wlp7s0` 192.168.1.21/24 global, `tailscale0` 100.64.0.5/32, `docker0` 172.17.0.1/16), `avahi-moonraker.synthetic` (linhas `+` e `=` no formato real, duas impressoras IPv4 — `voron` em 192.168.1.110 e `My\032Printer` em 192.168.1.120, porta 7125 — e uma linha `=` IPv6), `scan.synthetic` (254 linhas `http://192.168.1.N:7125/server/info 000`, com 200 em .100 e .110), `set-widget-ok` (stdout `ok\n`, exit 0) e `set-widget-error.synthetic` (stdout `could not find widget io.github.brunorzm.omaklippy\n`, exit 0); e, só com GET, `printer-info-voron` (`/printer/info` real reduzido a `hostname`, `state`, `software_version`) e `server-info-voron` (`/server/info` real reduzido a `klippy_state`, `moonraker_version`), no formato `{exitCode, stdout}` com `\n<código>`; citar todas em `tests/fixtures/README.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

A gravação da lista e a tela de cadastro servem às três histórias.

- [ ] T003 Em `tests/printer-setup.test.js`, lista nova e gravação ([model-api](./contracts/model-api.md#lista-nova-e-gravação)): `rawPrinters` com lista, com texto JSON de lista (caminho do antigo `setupCommand`), com lixo → `[]`; `addPrinterToList(raw, "biqu.local", "", printers)` → erro `"biqu.local is already in the list"`; `"a b"` → erro `TEXT.invalidAddress`; `"192.168.1.50"` + `"Ender"` → lista com os dois itens antigos intactos (incluindo `webUrl` e um campo extra `foo`) e `{ name: "Ender", address: "192.168.1.50" }` no fim, `key` = `"http://192.168.1.50#2"`; nome vazio → item sem `name`; `removePrinterFromList(raw, 1)` tira a Biqu e mantém a Voron com `webUrl`; com um item inválido no meio (`{ address: 5 }`), a ordem pula esse item como `normalizePrinters`; remover a última → `[]`; `buildSaveArgs(list)` = `["omarchy-shell","shell","setBarWidget","io.github.brunorzm.omaklippy","printers"," " + JSON.stringify(list),"{}"]` (o espaço na frente é obrigatório: research R1); `parseSaveResult`: `set-widget-ok` → `{ ok: true }`, `set-widget-error.synthetic` → falha com o texto, `launched: false` → falha `"omarchy-shell not found"`, exit −2 (guarda) → `TEXT.setup.shellNoAnswer`; "nunca lança" para todas
- [ ] T004 Em `Model.js`: `TEXT.setup` inteiro (lista de [model-api](./contracts/model-api.md#textos-novos-textsetup)), `rawPrinters`, `addPrinterToList`, `removePrinterFromList`, `buildSaveArgs`, `parseSaveResult`; exportar; T003 passa e a suíte inteira continua passando (inclusive o teste de textos em inglês)
- [ ] T005 Em `BarWidget.qml`: `savePrinters(list, selectKey)` cria um processo `saveComponent` (padrão dos outros componentes: um resultado, guarda de 5 s) com `Model.buildSaveArgs`; guarda `saveState` (`{ busy, message }`) e `pendingSelectKey`; no resultado ok, quando `config.printers` passar a conter `pendingSelectKey`, seleciona-a e zera; falha → `saveState.message = fill(TEXT.setup.saveFailed, motivo)`; processo parado com o widget
- [ ] T006 Em `Panel.qml` e `Model.js`: tela de cadastro (`view: "main" | "setup"`) de [display.md](./contracts/display.md): botão `Printers…` na última linha da área de ações (aparência comum, parada de cursor), `PanelSectionHeader` "Printers", `Back` (fora do painel vazio), aviso `notEditable` quando `bar.moduleWidgets("io.github.brunorzm.omaklippy").length > 1`, mensagem de falha de gravação; o painel vazio abre na tela de cadastro no lugar de "Add a printer with:" + comando; remover `setupCommand` de `Model.js`, seu uso em `Panel.qml` e o teste em `tests/panel.test.js` (saída de propósito); `buildSetupModel(printers, discovery, form, selectedKey, editable)` com teste em `tests/printer-setup.test.js`; fechar o painel volta para `main` (ou `setup` se vazio)

**Checkpoint**: a tela de cadastro abre e volta; a gravação funciona por função (ainda sem botões que gravem).

---

## Phase 3: User Story 1 - Adicionar uma impressora achada na rede (Priority: P1) 🎯 MVP

**Goal**: Search network → lista com nome e endereço (já cadastradas marcadas) → Add grava e
seleciona.

**Independent Test**: na rede real, buscar e ver Voron e Biqu (Added); remover a Biqu (por função
ou depois da US3) e adicioná-la pela busca.

### Tests for User Story 1

- [ ] T007 [US1] Em `tests/printer-setup.test.js`, parse ([model-api](./contracts/model-api.md#redes-anúncio-verificação-nomes)): `parseLocalNets(ip-addr.synthetic)` → `[{ iface: "wlp7s0", prefix: "192.168.1.", self: "192.168.1.21" }]` (sem `lo`, `tailscale0`, `docker0`); exit ≠ 0 e lixo → `[]`; `parseMdns(avahi-moonraker.synthetic)` → `[{ name: "voron", host: "voron.local", ip: "192.168.1.110", port: 7125 }, { name: "My Printer", … }]` (sem IPv6, `\032` desfeito); `buildScanArgs(nets)` tem 253 URLs (sem `.21`), `--parallel`, `--parallel-max 64`, `-o /dev/null` antes de cada URL; sem redes → `[]`; `parseScan(scan.synthetic)` → `["192.168.1.100", "192.168.1.110"]`; `parseReverse("192.168.1.110\tvoron.local\n", 0)` → `"voron.local"`, exit ≠ 0 → `""`; `parseHostname(printer-info-voron)` → `"voron"`, `klippy-disconnected` → `""`; "nunca lança"
- [ ] T008 [US1] Em `tests/printer-setup.test.js`, máquina da busca ([data-model](./data-model.md#discovery-estado-da-busca)): `startDiscovery` → `running`, `seq 1`, pedidos `nets` e `mdns`; `acceptNets` com redes → pedido `scan`, sem redes → `scanUnavailable`; `acceptMdns` com `launched: false` → `mdnsUnavailable`; `acceptScan` cria Found com pedidos `reverse` e `hostname` por IP; a Voron pelo anúncio e pela verificação → um Found com `sources ["mdns","scan"]`; `acceptReverse`/`acceptHostname` completam `address` (`voron.local` > host do anúncio > IP) e `name` (`hostname` > nome do anúncio > `address` sem `.local` > IP); `added: true` para a Voron cadastrada como `voron.local` mesmo achada só pelo IP com reverso `voron.local`, e para uma cadastrada pelo IP; `waiting` zerado → `done`; resultado com `seq` antiga ignorado (mesmo objeto); `cancelDiscovery` → `idle`, `found: []`; `expireDiscovery` depois de 30 s → `done` com o que havia; "nunca lança"

### Implementation for User Story 1

- [ ] T009 [US1] Em `Model.js`: `buildNetsArgs`, `parseLocalNets` (só IPv4 `scope global`, prefixo de 16 a 30, fora de `lo|tailscale*|wg*|tun*|tap*|docker*|br-*|veth*|virbr*|zt*`, uma /24 por rede), `buildMdnsArgs`, `parseMdns`, `buildScanArgs`, `parseScan`, `buildReverseArgs`, `parseReverse`, `buildHostnameArgs`, `parseHostname`, `emptyDiscovery`, `startDiscovery`, `acceptNets`, `acceptMdns`, `acceptScan`, `acceptReverse`, `acceptHostname`, `cancelDiscovery`, `expireDiscovery`, `discoveryDone`; `buildSetupModel` com resultados e avisos; exportar; T007–T008 passam
- [ ] T010 [US1] Em `BarWidget.qml`: `startDiscovery()`/`cancelDiscovery()`; um componente de processo genérico para a busca (`kind`, `seq`, `ip`, `args`, `guardMs`, um resultado, `launched` informado) que entrega a `Model.accept*` certo; guardas de commands.md (`ip` 3 s, `avahi-browse` 6 s, verificação 20 s, `avahi-resolve` 3 s, `/printer/info` `timeoutSec + 1`); timer de 30 s que chama `expireDiscovery`; cancelar ou fechar o painel para todos os processos da busca; `addFound(ip)` usa `addPrinterToList` com `address`/`name` do Found e `savePrinters`
- [ ] T011 [US1] Em `Panel.qml`: na tela de cadastro, `Search network` (vira "Searching… N found" + `Cancel`), lista de resultados (nome, endereço, `Add` ou `Added` desabilitado), "No printers found on the network.", avisos `mdnsUnavailable`/`scanUnavailable`; teclado (`j`/`k`, Enter; Escape cancela a busca em andamento) de [display.md](./contracts/display.md#teclado-fr-010); depois de adicionar, volta para `main` com a impressora nova selecionada
- [ ] T012 [US1] Validar com o usuário (quickstart §2 e §3.2): busca real acha Voron e Biqu ("Added") em até 30 s, medir o tempo; Cancel e fechar o painel no meio param tudo (sem `curl`/`avahi` sobrando); com backup do `shell.json`, remover a Biqu por função (ou na US3) e adicioná-la pela busca: selecionada, `shell.json` com ela no fim e a Voron intacta (com `webUrl` se houver)

**Checkpoint**: MVP entregue.

---

## Phase 4: User Story 2 - Adicionar uma impressora pelo endereço (Priority: P2)

**Goal**: endereço + nome digitados, conferência de Moonraker, "Add anyway" sem resposta.

**Independent Test**: `biqu.local` já cadastrada → aviso; `a b` → inválido; IP sem resposta →
motivo + Add anyway; recadastrar a Biqu como "Biqu B1".

### Tests for User Story 2

- [ ] T013 [US2] Em `tests/printer-setup.test.js`: `parseMoonrakerCheck(server-info-voron)` → `{ ok: true }`; `refused` → falha "connection refused"; `unauthorized` → falha com `TEXT.unauthorized`; 200 sem `klippy_state`/`moonraker_version` → falha "not a Moonraker answer"; máquina do formulário (`emptyForm`, `submitForm(form, raw, printers)` → `checking` com pedido de `/server/info` ou erro de inválido/duplicado sem pedido, `acceptCheck` → `saving` (com `name` vazio, pedido de `hostname` antes) ou `unreachable` com motivo, `addAnyway` → `saving`); nome vazio → `hostname`, senão host do endereço; "nunca lança"

### Implementation for User Story 2

- [ ] T014 [US2] Em `Model.js`: `parseMoonrakerCheck`, `emptyForm`, `submitForm`, `acceptCheck`, `acceptFormHostname`, `addAnyway`; exportar; T013 passa
- [ ] T015 [US2] Em `BarWidget.qml`: processos da conferência (`/server/info`, `/printer/info`) com o componente da T010; ao chegar em `saving`, `savePrinters` com `addPrinterToList`
- [ ] T016 [US2] Em `Panel.qml`: "Add by address" com dois `TextField` (`qs.Ui`) no padrão do painel de rede do Omarchy (foco ao abrir, Enter no Address passa ao Name, Enter no Name confirma, Escape sai do campo e devolve o foco ao `PanelKeyCatcher` sem fechar o painel; as teclas digitadas não chegam aos atalhos do painel); `Add`, "Checking …", motivo + `Add anyway`
- [ ] T017 [US2] Validar com o usuário (quickstart §3.3–3.6): `biqu.local` → já cadastrada; `a b` → inválido; `192.168.0.99` → motivo + Add anyway, Back sem adicionar; recadastrar a Biqu por endereço como "Biqu B1" e conferir o `shell.json` igual ao backup

---

## Phase 5: User Story 3 - Remover uma impressora (Priority: P3)

**Goal**: remover a selecionada com confirmação.

**Independent Test**: remover a Biqu, desistir não muda nada; confirmar tira do painel, da barra e
da configuração.

- [ ] T018 [US3] Em `tests/printer-setup.test.js`: `buildSetupModel(...).removeLabel` = `"Remove Biqu B1"` com a Biqu selecionada e `""` sem seleção; `confirmMessage("removePrinter", "Biqu B1")` = `"Remove Biqu B1 from the list? You can add it again later."` e `confirmLabel("removePrinter")` = `"Remove"`
- [ ] T019 [US3] Em `Model.js`, os textos de remoção em `confirmMessage`/`confirmLabel`; em `Panel.qml`, `Remove <nome>` na tela de cadastro com o `ConfirmDialog` existente ("Back" selecionado; fechamento automático se a impressora sumir ou mudar a seleção); confirmar → `removePrinterFromList` com a `order` da selecionada e `savePrinters(list, "")`; última removida → painel vazio na tela de cadastro; T018 passa
- [ ] T020 [US3] Validar com o usuário (quickstart §3.1 e §3.8), com backup: remover a Biqu (desistir antes, depois confirmar); `omarchy-restart-shell` e a lista continua igual (SC-004); remover a última só se o usuário quiser

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T021 [P] Atualizar `README.md`: cadastro pelo painel (Printers…, Search network, Add by address, Remove), o que a busca faz (anúncio + verificação da rede local na porta 7125, só GET, só a pedido, sem VPN, até 30 s), o nome que a impressora adicionada recebe, como ligar o anúncio no Moonraker (`[zeroconf]`) para ela aparecer pelo anúncio, binários novos (`omarchy-shell`, `ip`, `avahi-browse`/`avahi-resolve` opcionais) na tabela de dependências com o que cada ausência desliga, e tirar o comando para copiar
- [ ] T022 [P] Em `manifest.json`, `version` de `0.8.0` para `0.9.0`
- [ ] T023 [P] Auditorias: Princípio VIII (nenhuma cor/tamanho fixo novo), I (nenhum symlink, manifesto válido) e III (binários novos só os do README; nenhuma escrita de arquivo pelo plugin; a busca só com GET)
- [ ] T024 Ciclo de vida ([quickstart §4](./quickstart.md#4-ciclo-de-vida-princípio-vi)): clique e Escape (fora e dentro de um campo de texto) pelo usuário; summon/hide, disable/enable (restaurar as impressoras depois do enable) e reinício do shell por comando, sem `curl`/`avahi`/`omarchy-shell` sobrando; `remove`/reinstalar só depois do push, com cópia da pasta e `.specify/feature.json` restaurado
- [ ] T025 Registrar em `specs/009-printer-setup/hardware-test.md` (Princípio VII): tempo da busca real, o que achou, a entrada do OmaKlippy no `shell.json` antes e depois de cada gravação, versões
- [ ] T026 Marcar a fatia como concluída no `spec.md` só depois de T024 (com remove/reinstalar) e T025

---

## Dependencies & Execution Order

- **Setup (Phase 1)**: T001 e T002 em paralelo.
- **Foundational (Phase 2)**: T003 → T004 → T005 → T006; bloqueia as histórias.
- **US1**: T007–T008 → T009 → T010 → T011 → T012.
- **US2**: depende da Phase 2 e do componente de processo da T010; T013 → T014 → T015 → T016 → T017.
- **US3**: depende só da Phase 2; T018 → T019 → T020. Pode vir antes da US2 se for mais prático
  para o teste ao vivo (remover a Biqu antes de readicioná-la).
- **Polish**: T021–T023 depois das histórias; T024–T026 no fim.

```text
Setup ─ Foundational ─┬─ US1 ─ US2 ─┬─ Polish
                      └─ US3 ───────┘
```

### Parallel Opportunities

- Setup: T001 e T002.
- Polish: T021, T022 e T023.
- US3 em paralelo com a US1 em outra sessão (só `Panel.qml` em comum; na prática, em sequência).

## Parallel Example: Polish

```bash
Task: "T021 README"
Task: "T022 manifest 0.9.0"
Task: "T023 Auditorias"
```

## Implementation Strategy

1. Setup e Foundational (gravação + tela de cadastro).
2. US1: busca e adicionar (MVP) → validar na rede real (T012).
3. US3: remover (útil para o teste da US1/US2).
4. US2: adicionar pelo endereço, que também restaura o nome "Biqu B1".
5. Polish → README, versão, auditorias, ciclo de vida, registro. **A fatia só está concluída
   depois de T024 e T025.**

## Notes

- Os testes devem falhar antes da implementação correspondente.
- Commits só quando o usuário pedir; push só quando ele disser "push".
- Fora de escopo (spec): renomear, editar endereço/`webUrl`, reordenar, IPv6, redes maiores que /24,
  ligar o anúncio na impressora, chave de API.
