# Implementation Plan: Cadastrar impressoras pelo painel, com descoberta na rede

**Branch**: `main` (sem branch dedicada; o script informou `009-printer-setup`) | **Date**: 2026-10-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/009-printer-setup/spec.md`

## Summary

1. **Gravação**: o widget pede ao shell que grave a lista nova de impressoras, rodando
   `omarchy-shell shell setBarWidget <id> printers " <json>" "{}"` (o espaço contorna o `qs ipc`,
   que separa argumentos que começam com `[`; testado). O plugin não escreve arquivo nenhum.
2. **Busca**, só a pedido: `ip -j -4 addr` → redes locais sem VPN; em paralelo, `avahi-browse
   _moonraker._tcp` e um `curl --parallel` que verifica cada endereço da /24 na porta 7125 (4 s na
   rede do usuário); para cada impressora achada, `avahi-resolve -a` e `/printer/info` dão endereço
   preferido e nome. Tudo assíncrono, com guardas, numa máquina de estados pura.
3. **Painel**: uma tela de cadastro no mesmo painel (busca, resultados com Add/Added, formulário por
   endereço com `TextField`, remover com confirmação, Back); o painel vazio abre direto nela.

Detalhes em [research.md](./research.md).

## Technical Context

**Language/Version**: QML (Qt 6, Quickshell 0.3.1 do `omarchy-shell`, omarchy 4.0.4-1) e JavaScript
ES5+ em `Model.js`

**Primary Dependencies**: `qs.Ui` (agora também `TextField`), `qs.Commons`, `Quickshell.Io`;
binários `curl`, `omarchy-launch-browser`, `notify-send` e, novos, `omarchy-shell` (omarchy), `ip`
(iproute2), `avahi-browse`/`avahi-resolve` (avahi, opcionais)

**Storage**: a configuração do shell, gravada pelo próprio shell; nada no plugin

**Testing**: `node --test tests/` (novo `tests/printer-setup.test.js`); fixtures de `ip -j`,
`avahi-browse -p`, saída da verificação, `/printer/info` e respostas do `omarchy-shell`; `omarchy
plugin validate`; `qmllint`; teste ao vivo com o usuário (busca real, adicionar e remover com backup
do `shell.json`)

**Target Platform**: Omarchy Quattro (Arch Linux + Hyprland), `omarchy-shell`

**Project Type**: plugin de desktop (bar-widget) de pasta única

**Performance Goals**: busca completa em até 30 s (medido: verificação em 4 s); no máximo um
processo `curl` para a verificação inteira

**Constraints**: só GET de leitura na busca; só a pedido; nenhuma escrita de arquivo pelo plugin;
nenhuma cor ou dimensão fixa

**Scale/Scope**: redes /24 diretamente ligadas; uma tela nova no painel

Nenhum item ficou como NEEDS CLARIFICATION.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Status | Como o plano atende |
|-----------|--------|---------------------|
| I. Runtime do Omarchy | ✅ | Configuração continua inline na entrada do widget; gravada pelo método do shell que o `omarchy bar set` usa. Nada de kind ou entry point novo. |
| II. Shell nunca bloqueia | ✅ | `ip`, `avahi-browse`, `avahi-resolve`, `curl` e `omarchy-shell` como `Process` assíncronos com guarda; a verificação inteira é um processo. |
| III. Mínimo privilégio | ✅ | Binários novos listados e justificados no README (R9); nenhuma escrita de arquivo pelo plugin; a busca só lê e só a pedido; nada de `sudo`. |
| IV. Degradação graciosa | ✅ | Sem avahi: só verificação, com aviso; sem `ip`: só anúncio, com aviso; falha ao gravar: motivo no painel e a lista não muda. |
| V. Lógica pura testável | ✅ | Parse de `ip`/`avahi`/verificação/`printer/info`, máquina da busca, montagem da lista nova e do comando de gravação em `Model.js`, com testes e fixtures. |
| VI. Validação obrigatória | ✅ | Gates por tarefa; ciclo de vida (quickstart §4). |
| VII. Hardware real | ✅ | Busca na rede real achando a Voron e a Biqu; adicionar e remover com elas (quickstart §5). |
| VIII. Visual nativo | ✅ | `Button`, `TextField`, `ConfirmDialog`, `PanelSeparator` e tokens do shell. |

**Resultado pré-pesquisa**: aprovado, sem violações.

**Re-check pós-design (Phase 1)**: aprovado. Pontos de atenção para as tarefas:
- o teste "setupCommand is the exact command shown in the empty panel" (`tests/panel.test.js`) sai
  de propósito com a função (FR-009);
- `buildPanelModel` ganha o estado da tela de cadastro e da busca; os testes atuais dele não mudam
  (sem os parâmetros novos, tudo igual);
- testar a gravação de verdade mexe no `shell.json` do usuário: backup antes e conferência depois;
- widget mais de uma vez na mesma barra: adicionar/remover indisponíveis com aviso (nota na spec,
  R1);
- a varredura real da rede só roda quando o usuário (ou o teste combinado com ele) pede.

## Project Structure

### Documentation (this feature)

```text
specs/009-printer-setup/
├── plan.md              # Este arquivo
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── model-api.md       # Model.js
│   ├── display.md         # tela de cadastro
│   └── commands.md        # ip, avahi, curl da verificação, omarchy-shell
├── checklists/
│   └── requirements.md
├── hardware-test.md     # criado no teste em hardware
└── tasks.md             # Phase 2 (/speckit-tasks; não criado aqui)
```

### Source Code (repository root = pasta do plugin)

```text
io.github.brunorzm.omaklippy/
├── manifest.json        # version 0.9.0
├── Model.js             # + TEXT.setup; redes, verificação, anúncio, nome; máquina da busca;
│                        #   lista nova (adicionar/remover), comando de gravação e resposta;
│                        #   conferência do endereço digitado; buildSetupModel; − setupCommand
├── BarWidget.qml        # + processos da busca, da conferência e da gravação; seleção pendente
├── Panel.qml            # + tela de cadastro (busca, resultados, formulário, remover, Back);
│                        #   painel vazio abre nela
├── README.md            # + cadastro e busca; binários novos; − comando para copiar
└── tests/
    ├── printer-setup.test.js      # novo
    ├── panel.test.js              # − teste do setupCommand
    └── fixtures/                  # + ip-addr.synthetic, avahi-moonraker.synthetic,
                                   #   scan.synthetic, printer-info-voron (real, reduzido),
                                   #   set-widget-ok, set-widget-error.synthetic
```

**Structure Decision**: mesma pasta única; nenhum arquivo novo no runtime.

## Complexity Tracking

Nenhuma violação da constituição a justificar.
