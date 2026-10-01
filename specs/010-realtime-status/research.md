# Research: Status em tempo real pela conexão contínua com o Moonraker

Decisões técnicas da fatia 010. As decisões de escopo (comandos por HTTP, uma conexão por barra,
consulta periódica como alternativa) foram tomadas pelo usuário antes da spec.

Medições de 2026-10-01, só com leitura (`server.info` e `printer.objects.subscribe`), por um script
`qml` no scratchpad, fora do plugin. Nota: o `qml` só mostra o log com
`QT_FORCE_STDERR_LOGGING=1` (sem terminal, o Qt manda o log para o journal).

## R1. Componente e detecção da ausência (FR-016, Princípio IV)

- **Decision**: o `WebSocket` do módulo QML `QtWebSockets` (pacote `qt6-websockets`, 6.11.2 aqui),
  num arquivo próprio `LiveConnection.qml` carregado por `Loader`. Se o módulo faltar, o `Loader`
  fica em `Loader.Error` (testado com um módulo inexistente: `module "…" is not installed`, status
  Error, sem afetar o resto); o widget marca `liveUnavailable` e o painel mostra o aviso.
- **Rationale**: o `import` de um módulo ausente quebraria o `BarWidget.qml` inteiro; isolado num
  arquivo carregado por `Loader`, só a conexão contínua some (Princípio IV).
- **Atenção no shell**: o hot reload guarda "arquivo não encontrado" para arquivos criados depois
  da primeira carga (memória do projeto): reiniciar o shell logo depois de criar o arquivo e
  conferir no shell real que o `import QtWebSockets` resolve.
- **Alternatives considered**: `Qt.createQmlObject` com `try/catch` (texto QML dentro de JS, pior de
  ler e de testar); um processo externo (`websocat`): dependência nova e um processo por impressora.

## R2. Endereço e autenticação (FR-001, Assumptions)

- **Decision**: `http(s)://host[:port][/path]` → `ws(s)://host[:port][/path]/websocket`.
- **Medido**: `ws://voron.local:7125/websocket`, `ws://biqu.local:7125/websocket` e, pelo nginx do
  Mainsail na porta 80, `ws://voron.local/websocket` e `ws://biqu.local/websocket`: as quatro
  abrem sem chave (os `trusted_clients` de hoje valem), `server.info` responde (`klippy_state`
  `ready`; Moonraker v0.11.0 na Voron, v0.10.0 na Biqu, API 1.5.0), `pong` em 9–15 ms.
- **Recusa** (computador não autorizado, porta errada): a conexão falha e a impressora fica na
  consulta periódica, que mostra o motivo de hoje ("unauthorized …"): nenhum texto novo.

## R3. Mensagens (FR-001, FR-003, FR-015)

- **Decision**: ao abrir, um pedido `printer.objects.subscribe` (`id` crescente) com os mesmos
  objetos da consulta de hoje (`webhooks`, `print_stats`, `virtual_sdcard`, `display_status`,
  `extruder` e `heater_bed` com `temperature,target`). A resposta (`result.status`) tem o mesmo
  formato do `result.status` da consulta HTTP (fixture `ws-subscribe-voron`): vira o status
  completo. Depois chegam `notify_status_update` com `params[0]` = só os campos que mudaram
  (fixture `ws-update-voron`), mesclados no status guardado.
- **Medido**: com as impressoras paradas, um `notify_status_update` a cada ~250 ms (as temperaturas
  oscilam no centésimo) e um `notify_proc_stat_update` por segundo (~1–2 kB, estatísticas do
  computador da impressora, não usadas). Cada conexão recebe ~5 mensagens por segundo.
- **Mensagens ignoradas**: `notify_proc_stat_update` é descartada pelo começo do texto, sem
  `JSON.parse`; qualquer outro método desconhecido é ignorado depois do parse.
- **Nada é enviado** além da inscrição, do `ping` do protocolo e de uma nova inscrição depois de o
  Klipper voltar (FR-015).

## R4. Coalescer as atualizações (FR-003, FR-014)

- **Decision**: cada mensagem é mesclada num buffer por impressora (`mergeStatus`, puro); o buffer
  vira leitura e entra em `statuses` no máximo uma vez por segundo (timer de 1 s), ou na hora
  quando a mudança toca `webhooks` ou `print_stats.state` (`isUrgentDiff`, puro).
- **Rationale**: cada troca de `statuses` reavalia o modelo do painel, o ícone e as notificações; 4
  por segundo por impressora e por barra é trabalho à toa (Princípio II). Mudanças de estado
  continuam na hora; temperatura e progresso a cada 1 s cabem nos 2 s do FR-003.

## R5. Klipper desconectado e reinícios (FR-009, fatias 007 e 008)

- **Decision**: "ao vivo" é **inscrição ativa**, nada menos. Em `notify_klippy_disconnected`, e
  quando a inscrição responde com erro (fixture `ws-subscribe-error.synthetic`, 503 "Klippy Host
  not connected"), a impressora volta para a consulta periódica: as respostas 503 dela mantêm o
  `klippyDownSince` e o "Restart Klipper" da 008 exatamente como hoje. A conexão continua aberta; em
  `notify_klippy_ready`, uma nova inscrição (sempre, sem supor que o Moonraker refaz a dele) traz a
  impressora de volta ao vivo.
- **Shutdown/erro do Klipper** (007): o Klipper continua conectado ao Moonraker, a inscrição segue
  e `webhooks.state` chega como `shutdown`/`error`: o "Restart firmware" aparece pelas regras de hoje.
- Os notify_klippy_* não foram observados ao vivo (exigem parar o Klipper; o usuário faz isso no
  teste em hardware). Fixtures sintéticas pela documentação do Moonraker.

## R6. Conexão morta e reconexão (FR-005, FR-006, FR-010)

- **Decision**: `ping` do protocolo a cada 5 s; a conexão é dada como morta quando passam **10 s sem
  nenhum quadro** (mensagem ou `pong`; com as atualizações a ~4 por segundo, isso só acontece com a
  conexão de fato parada). Morta ou fechada: a impressora volta à consulta periódica **na hora**
  (sem esperar um intervalo) e a reconexão espera 2, 4, 8, 16 e depois 30 s entre tentativas,
  voltando a 2 s quando uma inscrição dá certo.
- **"Printer not responding"** (004): conta as respostas perdidas da consulta periódica, como hoje.
  Com a conexão contínua de pé, a queda leva até 10 s para ser percebida e depois a primeira
  consulta sai na hora: o aviso sai até ~10 s depois do que sairia hoje. Registrado no FR-010.
- **Rationale**: o `ping` cobre a conexão silenciosamente morta (suspensão do computador, roteador);
  a espera crescente evita bater numa impressora desligada (que fica, de todo jeito, na consulta
  periódica, já com timeout).

## R7. Integração com o motor de hoje (FR-002, FR-008, FR-009)

- **Leitura a partir do status**: `parseResponse` passa a usar uma `readingFromStatus(status)` (a
  parte que lê `result.status`); a leitura ao vivo usa a mesma função com `httpStatus: 200` e
  `reachable: true` (`applyReading` só marca `lastSeenAt` com `httpStatus > 0` e zera o
  `klippyDownSince` com qualquer código que não seja 503).
- **`acceptLive(statuses, key, reading, now)`**: aplica a leitura sem `pending`/`seq` e marca
  `live: true` e `requestedAt = now` no status, para a proteção de ações do painel (004) ser
  liberada pela primeira atualização depois da resposta do comando, como hoje pela primeira
  consulta.
- **`planDispatch`** pula impressoras com `live: true` (FR-002). A estimativa do fatiador
  (`planEstimate`) e o nome do serviço do Klipper (`planServiceInfo`) rodam também depois de cada
  entrada ao vivo, porque hoje só rodam dentro do `dispatch`.
- **Depois de um comando** (`acceptCommand`): com a impressora ao vivo, sem `requestFollowUp` nem
  `dispatch(key)` (FR-008).
- **Testes que mudam**: nenhum; os de `planDispatch` não têm `live` no status.

## R8. Ciclo de vida das conexões (FR-012, FR-013)

- **Decision**: um `Instantiator` sobre `config.printers` (com endereço válido) cria um `Loader`
  de `LiveConnection.qml` por impressora, num lugar próprio (fora do `requestHolder`, que a troca de
  configuração limpa). Fechar: `active: false` no `WebSocket` e destruir o item ao sair a impressora,
  ao destruir o widget e ao desligar o plugin. Uma conexão por barra (FR-012): cada instância do
  widget tem o seu `Instantiator`.

## R9. Binários e dependências (Princípio III)

| Componente | Pacote | Obrigatório | Ausente |
|------------|--------|-------------|---------|
| QtWebSockets (módulo QML) | `qt6-websockets` | não | só a consulta periódica, com o aviso "Live updates unavailable: install qt6-websockets" |

Nenhum binário externo novo; nenhuma escrita de arquivo.
