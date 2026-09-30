# Implementation Plan: Abrir a interface web da impressora pelo painel

**Branch**: `main` (sem branch dedicada; o script informou `003-open-web-ui`) | **Date**: 2026-09-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/003-open-web-ui/spec.md`

## Summary

O painel ganha o botão "Open web UI", em linha própria abaixo do Emergency stop, que abre no
navegador padrão a interface web (Mainsail/Fluidd) da impressora selecionada e fecha o painel.
Ele aparece em qualquer estado, inclusive erro e offline, sempre que a impressora tem endereço
de interface web válido. O endereço é o campo opcional `webUrl` da impressora ou, sem ele, o
endereço cadastrado sem a porta `7125` do Moonraker. A abertura roda `omarchy-launch-browser`
num `Process` assíncrono do `BarWidget` com guarda de 10 s. Com saída 0 o painel fecha; com
falha aparece `Open web UI failed: …` no lugar das falhas da 002. O estado usa um terceiro slot
(`web`) em `PrinterCommands`, independente dos comandos à impressora. Regras de endereço,
planejamento, parse do resultado, modelo do botão e cursor ficam em `Model.js`, testados com
`node --test`. Detalhes em [research.md](./research.md).

## Technical Context

**Language/Version**: QML (Qt 6, Quickshell do `omarchy-shell`, omarchy 4.0.4-1) e JavaScript
ES5+ em `Model.js` (motor QML e Node)

**Primary Dependencies**: `qs.Ui` (`Button` etc., já usados), `qs.Commons`, `Quickshell.Io`
(`Process`); binários `curl` (001/002) e **`omarchy-launch-browser`** (novo, do pacote
`omarchy`, em `/usr/share/omarchy/bin`)

**Storage**: campo opcional `webUrl` em cada impressora de `printers` no `shell.json`, escrito
pelo usuário; o resto só em memória

**Testing**: `node --test tests/` (novo `tests/web.test.js`; casos novos em `settings.test.js`,
`actions.test.js`, `panel.test.js`); `omarchy plugin validate`; `qmllint`; Moonraker falso da
002; launcher falso temporário para a falha; teste em hardware ([quickstart.md](./quickstart.md))

**Target Platform**: Omarchy Quattro (Arch Linux + Hyprland), `omarchy-shell`

**Project Type**: plugin de desktop (bar-widget) de pasta única

**Performance Goals**: navegador visível em ≤ 2 s depois do acionamento (SC-003); o launcher
sai em algumas centenas de ms, e nada roda de forma síncrona na thread da UI

**Constraints**: guarda de 10 s na abertura; argv sem shell; uma abertura por impressora por
instância; a abertura não bloqueia nem é bloqueada pelos comandos da 002 (FR-014); sem cores ou
dimensões fixas

**Scale/Scope**: 1 a ~5 impressoras, 1 instância por monitor; 1 botão novo

Nenhum item ficou como NEEDS CLARIFICATION: a regra do endereço e a posição do botão estão nas
Clarifications da spec; o nome do campo (`webUrl`) e o launcher foram decididos em R1/R2.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Status | Como o plano atende |
|-----------|--------|---------------------|
| I. Runtime do Omarchy | ✅ | Nenhum kind ou entry point novo; mudanças em `BarWidget.qml`/`Panel.qml` com o mesmo `moduleName`. A configuração nova (`webUrl`) fica inline na entrada do widget em `shell.json`. Sem processo Quickshell, daemon, serviço próprio ou symlink (a unidade `systemd-run` é criada pelo launcher do Omarchy para o navegador, não pelo plugin). |
| II. Shell nunca bloqueia | ✅ | `Process` assíncrono com `Timer` de guarda de 10 s e resultado único por `seq`. Nenhuma sondagem da interface web. |
| III. Mínimo privilégio | ✅ | Um binário novo, `omarchy-launch-browser`, listado e justificado no README (tabela de dependências). Argv sem shell. Nada é gravado fora da pasta. O launcher falso do teste de falha fica em `~/.local/bin` só durante o teste, com aprovação do usuário, e é removido. |
| IV. Degradação graciosa | ✅ | Launcher ausente ou com falha → `Open web UI failed: …` visível; status e comandos continuam. `webUrl` inválido esconde só o botão daquela impressora. |
| V. Lógica pura testável | ✅ | `deriveWebUrl`, `webUrl` em `normalizePrinters`, `planOpenWeb`, `buildWebLaunchArgs`, `parseWebLaunchResult`, slot `web` em `acceptCommandResult`, `buildActionsModel` e `cursorStops` em `Model.js` ([contracts/model-api.md](./contracts/model-api.md)), com teste. O QML só cria o processo e fecha o painel. |
| VI. Validação obrigatória | ✅ | Gates por tarefa no quickstart §1; ciclo de vida no §4, incluindo reiniciar o shell com o navegador aberto. |
| VII. Hardware real | ✅ | Abrir a interface da Voron e da Biqu pelo painel (quickstart §5), com registro em `hardware-test.md`. |
| VIII. Visual nativo | ✅ | Mesmo `ActionButton` (`Button` de `qs.Ui`); espaçador `Style.space(12)`; nenhuma cor nova, sem `urgent`. |

**Resultado pré-pesquisa**: aprovado, sem violações.

**Re-check pós-design (Phase 1)**: aprovado. Os contratos adicionam um binário documentado e um
campo opcional de configuração, sem arquivo, serviço ou dependência opcional nova. Pontos de
atenção para as tarefas:
- testes da 001/002 que comparam o resultado de `normalizePrinters`, `emptyCommands` ou o
  `ActionsModel` inteiro vão precisar dos campos novos (`webUrl`, `web`); é atualização esperada,
  não regressão do SC-005;
- o FR-013 muda a tabela de estados da 002: o `display.md` da 003 a substitui, e o README deixa
  de dizer que a interface web "is not there yet";
- a detecção de falha tem um limite conhecido (navegador que falha depois de lançado), registrado
  em R1.

## Project Structure

### Documentation (this feature)

```text
specs/003-open-web-ui/
├── plan.md              # Este arquivo
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1 (validação, launcher falso, teste em hardware)
├── contracts/
│   ├── model-api.md       # Funções novas/alteradas de Model.js
│   └── display.md         # Botão, posição, acionamento, processo no BarWidget
├── checklists/
│   └── requirements.md
├── hardware-test.md     # criado no teste em hardware
└── tasks.md             # Phase 2 (/speckit-tasks; não criado aqui)
```

### Source Code (repository root = pasta do plugin)

```text
io.github.brunorzm.omaklippy/
├── manifest.json        # version 0.3.0
├── Model.js             # + deriveWebUrl, planOpenWeb, buildWebLaunchArgs,
│                        #   parseWebLaunchResult, WEB_LAUNCH_TIMEOUT_SEC,
│                        #   ACTION_GLYPHS.openWebUi, TEXT novos; webUrl em normalizePrinters,
│                        #   slot web em emptyCommands/acceptCommandResult,
│                        #   web em buildActionsModel, openWebUi em cursorStops
├── BarWidget.qml        # + openWebUi(key), acceptWebLaunch(), webLaunchComponent
│                        #   (Process + guarda) em requestHolder
├── Panel.qml            # + linha Open web UI depois do e-stop; desvio em activate()
├── README.md            # + webUrl na tabela, omarchy-launch-browser nas dependências,
│                        #   botão na lista do painel, Privileges atualizado
└── tests/
    ├── web.test.js      # novo: deriveWebUrl, webUrl, planOpenWeb, args, parse, slot web
    ├── settings.test.js # + webUrl em normalizePrinters/readSettings
    ├── actions.test.js  # + planCommand ignora web; emptyCommands com web
    └── panel.test.js    # + actions.web por estado, cursorStops com openWebUi
```

**Structure Decision**: mesma pasta única das fatias anteriores. Nenhum arquivo QML novo: o
processo de abertura fica no `BarWidget.qml`, ao lado dos de consulta e comando, porque o painel
fecha em caso de sucesso e cada instância fecha só o próprio painel.

## Complexity Tracking

Nenhuma violação da constituição a justificar.
