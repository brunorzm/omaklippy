# Implementation Plan: Reiniciar o serviço do Klipper pelo painel

**Branch**: `main` (sem branch dedicada; o script informou `008-klipper-service-restart`) | **Date**: 2026-09-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/008-klipper-service-restart/spec.md`

## Summary

Uma ação nova, `klipperRestart`, no ciclo das ações da 002/007, enviada por
`POST /machine/services/restart?service=<nome>`:

1. **Desconexão persistente**: cada status guarda `klippyDownSince`, o instante da primeira de uma
   sequência de respostas HTTP 503 do Moonraker (o Klipper não está conectado a ele). Qualquer
   outra resposta, ou offline, zera. O botão aparece com `now − klippyDownSince ≥ 15 s`.
2. **Nome do serviço**: assim que uma impressora entra em desconexão, um `GET /machine/system_info`
   lê `instance_ids.klipper` (uma vez; guardado no status). Sem resposta útil, usa `klipper`.
3. **Depois de um reinício aceito**, o relógio de desconexão é zerado: o botão só volta se a
   desconexão durar outros 15 s (US2.2), nunca enquanto o Klipper ainda está subindo.
4. O botão vai em `actions.primary` (como o da 007): `Panel.qml` não muda. `BarWidget.qml` ganha a
   busca do `system_info` e o reset do relógio.

Tudo de decisão em `Model.js`, testado com `node --test`. Detalhes em [research.md](./research.md).

## Technical Context

**Language/Version**: QML (Qt 6, Quickshell do `omarchy-shell`, omarchy 4.0.4-1) e JavaScript
ES5+ em `Model.js`

**Primary Dependencies**: `qs.Ui`, `qs.Commons`, `Quickshell.Io`; binários `curl`,
`omarchy-launch-browser`, `notify-send` (nenhum novo)

**Storage**: nenhum novo (o nome do serviço fica no status em memória)

**Testing**: `node --test tests/` (novo `tests/klipper-restart.test.js`); `omarchy plugin
validate`; `qmllint`; Moonraker falso com 503 contínuo, `system_info` e o POST de serviço; teste
em hardware com o usuário parando o serviço na Voron ([quickstart.md](./quickstart.md))

**Target Platform**: Omarchy Quattro (Arch Linux + Hyprland), `omarchy-shell`

**Project Type**: plugin de desktop (bar-widget) de pasta única

**Performance Goals**: no máximo um `GET /machine/system_info` por impressora por episódio de
desconexão sem nome conhecido; um POST por acionamento

**Constraints**: 15 s de desconexão contínua antes do botão; nenhum reenvio automático; tempo
total de 60 s; nenhuma cor ou dimensão fixa

**Scale/Scope**: um botão, uma confirmação, um campo de tempo no status, uma busca nova

Nenhum item ficou como NEEDS CLARIFICATION.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Status | Como o plano atende |
|-----------|--------|---------------------|
| I. Runtime do Omarchy | ✅ | Nada de kind, entry point, configuração ou arquivo novo no runtime. |
| II. Shell nunca bloqueia | ✅ | A busca do `system_info` e o POST usam `Process` de curl assíncrono com timeout e guarda, como metadados (005) e ações (002). |
| III. Mínimo privilégio | ✅ | Nenhum binário novo; o reinício do serviço é feito pelo Moonraker, que só reinicia serviços da própria lista de permitidos; só com confirmação do usuário. |
| IV. Degradação graciosa | ✅ | Sem `system_info`, usa `klipper`; serviço não permitido ou falha viram `Restart Klipper failed: …`. |
| V. Lógica pura testável | ✅ | `klippyDownSince`, `canRestartKlipper`, `planServiceInfo`, `parseServiceInfo`, `clearKlippyDown` e os textos em `Model.js`, com testes e fixtures. |
| VI. Validação obrigatória | ✅ | Gates por tarefa; ciclo de vida (quickstart §4). |
| VII. Hardware real | ✅ | Serviço do Klipper parado pelo usuário na Voron e reiniciado pelo painel (quickstart §5). |
| VIII. Visual nativo | ✅ | O mesmo `Button` da linha primary. |

**Resultado pré-pesquisa**: aprovado, sem violações.

**Re-check pós-design (Phase 1)**: aprovado. Pontos de atenção para as tarefas:
- `initialStatus` ganha `klippyDownSince: null` e `klipperService: null`: o teste "initialStatus is
  offline, waiting for the first answer" (`tests/response.test.js`) muda de propósito;
- `actionsFor(status)` ganha o parâmetro opcional `now`, e `buildActionsModel` também; sem `now`
  o `klipperRestart` nunca é oferecido (os testes da 007 continuam iguais);
- `buildActionArgs` ganha o parâmetro opcional do nome do serviço (só o `klipperRestart` usa);
- `system_info` real não pôde ser capturado no plano (Voron e Biqu fora da rede às 21:30): as
  fixtures são sintéticas a partir da leitura das 19:25; captura real no teste em hardware;
- parar o serviço do Klipper na Voron é feito pelo usuário ([printer-safety]).

## Project Structure

### Documentation (this feature)

```text
specs/008-klipper-service-restart/
├── plan.md              # Este arquivo
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── model-api.md       # Model.js
│   ├── display.md         # painel e confirmação
│   └── moonraker.md       # GET /machine/system_info, POST /machine/services/restart
├── checklists/
│   └── requirements.md
├── hardware-test.md     # criado no teste em hardware
└── tasks.md             # Phase 2 (/speckit-tasks; não criado aqui)
```

### Source Code (repository root = pasta do plugin)

```text
io.github.brunorzm.omaklippy/
├── manifest.json        # version 0.8.0
├── Model.js             # + KLIPPY_DOWN_OFFER_MS, ACTIONS.klipperRestart, glifo, TEXT;
│                        #   klippyDownSince/klipperService no status; canRestartKlipper;
│                        #   actionsFor(status, now); planServiceInfo, parseServiceInfo,
│                        #   acceptServiceInfo, clearKlippyDown; buildActionArgs com o serviço;
│                        #   planCommand, buildActionsModel, buildPanelModel, confirmMessage,
│                        #   confirmLabel alterados
├── BarWidget.qml        # + Process do system_info (como o de metadados); reset do relógio
│                        #   depois de um klipperRestart aceito
├── Panel.qml            # sem mudança (botão em actions.primary)
├── README.md            # + Restart Klipper; /machine/system_info e /machine/services/restart
└── tests/
    ├── klipper-restart.test.js    # novo
    ├── response.test.js           # initialStatus com os dois campos novos
    └── fixtures/                  # + system-info.synthetic, system-info-instance.synthetic,
                                   #   system-info-no-klipper.synthetic,
                                   #   action-service-not-allowed.synthetic (criadas no plano)
```

**Structure Decision**: mesma pasta única; nenhum arquivo novo no runtime.

## Complexity Tracking

Nenhuma violação da constituição a justificar.
