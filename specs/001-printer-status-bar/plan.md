# Implementation Plan: Status das impressoras 3D na barra

**Branch**: `main` (sem branch dedicada) | **Date**: 2026-09-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-printer-status-bar/spec.md`

## Summary

Widget de barra do Omarchy Quattro que consulta periodicamente o Moonraker de cada impressora
cadastrada. Na barra aparece só o ícone do plugin, com um indicador gráfico de progresso e
mudança de aparência em erro e em offline, sempre refletindo a impressora mais relevante. O
clique abre um painel no padrão do Wi-Fi/Tailscale com os detalhes da impressora selecionada
(estado, progresso, arquivo, tempo restante, temperaturas) e uma lista para trocar de
impressora. Sem botões de ação nesta fatia; eles vêm na fatia 002. As requisições são feitas com `curl` num `Process` assíncrono com timeout
duplo. Parse, derivação de estado, escolha da impressora destacada e formatação ficam em
`Model.js` puro, testado com `node --test` e fixtures de respostas reais. As configurações ficam
inline na entrada do widget em `shell.json`. Detalhes em [research.md](./research.md).

## Technical Context

**Language/Version**: QML (Qt 6, runtime Quickshell do `omarchy-shell`, omarchy 4.0.4-1) e
JavaScript ES5+ no `Model.js` (compatível com o motor QML e com Node)

**Primary Dependencies**: `qs.Ui` (`BarWidget`, `BarIconButton`, `Panel`, `KeyboardPanel`,
`PanelKeyCatcher`, `PanelHero`, `PanelSectionHeader`), `qs.Commons` (`Style`, `Color`, `Util`), `Quickshell.Io` (`Process`, `StdioCollector`, `IpcHandler`); binário `curl` em
tempo de execução

**Storage**: nenhum próprio; configuração inline na entrada do widget em
`~/.config/omarchy/shell.json`, mantida pelo shell. Estado de execução só em memória.

**Testing**: `node --test tests/` para `Model.js` (Node 26 via mise, só no desenvolvimento);
`omarchy plugin validate` e `qmllint -I "$OMARCHY_PATH/shell"`; checklist de ciclo de vida e
teste com impressora Klipper real ([quickstart.md](./quickstart.md))

**Target Platform**: Omarchy Quattro (Arch Linux + Hyprland), `omarchy-shell`

**Project Type**: plugin de desktop (bar-widget) de pasta única

**Performance Goals**: mudança de estado visível em ≤ 1 intervalo (padrão 5 s); offline visível
em ≤ intervalo + timeout (padrão 8 s); o painel abre sem atraso perceptível porque só lê o
estado já calculado; nenhum trabalho síncrono na thread da UI

**Constraints**: no máximo uma requisição em voo por impressora por instância; timeout
obrigatório em toda requisição; nenhum arquivo fora da pasta do plugin; sem cores ou fontes fixas

**Scale/Scope**: 1 a ~5 impressoras numa rede local; 1 instância do widget por monitor

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Status | Como o plano atende |
|-----------|--------|---------------------|
| I. Runtime do Omarchy | ✅ | Só `kinds: ["bar-widget"]` com `entryPoints.barWidget`; o `Panel.qml` é carregado internamente, como no guia (sem kind `panel`). Nenhum processo Quickshell, daemon ou serviço systemd. `moduleName` = `io.github.brunorzm.omaklippy` em `BarWidget.qml` e `Panel.qml`. O `IpcHandler` herdado `omarchy.clock` é removido e o novo target é o próprio ID. Configuração inline em `shell.json`. Nenhum symlink (verificado). |
| II. Shell nunca bloqueia | ✅ | `Process` assíncrono + `curl --connect-timeout/--max-time` + `Timer` de guarda que mata o processo. Nenhuma chamada síncrona. Respostas atrasadas são descartadas por número de sequência. |
| III. Mínimo privilégio | ✅ | Único binário externo: `curl`, documentado no README. Sem sudo, sem scripts de instalação. Testes e fixtures ficam dentro da pasta. |
| IV. Degradação graciosa | ✅ (com nota) | `curl` é dependência **obrigatória**, não opcional. Na ausência dele, cada impressora aparece como "erro" com o motivo "curl não encontrado" e o widget continua carregado. Nenhuma dependência opcional é usada nesta fatia. |
| V. Lógica pura testável | ✅ | Toda a lógica em `Model.js` ([contracts/model-api.md](./contracts/model-api.md)), inclusive a seleção do painel e os modelos do ícone e do painel; cada função com teste `node --test`. O QML só faz ciclo de vida, timers, processos, bindings e layout. |
| VI. Validação obrigatória | ✅ | Toda tarefa termina com `validate` + `qmllint` (sobre `BarWidget.qml` e `Panel.qml`). Com painel real, o checklist de ciclo de vida (clique, Escape, summon/hide, desabilitar, reabilitar, reiniciar, remover) vale integralmente, como está no quickstart. |
| VII. Hardware real | ✅ | O quickstart tem roteiro por história de usuário numa impressora real e um bloco de registro (versões do Klipper/Moonraker, cenários, data). |
| VIII. Visual nativo | ✅ | O ícone é um `BarIconButton` com `iconComponent` (padrão do Tailscale); a barra de progresso usa `barForeground` e `Util.alpha`, erro usa `urgent`, offline usa `dimmed`. O painel usa só os componentes nativos. Dimensões por `Style.bar.*`/`Style.space()`, fontes por `Style.font.*`. Não existem tokens de sucesso/aviso, então nenhum verde/amarelo. |

**Resultado pré-pesquisa**: aprovado, sem violações.

**Re-check pós-design (Phase 1)**: aprovado. O modelo de dados, os contratos e o quickstart não
introduzem arquivos fora da pasta, chamadas síncronas nem dependências novas. A decisão de
configurar via `shell.json` sem formulário (research R5) está dentro do Princípio I. A revisão
de UI (ícone + painel) substitui o tooltip rico e resolve o uso do checklist do Princípio VI,
que antes dependia de interpretação.

## Project Structure

### Documentation (this feature)

```text
specs/001-printer-status-bar/
├── plan.md              # Este arquivo
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1 (validação e teste em hardware)
├── contracts/
│   ├── model-api.md       # Funções puras de Model.js (superfície testável)
│   ├── settings.md        # Forma da entrada do widget em shell.json
│   ├── moonraker.md       # Requisição consumida, respostas e fixtures
│   └── display.md         # Ícone, painel, interações, IPC
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks; não criado aqui)
```

### Source Code (repository root = pasta do plugin)

```text
io.github.brunorzm.omaklippy/
├── manifest.json        # reescrito: descrição, defaults, schema dos inteiros
├── BarWidget.qml        # reescrito: polling, Process por impressora, estado, seleção,
│                        #   ícone (BarIconButton + indicador), Loader do painel
├── Panel.qml            # reescrito: painel de detalhes + lista de impressoras (sem ações)
├── Model.js             # novo: lógica pura (contracts/model-api.md)
├── README.md            # novo: uso, configuração, dependências (curl; node só em dev)
├── LICENSE              # novo: MIT (já declarado no manifest)
└── tests/
    ├── model.test.js    # node --test
    └── fixtures/        # respostas reais do Moonraker (JSON + código HTTP)
```

O `Panel.qml` atual é uma cópia acidental do `BarWidget.qml` e é **reescrito** do zero.

**Structure Decision**: pasta única na raiz, no formato exigido pelo guia (manifest na raiz,
entry point relativo). `tests/` e `specs/` convivem na pasta sem afetar o shell, porque só os
arquivos em `entryPoints` e os importados por eles são carregados.

## Complexity Tracking

Nenhuma violação da constituição a justificar.
