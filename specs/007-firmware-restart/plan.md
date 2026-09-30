# Implementation Plan: Reiniciar o firmware pelo painel

**Branch**: `main` (sem branch dedicada; o script informou `007-firmware-restart`) | **Date**: 2026-09-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/007-firmware-restart/spec.md`

## Summary

Uma ação nova, `firmwareRestart`, no mesmo ciclo das ações da 002 (planejar → curl → resultado →
consulta imediata), enviada por `POST /printer/firmware_restart`:

1. Aparece só com o estado `error` **e** `klippyState` `shutdown` ou `error` (parada de
   emergência, falha do MCU, erro de configuração). Não aparece em `startup`, no 503 "Klippy
   Disconnected/Host not connected" (o `klippyState` fica vazio), em erro de impressão com o
   Klipper `ready`, nem em offline. A disponibilidade deixa de ser só uma tabela por `state`:
   `availableActions(state)` continua igual e ganha a companheira `actionsFor(status)`.
2. Pede confirmação (`ConfirmDialog`, "Back" selecionado), usa o slot `busy` e a proteção das
   notificações que o `runAction` já aplica.
3. Fica em `actions.primary`: nos estados em que aparece, `primary` estaria vazio e não há
   parada de emergência, então ocupa a linha sozinho, com a aparência comum, acima de "Open web
   UI". `Panel.qml` e `BarWidget.qml` não mudam.

Tudo em `Model.js`, testado com `node --test`. Detalhes em [research.md](./research.md).

## Technical Context

**Language/Version**: QML (Qt 6, Quickshell do `omarchy-shell`, omarchy 4.0.4-1) e JavaScript
ES5+ em `Model.js`

**Primary Dependencies**: `qs.Ui`, `qs.Commons`, `Quickshell.Io`; binários `curl`,
`omarchy-launch-browser`, `notify-send` (nenhum novo)

**Storage**: nenhum novo

**Testing**: `node --test tests/` (novo `tests/firmware-restart.test.js`); `omarchy plugin
validate`; `qmllint`; Moonraker falso com sequência de estados depois do POST; teste em hardware
com o usuário na Voron ([quickstart.md](./quickstart.md))

**Target Platform**: Omarchy Quattro (Arch Linux + Hyprland), `omarchy-shell`

**Project Type**: plugin de desktop (bar-widget) de pasta única

**Performance Goals**: uma requisição por acionamento; a consulta imediata depois do resultado já
existe (002)

**Constraints**: nenhum reenvio automático; tempo total de 60 s (`COMMAND_TIMEOUT_SEC`); nenhuma
cor ou dimensão fixa

**Scale/Scope**: um botão, uma confirmação, textos novos

Nenhum item ficou como NEEDS CLARIFICATION.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Status | Como o plano atende |
|-----------|--------|---------------------|
| I. Runtime do Omarchy | ✅ | Nada de kind, entry point, configuração ou arquivo novo no runtime. |
| II. Shell nunca bloqueia | ✅ | O mesmo `Process` de curl assíncrono das ações da 002, com `--connect-timeout`, `--max-time 60` e guarda de 61 s. |
| III. Mínimo privilégio | ✅ | Nenhum binário novo; um endpoint novo do Moonraker, só com confirmação do usuário. |
| IV. Degradação graciosa | ✅ | Falha vira `Restart firmware failed: …` no painel; o estado real continua vindo da consulta. |
| V. Lógica pura testável | ✅ | `actionsFor`, `canRestartFirmware`, textos e confirmação em `Model.js`, com testes e fixture nova (`klippy-error.synthetic`). |
| VI. Validação obrigatória | ✅ | Gates por tarefa; ciclo de vida (quickstart §4). |
| VII. Hardware real | ✅ | Parada de emergência e reinício na Voron ociosa e fria, feitos pelo usuário (quickstart §5). |
| VIII. Visual nativo | ✅ | O mesmo `Button` bordered da linha primary; sem a cor de alerta. |

**Resultado pré-pesquisa**: aprovado, sem violações.

**Re-check pós-design (Phase 1)**: aprovado. Pontos de atenção para as tarefas:
- `planCommand` e `buildActionsModel` passam a usar `actionsFor(status)`; os testes da 002 de
  `availableActions(state)` **não** mudam (a função fica igual);
- nenhum teste existente deve mudar: os de `actions.test.js`/`web.test.js` com `error` montam o
  status sem `klippyState` (continua sem botão), e os que usam as fixtures `shutdown*`
  (`errors`, `notify`, `panel`, `response`, `status-polish`, `finish-info`) não olham
  `actions.primary` (conferido com grep no plano; confirmar ao rodar a suíte);
- nota "Fatia 007" nas tabelas de disponibilidade da 002 (`data-model.md` e
  `contracts/display.md`), como a 003 fez;
- o reinício real é acionado pelo usuário ([printer-safety]); o assistente só observa com GET.

## Project Structure

### Documentation (this feature)

```text
specs/007-firmware-restart/
├── plan.md              # Este arquivo
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── model-api.md       # Model.js
│   ├── display.md         # painel e confirmação
│   └── moonraker.md       # POST /printer/firmware_restart
├── checklists/
│   └── requirements.md
├── hardware-test.md     # criado no teste em hardware
└── tasks.md             # Phase 2 (/speckit-tasks; não criado aqui)
```

### Source Code (repository root = pasta do plugin)

```text
io.github.brunorzm.omaklippy/
├── manifest.json        # version 0.7.0
├── Model.js             # + ACTIONS.firmwareRestart, ACTION_GLYPHS.firmwareRestart,
│                        #   TEXT (actions.firmwareRestart, confirm.restart, confirm.restartMessage),
│                        #   canRestartFirmware, actionsFor; planCommand, buildActionsModel,
│                        #   confirmMessage e confirmLabel alterados
├── BarWidget.qml        # sem mudança (runAction já cobre qualquer ação de ACTIONS)
├── Panel.qml            # sem mudança (o botão vem em actions.primary)
├── README.md            # + Restart firmware
└── tests/
    ├── firmware-restart.test.js   # novo
    └── fixtures/                  # + klippy-error.synthetic, action-restart-ok (real, no teste em hardware)
```

**Structure Decision**: mesma pasta única; nenhum arquivo novo no runtime.

## Complexity Tracking

Nenhuma violação da constituição a justificar.
