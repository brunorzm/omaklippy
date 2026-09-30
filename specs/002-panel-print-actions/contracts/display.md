# Contract: exibição (botões de ação, confirmação, teclado)

Complementa o [contrato de exibição da fatia 001](../../001-printer-status-bar/contracts/display.md).
O ícone na barra, o tooltip e o IPC não mudam (FR-017). Tudo usa `qs.Ui` e tokens de
`qs.Commons` (Princípio VIII). O conteúdo vem de `panelModel.actions`
([model-api.md](./model-api.md#buildactionsmodelprinter-status-printercommands--actionsmodel)).

## Posição no painel

Os botões ficam abaixo das temperaturas e acima da linha "updated … ago", separados por um
`PanelSeparator`. A seção inteira só aparece quando há botões ou `failureText`.

**Imprimindo**

```text
│ Nozzle                  215/215 °C   │
│ Bed                       60/60 °C   │
├──────────────────────────────────────┤
│ [ ⏸ Pause      ] [ ■ Cancel       ]  │  linha primary: Button bordered, largura dividida
│                                      │  espaço Style.space(12)
│ [ ⚠ Emergency stop                 ] │  linha própria, largura total, fundo urgent
│ ⚠ Pause failed: connection refused   │  failureText (glifo urgent + texto foreground, bodySmall)
│ updated <1 min ago                   │
```

| Estado | Linha primary | Linha de emergência |
|--------|---------------|---------------------|
| imprimindo | Pause, Cancel | Emergency stop |
| pausada | Resume, Cancel | Emergency stop |
| ociosa | — | Emergency stop |
| erro, offline, sem impressoras | — | — (só `failureText`, se houver) |

> **Fatia 003**: esta tabela foi substituída pela do [display.md da 003](../../003-open-web-ui/contracts/display.md#posição-no-painel-fr-003) (FR-013 da 003): o botão Open web UI aparece em todos os estados, inclusive erro e offline, sempre que a impressora tem endereço de interface web.

> **Fatia 007**: em erro com o Klipper em `shutdown`/`error`, a linha primary mostra "Restart firmware" ([display.md da 007](../../007-firmware-restart/contracts/display.md#posição-no-painel-fr-009)).

## Botões

`Button` (`qs.Ui`) com `bordered: true`, `iconText` = glifo da ação, `text` = rótulo,
`fontFamily` e `foreground` do bar, `fontSize: Style.font.bodySmall`, padding de
`Style.spacing.*`, como a linha de perfis do painel de energia.

| Propriedade | Regra |
|-------------|-------|
| `foreground` | `bar.foreground` em todos, inclusive Emergency stop |
| `background` | Emergency stop habilitado: `Util.alpha(bar.urgent, 0.22)` (o tom do botão destrutivo do `ConfirmDialog`); os demais e o e-stop desabilitado: transparente (FR-006). Revisão de 2026-09-29: com `urgent` cinza (tema Solitude), texto em `urgent` deixava o e-stop disponível igual a um botão desabilitado |
| `enabled` | `button.enabled` do modelo; desabilitado também recebe opacidade reduzida (constante relativa, como `pausedFillOpacity`) |
| `iconText` / `iconSpinning` | Em andamento (`button.busy`): glifo `busy` girando; rótulo mantido |
| `hasCursor` | `cursorStop === button.id` |
| `onHovered(true)` | `cursorStop = button.id` (só se habilitado) |
| `onClicked` | `activate(button.id)` |

`activate(id)`: ignora `id` fora de `cursorStops(panelModel)` (botão sumido ou desabilitado) e
ação com confirmação cujo `confirmLabel(id)` é `""` (proteção enquanto o texto não existe). Senão, se `button.confirm`, abre a confirmação guardando a impressora
(`confirmAction = id`, `confirmKey = selected.key`); senão chama
`hostWidget.runAction(selected.key, id)`. A chave vai junto para o alvo nunca mudar por baixo
(FR-011). O `BarWidget` revalida com `planCommand` para essa impressora; se recusar, nada
acontece.

## Confirmação

`ConfirmDialog` (`qs.Ui`) filho do `PanelKeyCatcher`, irmão do `Flickable`, `anchors.fill: parent`,
`z` acima do conteúdo, com as cores e a fonte do bar.

| Propriedade | Cancel | Emergency stop |
|-------------|--------|----------------|
| `message` | `Cancel the print "hook.gcode" on Voron?` | `Emergency stop Voron? Klipper will shut down until a firmware restart.` |
| `cancelText` | Back | Back |
| `confirmText` | Cancel print | Stop |
| `selectedIndex` ao abrir | **0 (Back)** | **0 (Back)** |

- Confirmar → `hostWidget.runAction(confirmKey, confirmAction)` e zera `confirmAction`/`confirmKey`.
- Desistir (Back, Escape, clique no fundo) → `confirmAction = ""`, nada é enviado.
- Fecha sozinho, sem enviar: painel abre/fecha; a impressora **resolvida** (`selected.key`)
  deixa de ser `confirmKey`, seja pelo dropdown (FR-016) ou pela seleção automática; o botão da
  ação sumiu de `actions.buttons` **ou** ficou `enabled: false`.
- Teclas: o `focusTarget` do `KeyboardPanel` continua sendo o `PanelKeyCatcher`. Com o diálogo
  aberto ele fica `blocked`, não aceita a tecla e ela sobe para o pai: um `Item` que envolve o
  `PanelKeyCatcher` e, no `Keys.onPressed`, repassa para `confirm.handleKey(event)` e aceita o
  evento (Escape incluído, para não fechar o painel). Fechado, esse `Item` não faz nada.

## Teclado

| Entrada | Efeito |
|---------|--------|
| j / ↓ / l / → | primeira vez: cursor na primeira parada; depois, próxima parada (`stepCursor +1`) |
| k / ↑ / h / ← | parada anterior (`stepCursor −1`) |
| Enter / Espaço no dropdown | abre o menu "Printer" (fatia 001) |
| Enter / Espaço num botão | `activate(id)` |
| Escape | fecha o painel (o menu do dropdown e a confirmação consomem o primeiro Escape) |
| Tab / Shift+Tab | painel vizinho (fatia 001) |
| **com a confirmação aberta**: ← / → / Tab | alterna Back ↔ confirmar |
| **com a confirmação aberta**: Enter | aciona o botão selecionado (Back ao abrir) |
| **com a confirmação aberta**: Escape | desiste |

Paradas: `cursorStops(panelModel)`: dropdown (se existe) e botões habilitados, na ordem de
leitura. Botão que some ou fica desabilitado leva o cursor para a primeira parada. O cursor
some ao abrir o painel, como na fatia 001.

## Interações com o ícone e outras instâncias

- O ícone continua sem botões e sem menu de ações (FR-017).
- Cada painel (um por monitor) mostra só os próprios comandos e falhas; o estado da impressora
  vem sempre da consulta.
- Fechar o painel não interrompe um comando; o ícone reflete o resultado pelo estado real.
