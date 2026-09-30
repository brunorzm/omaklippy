# Implementation Plan: Quando termina (horário de término, camada e tempo no tooltip)

**Branch**: `main` (sem branch dedicada; o script informou `006-print-finish-info`) | **Date**: 2026-09-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/006-print-finish-info/spec.md`

## Summary

Três acréscimos só de leitura, sobre o tempo restante da 005:

1. O painel mostra `Ends 16:52` (agora + tempo restante, 24 h, com "tomorrow" ou o dia quando não
   é hoje), recalculado a cada atualização.
2. O tooltip do ícone ganha ` · 26m left`; as opções do menu "Printer" não mudam.
3. O painel mostra `Layer 12/62` quando a impressora informa a camada atual (`print_stats.info`,
   já na consulta); o total vem da impressora ou de `layer_count` dos metadados que a 005 já
   busca. Na Voron de hoje a linha fica escondida (decisão do usuário).

Tudo em funções puras de `Model.js`, testadas com `node --test` e fuso fixo. Detalhes em
[research.md](./research.md).

## Technical Context

**Language/Version**: QML (Qt 6, Quickshell do `omarchy-shell`, omarchy 4.0.4-1) e JavaScript
ES5+ em `Model.js`

**Primary Dependencies**: `qs.Ui`, `qs.Commons`, `Quickshell.Io`; binários `curl`,
`omarchy-launch-browser`, `notify-send` (nenhum novo)

**Storage**: nenhum novo

**Testing**: `node --test tests/` (novo `tests/finish-info.test.js`, com `process.env.TZ` fixo);
`omarchy plugin validate`; `qmllint`; Moonraker falso; teste em hardware com o usuário
([quickstart.md](./quickstart.md))

**Target Platform**: Omarchy Quattro (Arch Linux + Hyprland), `omarchy-shell`

**Project Type**: plugin de desktop (bar-widget) de pasta única

**Performance Goals**: nenhuma requisição nova; horário recalculado no mesmo ritmo do painel

**Constraints**: horário sempre em 24 h; relógio e fuso do computador; nenhuma cor ou dimensão fixa

**Scale/Scope**: três linhas novas de exibição

Nenhum item ficou como NEEDS CLARIFICATION. A spec foi atualizada no plano com a decisão do
usuário sobre o formato (24 h fixo, FR-002 e Clarifications).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Status | Como o plano atende |
|-----------|--------|---------------------|
| I. Runtime do Omarchy | ✅ | Nada de kind, entry point, configuração ou arquivo novo no runtime. |
| II. Shell nunca bloqueia | ✅ | Nenhum processo ou requisição nova; só cálculo sobre dados já lidos. |
| III. Mínimo privilégio | ✅ | Nenhum binário novo; só leitura. |
| IV. Degradação graciosa | ✅ | Sem tempo restante, sem `Ends`; sem camada ou total, sem `Layer`; tooltip volta ao de antes. |
| V. Lógica pura testável | ✅ | `formatFinish`, `tooltipLine`, `parseMetadataLayers` e os campos novos em `Model.js`, com testes em fuso fixo. |
| VI. Validação obrigatória | ✅ | Gates por tarefa; ciclo de vida (quickstart §3). |
| VII. Hardware real | ✅ | Impressão real na Voron com o usuário (quickstart §4). |
| VIII. Visual nativo | ✅ | Duas `InfoRow` iguais às existentes; o tooltip é o do shell. |

**Resultado pré-pesquisa**: aprovado, sem violações.

**Re-check pós-design (Phase 1)**: aprovado. Pontos de atenção para as tarefas:
- testes que mudam de propósito: "initialStatus is offline…" (`currentLayer`, `totalLayer`); em
  `tests/status-polish.test.js`, "planEstimate asks once per file…" (o `estimate` ganha
  `layerCount`). Os testes de `tooltip` em `tests/view.test.js` **não** mudam: os status deles
  não têm tempo restante, então o tooltip continua igual (conferido);
- o tooltip não pode ser conferido ao vivo pelo assistente (sem mouse): teste puro + usuário;
- a US3 real depende de o fatiador gravar as camadas; na Voron de hoje só se confere que a linha
  fica escondida.

## Project Structure

### Documentation (this feature)

```text
specs/006-print-finish-info/
├── plan.md              # Este arquivo
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── model-api.md       # Model.js, BarWidget e Panel
├── checklists/
│   └── requirements.md
├── hardware-test.md     # criado no teste em hardware
└── tasks.md             # Phase 2 (/speckit-tasks; não criado aqui)
```

### Source Code (repository root = pasta do plugin)

```text
io.github.brunorzm.omaklippy/
├── manifest.json        # version 0.6.0
├── Model.js             # + TEXT (Ends, Layer, finish, left); currentLayer/totalLayer;
│                        #   parseMetadataLayers; estimate.layerCount; formatFinish;
│                        #   tooltipLine; buildIconState e detailFor alterados
├── BarWidget.qml        # + layerCount no acceptEstimate
├── Panel.qml            # + InfoRow Ends e Layer
├── README.md            # + término, camada (quando a impressora informa), tooltip
└── tests/
    ├── finish-info.test.js    # novo
    ├── response.test.js       # initialStatus atualizado; leitura de info
    ├── status-polish.test.js  # estimate com layerCount
    └── fixtures/              # + printing-layers.synthetic, printing-layer-no-total.synthetic
```

**Structure Decision**: mesma pasta única; nenhum arquivo novo no runtime.

## Complexity Tracking

Nenhuma violação da constituição a justificar.
