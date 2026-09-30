# Implementation Plan: Notificações de impressão no desktop

**Branch**: `main` (sem branch dedicada; o script informou `004-print-notifications`) | **Date**: 2026-09-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/004-print-notifications/spec.md`

## Summary

O plugin passa a avisar por notificação do desktop quando uma impressão termina, falha (inclusive
erro com aquecedor ligado sem impressão), pausa fora do painel ou a impressora para de responder
por 3 leituras durante uma impressão. A detecção é uma função pura (`observe`) aplicada a cada
leitura aceita, comparando com o último estado com resposta. Cada instância do widget (uma por
barra) acompanha as impressoras, mas só a **líder**, eleita num estado compartilhado
(`Shared.js`, `.pragma library`, verificado com dois monitores e hot reload), envia. O mesmo
estado guarda as proteções das ações do painel (Pause/Resume/Cancel/Emergency stop), que
descartam os eventos da impressora até a primeira leitura depois da resposta, qualquer que seja
o monitor. O envio é `notify-send -a OmaKlippy -u normal|critical` num `Process` com guarda de
10 s; falha e contato perdido são `critical` porque o serviço do Omarchy só mantém essas na tela
(emenda do FR-007). Quatro chaves `On`/`Off` ligam cada tipo. Sem `notify-send` ou sem serviço,
o painel mostra "Notifications unavailable: …". Detalhes em [research.md](./research.md).

## Technical Context

**Language/Version**: QML (Qt 6, Quickshell do `omarchy-shell`, omarchy 4.0.4-1) e JavaScript
ES5+ em `Model.js` (motor QML e Node)

**Primary Dependencies**: `qs.Ui`, `qs.Commons`, `Quickshell.Io` (`Process`); binários `curl`,
`omarchy-launch-browser` (fatias anteriores) e **`notify-send`** (novo, opcional, pacote
`libnotify`); serviço de notificações do shell do Omarchy

**Storage**: quatro chaves `On`/`Off` na entrada do widget em `shell.json`; o resto em memória
(inclusive o estado compartilhado entre instâncias)

**Testing**: `node --test tests/` (novo `tests/notify.test.js`; casos novos e atualizados em
`settings.test.js`, `engine.test.js`, `panel.test.js`); `omarchy plugin validate`; `qmllint`;
Moonraker falso com dois monitores; teste em hardware com o usuário
([quickstart.md](./quickstart.md))

**Target Platform**: Omarchy Quattro (Arch Linux + Hyprland), `omarchy-shell`

**Project Type**: plugin de desktop (bar-widget) de pasta única

**Performance Goals**: notificação em até um ciclo depois de a impressora reportar a mudança
(SC-001); contato perdido em até 4 ciclos (SC-007); nenhum trabalho síncrono

**Constraints**: uma notificação por evento com qualquer número de barras (FR-009); nenhuma no
primeiro estado lido (FR-008); guarda de 10 s no envio; argv sem shell; sem cores ou dimensões
fixas; nenhum arquivo fora da pasta

**Scale/Scope**: 1 a ~5 impressoras, 1 a 3 barras; 4 tipos de evento

Nenhum item ficou como NEEDS CLARIFICATION. A spec foi emendada no FR-007 (falha e contato
perdido com a mesma urgência, consequência do FR-007a e do serviço de notificações do Omarchy) e
ganhou uma Assumption sobre o "Não perturbe".

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Status | Como o plano atende |
|-----------|--------|---------------------|
| I. Runtime do Omarchy | ✅ | Nenhum kind novo (a alternativa `service` foi rejeitada em R2); arquivos novos `Shared.js` (biblioteca JS) e testes, sem symlink; configuração nova inline na entrada do widget; nenhum processo Quickshell, daemon ou serviço próprio. |
| II. Shell nunca bloqueia | ✅ | Envio por `Process` assíncrono com guarda de 10 s e resultado único; detecção é cálculo puro sobre leituras já feitas; nenhuma consulta nova. |
| III. Mínimo privilégio | ✅ | Um binário novo, `notify-send`, listado e justificado no README como opcional; argv sem shell. Nada gravado fora da pasta (os arquivos das notificações são do serviço do Omarchy). O estado compartilhado vive só em memória. |
| IV. Degradação graciosa | ✅ | `notify-send` ausente ou serviço indisponível → aviso visível no painel; status, comandos e interface web continuam. É a dependência opcional que o princípio cita (libnotify). |
| V. Lógica pura testável | ✅ | `observe`, reconciliação, filtros, montagem da notificação, parse do resultado, eleição do líder e proteções em `Model.js` ([contracts/model-api.md](./contracts/model-api.md)), com testes; `Shared.js` só guarda objetos. |
| VI. Validação obrigatória | ✅ | Gates por tarefa (quickstart §1); ciclo de vida com dois monitores (§5). |
| VII. Hardware real | ✅ | Conclusão e pausa reais feitas pelo usuário (§6), registradas em `hardware-test.md`. |
| VIII. Visual nativo | ✅ | Só uma linha de texto no painel com `Style.font.caption` e `root.dim`; a aparência das notificações é do serviço do Omarchy. |

**Resultado pré-pesquisa**: aprovado, sem violações.

**Re-check pós-design (Phase 1)**: aprovado. Pontos de atenção para as tarefas:
- testes que comparam `initialStatus`, `applyReading`, `planDispatch` ou o `PanelModel` inteiros
  vão precisar dos campos novos (`printState`, `requestedAt`, `notifyWarning`): atualização
  esperada, não regressão;
- `Shared.js` sobrevive ao hot reload; mudanças nele exigem `omarchy-restart-shell`;
- o aviso de indisponibilidade não pode ser testado ao vivo sobrepondo o binário (PATH do shell,
  hardware test da 003); cobertura por testes puros;
- fixture nova para "ocioso aquecendo" (alvo do bico > 0 em `standby`).

## Project Structure

### Documentation (this feature)

```text
specs/004-print-notifications/
├── plan.md              # Este arquivo
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── model-api.md       # Funções novas/alteradas de Model.js
│   └── widget.md          # BarWidget, Shared.js, Panel, manifesto
├── checklists/
│   └── requirements.md
├── hardware-test.md     # criado no teste em hardware
└── tasks.md             # Phase 2 (/speckit-tasks; não criado aqui)
```

### Source Code (repository root = pasta do plugin)

```text
io.github.brunorzm.omaklippy/
├── manifest.json        # version 0.4.0; quatro chaves notify* no schema e nos defaults
├── Model.js             # + TEXT.notify, constantes, readSettings.notify, printState/requestedAt,
│                        #   planDispatch(now), emptyWatch/observe/reconcileWatches/filterEvents,
│                        #   buildNotification/parseNotifyResult/notifyWarning, registro e
│                        #   proteções; buildPanelModel(notifyWarning)
├── Shared.js            # novo: .pragma library, recipiente do estado compartilhado
├── BarWidget.qml        # + instanceId, watches, observe em accept, proteções em runAction/
│                        #   acceptCommand, notifyComponent, aviso, stopRequests(true) sem key vazia
├── Panel.qml            # + linha "Notifications unavailable: …"
├── README.md            # + notificações, chaves notify*, notify-send (opcional), Não perturbe
└── tests/
    ├── notify.test.js   # novo: observe, eventos, notificação, resultado, registro, proteções
    ├── settings.test.js # + notify em readSettings
    ├── engine.test.js   # + printState, requestedAt (e testes atualizados)
    ├── panel.test.js    # + notifyWarning (e testes atualizados)
    └── fixtures/        # + standby-heating.synthetic.json
```

**Structure Decision**: mesma pasta única. Um arquivo JS novo (`Shared.js`) porque o estado
entre instâncias não pode viver em `Model.js` (que é importado sem `.pragma library` e precisa
continuar puro e carregável no Node).

## Complexity Tracking

Nenhuma violação da constituição a justificar.
