# Implementation Plan: Status em tempo real pela conexão contínua com o Moonraker

**Branch**: `main` (sem branch dedicada; o script informou `010-realtime-status`) | **Date**: 2026-10-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/010-realtime-status/spec.md`

## Summary

1. **Conexão**: cada barra abre, por impressora, um `WebSocket` (`QtWebSockets`) em
   `ws(s)://…/websocket` e se inscreve nos mesmos objetos da consulta de hoje. A resposta e as
   atualizações (só o que mudou, ~4 por segundo) são mescladas num buffer e entregues ao motor de
   status no máximo 1 vez por segundo, ou na hora quando muda o estado.
2. **Alternativa**: sem inscrição ativa (módulo ausente, recusa, queda, Klipper desconectado), a
   impressora fica na consulta periódica de hoje, que sai na hora quando a conexão cai. Queda
   percebida por `ping` a cada 5 s e 10 s sem quadros; reconexão com espera de 2 a 30 s.
3. **Motor**: `planDispatch` pula impressoras ao vivo; a estimativa do fatiador e o nome do serviço
   do Klipper rodam também depois das entregas ao vivo; depois de um comando, sem consulta extra
   quando ao vivo. Painel: `live` na linha de atualização e aviso se o módulo faltar.

Detalhes em [research.md](./research.md).

## Technical Context

**Language/Version**: QML (Qt 6.11, Quickshell 0.3.1 do `omarchy-shell`, omarchy 4.0.4-1) e
JavaScript ES5+ em `Model.js`

**Primary Dependencies**: `qs.Ui`, `qs.Commons`, `Quickshell.Io`; novo e opcional, o módulo QML
`QtWebSockets` (`qt6-websockets` 6.11.2), isolado em `LiveConnection.qml`; binários de hoje
(`curl` etc.), nenhum novo

**Storage**: nada novo (estado em memória por instância)

**Testing**: `node --test tests/` (novo `tests/live.test.js`); fixtures `ws-*` (duas reais da Voron,
cinco sintéticas); `omarchy plugin validate`; `qmllint` (com `LiveConnection.qml`); servidor falso
com `WebSocketServer` num `qml` do scratchpad para queda silenciosa e erro de inscrição; teste ao
vivo com o usuário (Voron e Biqu)

**Target Platform**: Omarchy Quattro (Arch Linux + Hyprland), `omarchy-shell`

**Project Type**: plugin de desktop (bar-widget) de pasta única

**Performance Goals**: mudança de estado na barra em ≤2 s; 0 consultas periódicas com as
impressoras ao vivo; no máximo 1 entrega por segundo por impressora ao motor

**Constraints**: só leitura e inscrição pela conexão; comandos continuam por HTTP; nenhuma cor ou
dimensão fixa; nenhum processo novo

**Scale/Scope**: até algumas impressoras por barra; ~5 mensagens por segundo por conexão

Nenhum item ficou como NEEDS CLARIFICATION.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Status | Como o plano atende |
|-----------|--------|---------------------|
| I. Runtime do Omarchy | ✅ | Nada de processo, daemon ou kind novo; `LiveConnection.qml` é mais um arquivo da pasta, carregado pelo widget; sem symlinks. |
| II. Shell nunca bloqueia | ✅ | `WebSocket` assíncrono; queda detectada por `ping` e 10 s sem quadros; entregas coalescidas (≤1/s); `proc_stat` descartado sem parse. |
| III. Mínimo privilégio | ✅ | Nenhum binário novo; só inscrição de leitura pela conexão; nenhuma escrita de arquivo; README atualizado. |
| IV. Degradação graciosa | ✅ | Módulo ausente: `Loader` em erro, só a conexão contínua some, aviso visível; recusa/queda: consulta periódica de hoje. |
| V. Lógica pura testável | ✅ | URL, mensagens, mescla, urgência, máquina da conexão, entrada/saída do ao vivo e textos em `Model.js`, com fixtures. |
| VI. Validação obrigatória | ✅ | Gates por tarefa (com `LiveConnection.qml` no `qmllint`); ciclo de vida com conferência de conexões abertas. |
| VII. Hardware real | ✅ | Voron e Biqu: latência, contagem de consultas, reinício do Moonraker e do Klipper pelo usuário. |
| VIII. Visual nativo | ✅ | Só dois textos novos com os estilos que já existem. |

**Resultado pré-pesquisa**: aprovado, sem violações.

**Re-check pós-design (Phase 1)**: aprovado. Pontos de atenção para as tarefas:
- `planEstimate`/`planServiceInfo` hoje só rodam dentro de `dispatch()`: precisam rodar também
  depois das entregas ao vivo, ou a estimativa e o "Restart Klipper" quebram com a impressora ao
  vivo;
- a proteção de ações do painel (004) depende de `requestedAt`: a entrada ao vivo marca o momento
  do recebimento;
- o FR-005 e o FR-010 da spec foram ajustados na pesquisa (queda em 10 s; "Printer not responding"
  até 10 s mais tarde com a conexão de pé);
- reiniciar o shell logo depois de criar `LiveConnection.qml` (cache de "arquivo não encontrado").

## Project Structure

### Documentation (this feature)

```text
specs/010-realtime-status/
├── plan.md              # Este arquivo
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── model-api.md       # Model.js
│   ├── connection.md      # mensagens e tempos da conexão
│   └── display.md         # textos no painel
├── checklists/
│   └── requirements.md
├── hardware-test.md     # criado no teste em hardware
└── tasks.md             # Phase 2 (/speckit-tasks; não criado aqui)
```

### Source Code (repository root = pasta do plugin)

```text
io.github.brunorzm.omaklippy/
├── manifest.json        # version 0.10.0
├── Model.js             # + liveUrl, mensagens, mescla, máquina da conexão, acceptLive/leaveLive,
│                        #   readingFromStatus (parseResponse passa a usá-la), textos; planDispatch
│                        #   e detailFor cientes de live
├── LiveConnection.qml   # novo: um WebSocket (import QtWebSockets), sem lógica
├── BarWidget.qml        # + Instantiator de Loaders de LiveConnection, timers de tick e entrega,
│                        #   estimativa/serviço depois das entregas, sem follow-up quando ao vivo
├── Panel.qml            # + aviso liveWarning
├── README.md            # + atualização ao vivo; qt6-websockets opcional
└── tests/
    ├── live.test.js     # novo
    └── fixtures/        # + ws-*.json
```

**Structure Decision**: mesma pasta única; um arquivo QML novo, isolado para o módulo opcional.

## Complexity Tracking

Nenhuma violação da constituição a justificar.
