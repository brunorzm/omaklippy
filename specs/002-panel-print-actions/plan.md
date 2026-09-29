# Implementation Plan: Ações de impressão no painel

**Branch**: `main` (sem branch dedicada; o script informou `002-panel-print-actions`) | **Date**: 2026-09-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/002-panel-print-actions/spec.md`

## Summary

O painel ganha os botões Pause/Resume, Cancel e Emergency stop para a impressora selecionada,
conforme o estado dela. Cancel e Emergency stop pedem confirmação no `ConfirmDialog` nativo, com
"Back" selecionado ao abrir. Cada ação é um `POST` ao Moonraker (`/printer/print/{pause,resume,cancel}`
e `/printer/emergency_stop`), feito com `curl` num `Process` assíncrono criado pelo `BarWidget`.
A conexão usa o timeout da configuração, com tempo total de 60 s e sem reenvio. O estado dos
comandos (em andamento, falha) vive no `BarWidget` por impressora. Pause, Resume e Cancel ocupam uma
vaga e a parada de emergência outra, para que o e-stop continue disponível durante macros longas
(decisão do usuário em 2026-09-29). Ao fim de cada comando, uma consulta imediata, com a marca
`followUp` quando já havia consulta em voo, atualiza o painel em ≤ 2 s. Disponibilidade, regras
de envio, parse da resposta, modelo dos botões, textos de confirmação e paradas do cursor ficam
em `Model.js`, testados com `node --test`. Detalhes em [research.md](./research.md).

## Technical Context

**Language/Version**: QML (Qt 6, Quickshell do `omarchy-shell`, omarchy 4.0.4-1) e JavaScript
ES5+ em `Model.js` (motor QML e Node)

**Primary Dependencies**: `qs.Ui` (os da fatia 001 + `Button`, `ConfirmDialog`), `qs.Commons`
(`Style`, `Color`, `Util`), `Quickshell.Io` (`Process`, `StdioCollector`); binário `curl`
(já exigido pela fatia 001)

**Storage**: nenhum. Comandos, falhas, confirmação e cursor só em memória; nada vai para
`shell.json`

**Testing**: `node --test tests/` (novo `tests/actions.test.js`, casos novos em
`engine.test.js` e `panel.test.js`); `omarchy plugin validate`; `qmllint -I "$OMARCHY_PATH/shell"`;
Moonraker falso local para falhas; teste em hardware acionado pelo usuário
([quickstart.md](./quickstart.md))

**Target Platform**: Omarchy Quattro (Arch Linux + Hyprland), `omarchy-shell`

**Project Type**: plugin de desktop (bar-widget) de pasta única

**Performance Goals**: mudança de estado no painel em ≤ 2 s depois da resposta ao comando
em rede local com a impressora respondendo normalmente (SC-002, emendado em 2026-09-29). Com uma consulta já em voo, a nova só sai quando ela volta: o pior caso é 2 ×
`timeoutSec` (6 s no padrão, só com a impressora lenta); em rede local cada consulta leva
bem menos de 1 s, e o teste em hardware mede o valor real; nenhum trabalho síncrono na thread da UI durante comandos de até 60 s (SC-006)

**Constraints**: no máximo um comando Pause/Resume/Cancel e uma parada por impressora por
instância; nunca duas consultas em voo para a mesma impressora; nenhum reenvio automático;
timeout de conexão = `timeoutSec`, total = 60 s (> máximo de 30 s da consulta); sem cores ou
dimensões fixas

**Scale/Scope**: 1 a ~5 impressoras, 1 instância por monitor; 4 ações

Nenhum item ficou como NEEDS CLARIFICATION. A única decisão em aberto, o e-stop durante outro
comando, foi respondida pelo usuário e registrada na spec (Clarifications e FR-012).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Status | Como o plano atende |
|-----------|--------|---------------------|
| I. Runtime do Omarchy | ✅ | Nenhum kind ou entry point novo; tudo dentro de `BarWidget.qml`/`Panel.qml` com o mesmo `moduleName`. Sem processo Quickshell, daemon ou serviço. Nenhuma configuração nova. Sem symlinks. |
| II. Shell nunca bloqueia | ✅ | Cada comando é um `Process` assíncrono com `--connect-timeout`, `--max-time 60` e `Timer` de guarda de 61 s. Resultado único por `seq`. A atualização imediata respeita uma consulta em voo por impressora (`followUp`). |
| III. Mínimo privilégio | ✅ | Nenhum binário novo: só `curl`, já documentado. O README passa a dizer que o plugin também envia comandos (`POST`). Nada é gravado fora da pasta. O Moonraker falso de validação fica no scratchpad, fora do plugin. |
| IV. Degradação graciosa | ✅ | Sem dependência opcional nova. Falha de comando vira mensagem visível no painel (inclusive com a impressora offline), e o resto do painel continua funcionando. `curl` ausente aparece como "Pause failed: curl not found". |
| V. Lógica pura testável | ✅ | Disponibilidade, regras de envio, slots, parse, modelo dos botões, textos de confirmação, `followUp` e cursor em `Model.js` ([contracts/model-api.md](./contracts/model-api.md)), cada um com teste. O QML só cria processos, repassa teclas e desenha. `readTransport` é extraída de `parseResponse` com os testes da 001 intactos. |
| VI. Validação obrigatória | ✅ | Gates por tarefa no quickstart §1; checklist de ciclo de vida da 001 mais os passos de confirmação e comando em andamento (§4). |
| VII. Hardware real | ✅ | Roteiro na Voron (§6), com ações acionadas pelo usuário e registro em `hardware-test.md`. |
| VIII. Visual nativo | ✅ | `Button` e `ConfirmDialog` de `qs.Ui`; e-stop com `bar.urgent`; espaçamentos por `Style.space()`/`Style.spacing`, fontes por `Style.font`. Nenhuma cor nova; o estado desabilitado usa opacidade relativa, como a barra pausada da 001. |

**Resultado pré-pesquisa**: aprovado, sem violações.

**Re-check pós-design (Phase 1)**: aprovado. O data model mantém tudo em memória, os contratos
não introduzem binário, arquivo ou configuração novos, e a exceção do e-stop foi decidida pelo
usuário e registrada na spec, sem conflito com a constituição. Ponto de atenção para a
implementação: o `ConfirmDialog` precisa de altura suficiente dentro do painel (estado ocioso é o
menor); conferir visualmente e, se preciso, garantir altura mínima por `fittedContentHeight`.

## Project Structure

### Documentation (this feature)

```text
specs/002-panel-print-actions/
├── plan.md              # Este arquivo
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1 (validação, Moonraker falso, teste em hardware)
├── contracts/
│   ├── model-api.md       # Funções novas/alteradas de Model.js
│   ├── moonraker.md       # Os quatro POST, respostas e fixtures
│   └── display.md         # Botões, confirmação, teclado
├── checklists/
│   └── requirements.md
├── hardware-test.md     # criado no teste em hardware
└── tasks.md             # Phase 2 (/speckit-tasks; não criado aqui)
```

### Source Code (repository root = pasta do plugin)

```text
io.github.brunorzm.omaklippy/
├── manifest.json        # version 0.2.0
├── Model.js             # + ACTIONS, availableActions, buildActionArgs, readTransport,
│                        #   parseActionResponse, planCommand, acceptCommandResult,
│                        #   clearFailures, reconcileCommands, requestFollowUp,
│                        #   buildActionsModel, confirmMessage, confirmLabel,
│                        #   cursorStops, stepCursor; planDispatch(onlyKey),
│                        #   buildPanelModel(commandsByKey), TEXT novos, fill com %2
├── BarWidget.qml        # + commands, runAction(), commandComponent (Process + guarda),
│                        #   followUp após acceptResult, clearFailures em selectPrinter,
│                        #   reconcileCommands em syncConfig, runAction(key, action),
│                        #   comandos parados em Component.onDestruction
├── Panel.qml            # + área de ações (Button), ConfirmDialog, cursorStop com
│                        #   cursorStops/stepCursor, roteamento de teclas do diálogo
├── README.md            # + ações, confirmação, timeout de 60 s, "o plugin envia comandos"
└── tests/
    ├── actions.test.js  # novo: disponibilidade, args, parse, slots, modelo, confirmação
    ├── engine.test.js   # + followUp / onlyKey
    ├── panel.test.js    # + actions no PanelModel, cursorStops, stepCursor
    └── fixtures/        # + action-ok.synthetic, action-refused.synthetic,
                         #   action-klippy-disconnected.synthetic; action-ok (real, hardware)
```

**Structure Decision**: mesma pasta única da fatia 001. Nenhum arquivo QML novo: os botões e o
diálogo ficam no `Panel.qml`, e os processos de comando no `BarWidget.qml`, ao lado dos de
consulta, porque o painel pode fechar com um comando em andamento.

## Complexity Tracking

Nenhuma violação da constituição a justificar.
