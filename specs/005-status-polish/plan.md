# Implementation Plan: Polimento do status (mensagem, tempo restante, pausa no ícone)

**Branch**: `main` (sem branch dedicada; o script informou `005-status-polish`) | **Date**: 2026-09-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/005-status-polish/spec.md`

## Summary

Três melhorias de leitura, sem comandos à impressora:

1. A mensagem que a impressora exibe (`display_status.message`, já presente na consulta de status)
   aparece no painel, abaixo do progresso, só com a impressora imprimindo ou pausada.
2. O tempo restante passa a usar a estimativa do fatiador, buscada uma vez por impressão por um
   `GET /server/files/metadata` (mesmo `curl` e timeout das consultas), guardada no status. O
   valor mostrado combina a estimativa do fatiador (duração prevista menos o tempo já impresso) com
   a estimativa pelo progresso de hoje, com peso igual ao progresso, sem saltos; se o fatiador
   errar para menos, vale só a do progresso; nunca negativo nem zero.
3. O ícone da barra mostra duas barrinhas de pausa no canto do selo de erro quando pausado.

Regras em `Model.js`, testadas com `node --test`; fixtures reais de metadados já capturadas da
Voron. Detalhes em [research.md](./research.md).

## Technical Context

**Language/Version**: QML (Qt 6, Quickshell do `omarchy-shell`, omarchy 4.0.4-1) e JavaScript
ES5+ em `Model.js`

**Primary Dependencies**: `qs.Ui`, `qs.Commons`, `Quickshell.Io` (`Process`); binários `curl`,
`omarchy-launch-browser`, `notify-send` (nenhum novo)

**Storage**: nenhum novo; estimativas só em memória, no status de cada impressora

**Testing**: `node --test tests/` (novo `tests/status-polish.test.js`; casos novos em
`response.test.js`, `engine.test.js`, `panel.test.js`); `omarchy plugin validate`; `qmllint`;
Moonraker falso; teste em hardware com o usuário ([quickstart.md](./quickstart.md))

**Target Platform**: Omarchy Quattro (Arch Linux + Hyprland), `omarchy-shell`

**Project Type**: plugin de desktop (bar-widget) de pasta única

**Performance Goals**: mensagem e tempo restante em até 1–2 ciclos (SC-001, SC-002); nenhum ciclo
perdido por causa da busca da estimativa (SC-006)

**Constraints**: uma busca de metadados por impressão por barra (FR-009); timeout igual ao das
consultas; sem cores ou dimensões fixas

**Scale/Scope**: 1 a ~5 impressoras, 1 a 3 barras; uma requisição extra por impressão

Nenhum item ficou como NEEDS CLARIFICATION. A spec ganhou uma Assumption sobre o FR-009 com várias
barras (uma busca por barra; falha conta como a busca daquela impressão).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Status | Como o plano atende |
|-----------|--------|---------------------|
| I. Runtime do Omarchy | ✅ | Nada de kind, entry point, configuração ou arquivo novo no runtime; só testes e fixtures novos. |
| II. Shell nunca bloqueia | ✅ | A busca da estimativa é um `Process` assíncrono com o timeout das consultas e guarda; resultado único por `seq`. |
| III. Mínimo privilégio | ✅ | Nenhum binário novo (`curl` já documentado); o README passa a citar o `GET /server/files/metadata`. Só leitura. |
| IV. Degradação graciosa | ✅ | Sem metadados ou com falha, o tempo restante volta ao comportamento anterior; sem mensagem, nenhuma linha. |
| V. Lógica pura testável | ✅ | Leitura, estimativa (planejar/aceitar/parse), combinação e exibição em `Model.js`, com testes e fixtures reais. |
| VI. Validação obrigatória | ✅ | Gates por tarefa; ciclo de vida (quickstart §4). |
| VII. Hardware real | ✅ | Impressão real feita pelo usuário (quickstart §5), registrada em `hardware-test.md`. |
| VIII. Visual nativo | ✅ | Linha de texto com `Style.font.bodySmall`/`root.dim`; marcador com `markColor`, `Color.bar.background` e `Style.space()`. |

**Resultado pré-pesquisa**: aprovado, sem violações.

**Re-check pós-design (Phase 1)**: aprovado. Pontos de atenção para as tarefas:
- o teste "initialStatus is offline, waiting for the first answer" muda de propósito (campos
  novos); `detailFor` não tem teste de igualdade profunda;
- o servidor falso do scratchpad precisa responder `/server/files/metadata`;
- nomes com espaços ou subpastas não existem na Voron hoje: cobertos por teste do argumento;
- as capturas em dois temas dependem do usuário trocar o tema.

## Project Structure

### Documentation (this feature)

```text
specs/005-status-polish/
├── plan.md              # Este arquivo
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── model-api.md       # Funções novas/alteradas de Model.js
│   └── display.md         # Painel, ícone, busca da estimativa no BarWidget
├── checklists/
│   └── requirements.md
├── hardware-test.md     # criado no teste em hardware
└── tasks.md             # Phase 2 (/speckit-tasks; não criado aqui)
```

### Source Code (repository root = pasta do plugin)

```text
io.github.brunorzm.omaklippy/
├── manifest.json        # version 0.5.0
├── Model.js             # + displayMessage/message, progress, printDuration, estimate;
│                        #   buildMetadataArgs, parseMetadataResponse, planEstimate,
│                        #   acceptEstimate, blendRemaining; detailFor (messageText, remainingText)
├── BarWidget.qml        # + estimateComponent e planEstimate no dispatch; marcador de pausa
├── Panel.qml            # + linha da mensagem no bloco da impressão
├── README.md            # + mensagem, tempo restante pelo fatiador, marcador, GET de metadados
└── tests/
    ├── status-polish.test.js  # novo
    ├── response.test.js       # + displayMessage; initialStatus atualizado
    ├── engine.test.js         # + estimate no status ao longo das leituras
    ├── panel.test.js          # + messageText/remainingText no painel
    └── fixtures/              # + metadata-ok.json, metadata-missing.json (reais, Voron);
                               #   + fixtures sintéticas com display_status.message
```

**Structure Decision**: mesma pasta única; nenhum arquivo QML ou JS novo no runtime.

## Complexity Tracking

Nenhuma violação da constituição a justificar.
