# Research: Notificações de impressão no desktop

Decisões técnicas da fatia 004. A spec não tem `NEEDS CLARIFICATION`: as regras de pausa, contato
perdido, erro sem impressão, permanência na tela e proteção das ações do painel estão nas
Clarifications. Os itens abaixo resolvem o que ficou para o plano.

## R1. Como enviar a notificação

- **Decision**: `notify-send` (libnotify 0.8.8) num `Process` do Quickshell, argv sem shell:
  `["notify-send", "-a", "OmaKlippy", "-u", <urgency>, "-i", "printer", <title>, <body>]`, com
  guarda de 10 s (`NOTIFY_TIMEOUT_SEC`), no mesmo esqueleto do launcher da 003. Sem `-t`.
- **Rationale**:
  - O servidor de notificações é o próprio shell do Omarchy
    (`/usr/share/omarchy/shell/plugins/notifications/Service.qml`); `notify-send` é o cliente
    padrão e já está instalado (`libnotify`, dependência do Omarchy).
  - `durationFor` do serviço: `Critical` → 0 (fica até ser fechada); `Normal` → entre 8 e 30 s,
    ignorando `--expire-time 0`. Então a permanência (FR-007a) é controlada só pela urgência:
    falha e contato perdido = `critical`; conclusão e pausa = `normal`. Isso obrigou a emenda do
    FR-007 (falha e contato perdido com a mesma urgência), registrada na spec.
  - "Não perturbe": o serviço só deixa passar `critical` quando o `app_name` é `notify-send`.
    Com `-a OmaKlippy` as notificações vão para o histórico durante o "Não perturbe". Isso respeita a
    escolha do usuário; fica documentado no README e nas Assumptions da spec.
- **Resultado**: não iniciou → `notify-send not found`; saída ≠ 0 → `notification service
  unavailable (exit N)`; guarda → `no answer from notify-send`. Qualquer um marca as notificações
  como indisponíveis (FR-012) até o próximo envio com sucesso.
- **Alternatives considered**: DBus direto pelo Quickshell (não há API de cliente de
  notificações exposta a plugins); `gdbus call` (binário a mais, sem vantagem); desenhar um popup
  próprio (fere a Assumption de usar o serviço do desktop e o Princípio VIII).

## R2. Uma notificação por evento com várias barras (FR-009)

- **Decision**: estado compartilhado num `Shared.js` com `.pragma library` (uma instância por
  motor QML), usado só como recipiente mutável: registro das instâncias do widget, proteções das
  ações do painel e disponibilidade das notificações. Toda regra é função pura em `Model.js`.
  - Cada instância se registra em `Component.onCompleted` e sai em `Component.onDestruction`;
    **líder** = a primeira registrada ainda viva. Só o líder envia notificações.
  - **Toda** instância mantém o próprio acompanhamento (`watch`) de cada impressora com as próprias
    leituras; assim, se o monitor do líder sai, a próxima assume sem começar do zero.
- **Verificação empírica (2026-09-30, dois monitores)**: um `Shared.js` provisório mostrou as duas
  instâncias com o mesmo objeto (`created` igual, ids `[1,2]`). No hot reload, as antigas saíram
  (`del 1`, `del 2`) antes de as novas entrarem (`add 3`, `add 4`) com o **mesmo** objeto (a
  biblioteca sobrevive ao hot reload; mudanças no próprio `Shared.js` só valem depois de
  `omarchy-restart-shell`). O teste foi revertido. Precedente no shell:
  `services/AuthServiceStore.js`.
- **Alternatives considered**:
  - `kind: "service"` (singleton oficial): `serviceFor` do facade só devolve o serviço do próprio
    plugin sob a barra nativa (nulo sob barra substituta), um serviço `keepLoaded` só recarrega
    com o shell reiniciado, e não se sabe como `omarchy plugin enable/disable` trata um manifesto
    com dois kinds. Mais risco pelo mesmo resultado. Fica registrado para uma futura unificação do
    polling ([research R10 da 001](../001-printer-status-bar/research.md#r10-várias-instâncias-e-vários-monitores)).
  - Mover o polling para um único lugar: resolveria de vez, mas reescreve 001–003; fora de escopo.
  - Arquivo de trava em `/tmp`: fere o Princípio III (arquivos fora da pasta).

## R3. Detecção de eventos (FR-001 a FR-004, FR-008, FR-010, FR-014)

- **Decision**: função pura `observe(watch, status, protectedNow)` chamada a cada leitura aceita de
  uma impressora. O `watch` guarda o último estado **com resposta** (estado, `printState` cru,
  arquivo, se havia aquecedor ligado), quantas leituras seguidas ficaram sem resposta e se o
  contato perdido já foi avisado.
  - Primeira leitura com resposta semeia o `watch` e não gera evento (FR-008); leituras sem
    resposta antes disso também não.
  - Conclusão: último estado imprimindo/pausada e `printState === "complete"`.
  - Falha: último estado imprimindo/pausada e estado `error`; ou último estado ocioso com
    aquecedor ligado (alvo > 0 no bico ou na mesa) e estado `error` (Clarifications).
  - Pausa: último estado imprimindo e estado pausada.
  - Contato perdido: último estado com resposta imprimindo/pausada e 3 leituras seguidas sem
    resposta (`NOTIFY_LOST_AFTER = 3`), uma vez; zera quando a impressora responde.
  - Cancelamento (`cancelled`, ou pausada → `standby` na Voron) não casa com nenhuma regra.
- **Dados que faltavam em `PrinterStatus`**: `printState` cru (`deriveState` junta `complete` e
  `cancelled` em `idle`) e `requestedAt` (instante em que a consulta saiu; `planDispatch` ganha o
  parâmetro `now`). As metas dos aquecedores já existem (`nozzle.target`, `bed.target`).
- **Por que por leitura e não por ciclo**: as leituras extras depois de um comando (follow-up da
  002) também contam; o limite de 3 é "3 leituras", como na spec.

## R4. Proteção das ações do painel (FR-005)

- **Decision**: no `Shared.js`, `protections[key] = { pending, answeredAt }`, mantido por funções
  puras: `protectStart` quando qualquer instância envia Pause/Resume/Cancel/Emergency stop,
  `protectFinish(now)` quando o comando responde (sucesso, falha ou guarda). Enquanto existe
  proteção para a impressora, **todos** os eventos dela são descartados (um pouco mais amplo que
  "o efeito da ação", aceito porque a janela é curta). A proteção termina na primeira leitura com
  `pending === 0` e `requestedAt >= answeredAt`; os eventos dessa leitura ainda são descartados
  (é "a primeira leitura depois da resposta", Clarifications).
- **Rationale**: a instância que envia o comando pode não ser o líder (painel no outro monitor);
  o estado compartilhado resolve. `requestedAt` evita que uma consulta em voo desde antes da
  resposta encerre a proteção cedo demais.
- **Resume** também protege: evita que uma pausa lida de uma consulta antiga vire aviso.

## R5. Configuração (FR-011)

- **Decision**: quatro chaves no `schema` do manifesto, tipo `enum` com `["On", "Off"]` e padrão
  `"On"` (padrão do plugin `agents` do shell; não existe tipo booleano):
  `notifyComplete`, `notifyFailed`, `notifyPaused`, `notifyLostContact`. `readSettings` aceita
  também `true`/`false` (edição à mão). Com várias barras, vale a configuração do líder (as
  instâncias da mesma entrada têm a mesma configuração).
- **Rationale**: ausentes → ligadas; configurações antigas continuam válidas (SC-005 da 003 e
  FR-011).

## R6. Aviso de indisponibilidade (FR-012)

- **Decision**: `Shared.js` guarda `{ available, message }` das notificações. O líder roda
  `notify-send --version` ao assumir (só se algum tipo estiver ligado), o que detecta o binário
  ausente, e cada envio atualiza o estado. O painel mostra `Notifications unavailable: <motivo>`
  (linha discreta acima de "updated … ago") quando `available === false`. Como variáveis de
  biblioteca não são reativas, a instância copia o estado para uma propriedade em
  `panelOpened()` e no timer de 15 s que já existe.
- **Limite conhecido**: um servidor de notificações ausente só é percebido no primeiro envio que
  falha (não há sondagem sem enviar algo).

## R7. Validação

- **Testes puros**: `observe` (cada regra, semeadura, repetição, cancelamento da Voron, contato
  perdido com 1–2 e 3+ leituras, aquecendo vs frio), registro/líder, proteções,
  `buildNotification`, `parseNotifyResult`, `readSettings` com as chaves novas, `printState` e
  `requestedAt`. Testes antigos que comparam `initialStatus`/`planDispatch`/`applyReading` inteiros
  mudam de propósito (campos novos).
- **Ao vivo**: Moonraker falso (conclusão, erro, pausa, queda do servidor por mais e por menos de
  3 ciclos, ocioso aquecendo vs frio) com dois monitores; contagem pelas notificações registradas
  no histórico do serviço, não a olho.
- **Hardware**: o **usuário** faz uma impressão curta até o fim (SC-001) e pausa pelo Mainsail
  (SC-005); nunca provocar erro ou parada de emergência numa impressora real.
