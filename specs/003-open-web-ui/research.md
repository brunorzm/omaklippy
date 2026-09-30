# Research: Abrir a interface web da impressora pelo painel

Decisões técnicas da fatia 003. A spec não deixou nenhum `NEEDS CLARIFICATION`: a regra do
endereço e a posição do botão foram respondidas nas Clarifications. Os itens abaixo resolvem o
que a spec deixou para o plano: como abrir o navegador, onde guardar o endereço, como o estado se
encaixa no da 002 e como validar.

## R1. Como abrir o navegador

- **Decision**: rodar `omarchy-launch-browser <url>` num `Process` do Quickshell (argv, sem
  shell), criado pelo `BarWidget.qml` e acompanhado como os comandos da 002: `onStarted`,
  `onExited` com o código de saída, `onRunningChanged` sem `started` para "binário não
  encontrado" e um `Timer` de guarda de 10 s (`WEB_LAUNCH_TIMEOUT_SEC`). O processo não usa
  stdout.
- **Rationale**:
  - É o jeito do Omarchy abrir o navegador padrão: lê `xdg-settings`/`xdg-mime`, sobe o
    navegador numa unidade `systemd-run --user` via `uwsm-app` (o navegador não é filho do shell,
    então sobrevive a `omarchy-restart-shell`) e foca a janela do navegador no Hyprland
    (`omarchy-hyprland-focus-app`). O plugin Tailscale de primeira parte do shell faz o mesmo
    (`/usr/share/omarchy/shell/plugins/panels/tailscale/Service.qml`).
  - Um `Process` acompanhado dá o sinal de falha que o FR-012/US3 pedem; `execDetached` não dá
    nenhum.
  - Argv sem shell: a URL vem da configuração do usuário e nunca é interpretada por um shell
    (mesmo cuidado de `Util.execArgv` do shell e do `curl` das fatias anteriores).
- **Limite de detecção (registrado de propósito)**: o script não usa `set -e`, roda
  `systemd-run` sem `--wait` e termina com um `if` cujo foco é `omarchy-hyprland-focus-app … ||
  true`. Por isso ele sai com 0 em praticamente todos os casos: até uma falha do próprio
  `systemd-run` passa, porque o script segue para a linha seguinte. Um navegador que falha depois
  de subir, ou um navegador padrão não configurado, também **não** é detectado. Na prática, o
  plugin detecta duas falhas: launcher ausente e launcher que não termina em 10 s. O caminho
  "saiu com código ≠ 0" fica como defesa (um launcher futuro, ou outro instalado antes no
  `PATH`) e é o que o launcher falso do teste de US3 exercita. Isso é coerente com o FR-010 (o
  plugin não verifica a interface web).
- **Tempo**: o script consulta `$browser_exec --help` de forma síncrona antes de lançar, então
  leva algumas centenas de ms para sair. Por isso o painel fecha na **saída com 0** (FR-011), e
  não no `started`: fechar antes impediria mostrar a falha. Continua dentro do SC-003 (2 s).
- **Alternatives considered**:
  - `Qt.openUrlExternally(url)`: sem binário explícito (usa `xdg-open` por baixo, que também
    teria de ir para o README), devolve só se conseguiu disparar, não foca o navegador no
    Hyprland e ignora a escolha de navegador do Omarchy. Rejeitado.
  - `Quickshell.execDetached` / `Util.execArgv`: não devolvem resultado; US3 ficaria sem sinal.
  - Chamar `xdg-open` direto: mesmo problema de foco e um binário a mais sem vantagem.

## R2. Endereço da interface web

- **Decision**: `normalizePrinters` passa a preencher `webUrl` em cada `PrinterConfig`:
  1. Entrada com o campo `webUrl` (string, não vazia depois de `trim`) → `normalizeAddress(webUrl)`
     como está, **sem** retirar a porta 7125 (o valor explícito vence; FR-006). Inválido → `""`
     (botão escondido só para essa impressora, FR-007).
  2. Sem o campo (ausente, não string ou vazio) → `deriveWebUrl(baseUrl)`: o `baseUrl` sem a
     porta quando ela é `7125`, mantendo esquema, host e caminho (FR-005). `baseUrl` inválido →
     `""`.
- **Rationale**: a regra fica numa função pura com teste de tabela (SC-002). A `key` da impressora
  continua `baseUrl#order`: o novo campo não muda identidade, seleção nem estados já guardados
  (SC-005).
- **Nome do campo**: `webUrl`, no mesmo objeto de `name` e `address`; aceita as mesmas formas do
  `address`. Não entra no `schema` do `manifest.json`, como `printers` (a lista não é editável
  pelos campos simples do schema).
- **Alternatives considered**: descobrir a interface por sondagem de portas ou de `/server/info`
  (fere o FR-010 e o Princípio II sem ganho real para as instalações típicas); campo obrigatório
  (quebraria as configurações existentes, SC-005).

## R3. Estado da abertura e relação com os comandos da 002

- **Decision**: um terceiro slot, `web`, em `PrinterCommands` (ao lado de `busy` e `estop`).
  `planOpenWeb(commands, printer)` recusa só quando `web` já está ocupado ou `webUrl` é `""`;
  ocupa o slot com `seq` novo e limpa `failure` ("até a próxima ação"). `acceptCommandResult`
  passa a reconhecer o `seq` do slot `web` e grava a falha com
  `fill(TEXT.actionFailed, "Open web UI", motivo)`, o mesmo formato da 002.
- **Rationale**:
  - Slot próprio: Open web UI não bloqueia nem é bloqueado por Pause/Resume/Cancel/Emergency stop
    (FR-014); `planCommand` continua olhando só `busy` e `estop`.
  - Com o slot ocupado o botão fica `enabled: false`, sai de `cursorStops` e um segundo clique
    ou Enter não abre de novo (edge case "acionamento duplo").
  - Reusar `failure` faz a mensagem aparecer no lugar das falhas da 002 e sumir nas mesmas
    condições (`clearFailures` na troca de impressora, nova ação).
- **No `BarWidget`**: `openWebUi(key)` planeja e cria o processo; `acceptWebLaunch(key, seq,
  result)` aplica `acceptCommandResult` e, com `ok`, fecha o **próprio** painel se estiver aberto.
  Não chama `requestFollowUp`/`dispatch`: abrir o navegador não muda o estado da impressora. Os
  processos ficam em `requestHolder`, então `stopRequests` e `Component.onDestruction` já os
  alcançam.
- **Alternatives considered**: uma propriedade solta no `BarWidget` (lógica de decisão no QML,
  fere o Princípio V); reusar o slot `busy` (bloquearia Pause durante a abertura, fere FR-014).

## R4. Painel e teclado

- **Decision**: `buildActionsModel` inclui o botão `openWebUi` em `buttons` (assim `showActions`,
  `buttonFor` e `checkConfirm` do `Panel.qml` funcionam sem mudança) e num campo novo `web`.
  `cursorStops` acrescenta `openWebUi` depois de `emergencyStop` (FR-004). No `Panel.qml`, um
  `ActionButton` de largura total depois do e-stop, com o mesmo espaçador `Style.space(12)` que
  separa Cancel do e-stop, acima da linha de falha. `activate("openWebUi")` chama
  `hostWidget.openWebUi(selected.key)` (a chave vai junto, como na 002).
- **Glifo**: `nf-md-open_in_new` (`\u{f03cc}`) da fonte do bar; em andamento, o `busy` girando da
  002.
- **Relação com a 002 (FR-013)**: o estado de erro/offline passa a mostrar a área de ações só com
  Open web UI; a tabela de estados do `display.md` da 002 é substituída pela da 003.

## R5. Validação

- **Testes puros**: `deriveWebUrl` e `webUrl` em `normalizePrinters` por tabela (todas as formas
  de SC-002), `planOpenWeb`, `buildWebLaunchArgs`, `parseWebLaunchResult`,
  `acceptCommandResult` com o slot `web`, `buildActionsModel` e `cursorStops` com o botão, e
  `planCommand` ignorando o slot `web`. Testes da 001/002 que comparam `normalizePrinters` ou o
  `ActionsModel` inteiro precisam do campo novo: é uma atualização esperada, não regressão
  (SC-005 fala de configurações do usuário).
- **Falha ao vivo (US3)**: como o launcher real quase sempre sai com 0 (R1), a falha é simulada.
  **Correção (2026-09-30)**: a suposição abaixo estava errada. O `PATH` conferido era o do
  terminal do assistente; o do processo `quickshell` do shell começa com `/usr/share/omarchy/bin`,
  então um launcher em `~/.local/bin` não o sobrepõe. Ver [hardware-test.md](./hardware-test.md).
  Suposição original: no `PATH` do `omarchy-shell`, `~/.local/bin` vem antes de
  `/usr/share/omarchy/bin` (conferido em `/proc/<pid>/environ`). Um
  `~/.local/bin/omarchy-launch-browser` temporário que sai com 1 simula a falha sem mexer no
  plugin. Fica fora da pasta do plugin, por isso é passo **aprovado pelo usuário**, e o arquivo
  é removido em seguida.
- **Hardware (Princípio VII)**: abrir a interface da Voron e da Biqu pelo painel. Só abre o
  navegador; nenhum comando vai às impressoras. SC-003 medido com um observador de
  `hyprctl clients -j`.
