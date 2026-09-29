# Contract: exibição (ícone, painel, interações, IPC)

A barra mostra só o ícone. Os detalhes ficam num painel no padrão dos painéis nativos de Wi-Fi e
Tailscale. Todo o visual usa componentes de `qs.Ui` e tokens de `qs.Commons` (Princípio VIII).
O conteúdo vem de `Model.buildIconState` e `Model.buildPanelModel` ([model-api.md](./model-api.md)).

## Rótulos dos estados

| `state` | Rótulo |
|---------|--------|
| `printing` | printing |
| `paused` | paused |
| `idle` | idle |
| `error` | error |
| `offline` | offline |

## Ícone na barra

`BarIconButton` com `iconComponent`: o glifo de impressora 3D da fonte de ícones do bar (uma
constante em `Model.js`) e, quando há progresso, uma barra fina horizontal logo abaixo do glifo,
dentro de `Style.bar.iconCanvas`. Sem texto em nenhum estado (FR-001). O ícone representa a
impressora escolhida no painel nesta sessão ou, sem escolha, a de `pickHighlighted` (FR-002).

| `mode` | Glifo | Barra de progresso | Botão |
|--------|-------|--------------------|-------|
| `empty` | cor do bar | não | normal |
| `idle` | cor do bar | não | normal |
| `printing` | cor do bar | trilho `Util.alpha(barForeground, baixa)` + preenchimento `barForeground` proporcional a `progress` | normal |
| `paused` | cor do bar | mesma barra, preenchimento em opacidade reduzida (distingue de imprimindo) | normal |
| `error` | `urgent` do tema + selo circular no canto superior direito (mesma cor, contorno no fundo do bar) | não | normal |
| `offline` | cor do bar | não | `dimmed: true` |

- A espessura da barra e o espaçamento vêm de `Style.space()`; nenhuma dimensão ou cor é fixa.
- O selo de erro existe porque alguns temas definem `urgent` próximo da cor do bar (no tema em
  uso durante a implementação, `urgent` era `#565d60`), o que deixaria erro e offline quase
  iguais. A forma garante a distinção sem cor fixa (Princípio VIII).
- Em barra vertical, o slot é o mesmo (`Style.bar.iconSlot`) e a barra de progresso continua
  horizontal sob o glifo.
- Tooltip (`tooltipText`), com uma linha só: `Voron — printing 42%`, `Voron — paused 42%`,
  `Voron — idle`, `Voron — error`, `Voron — offline`, ou
  `OmaKlippy — no printers configured`.
- O item aparece sempre, mesmo sem impressoras, como porta de entrada para o painel (as
  instruções de cadastro ficam lá).

## Painel

`Panel.qml`: `Panel` (qs.Ui, `manageIpc: false`) → `KeyboardPanel` ancorado no botão do ícone →
`PanelKeyCatcher` → `Flickable` → `Column`. A largura segue os painéis nativos
(`fittedContentWidth(Style.space(360))`).

**Impressora imprimindo (várias cadastradas)**

```text
┌──────────────────────────────────────┐
│ [G]  Voron                           │  PanelHero: título = nome
│      printing · 42%                │             meta = estado · %
├──────────────────────────────────────┤
│ ▓▓▓▓▓▓▓▓░░░░░░░░░░░  42%             │  progresso (só imprimindo/pausada)
│ hook.gcode                           │
│ Remaining  1h 02m                     │
│                                      │
│ Nozzle 215 / 215 °C                  │
│ Bed     60 / 60 °C                   │
│ updated <1 min ago                 │
│                                      │
│ PRINTERS                             │  PanelSectionHeader (só se > 1)
│ ● Voron                  printing 42%│  linha selecionada
│   Ender (192.168.1.51)          idle │
│   Ender (ender.local)        offline │
└──────────────────────────────────────┘
```

**Variações do bloco de detalhe**

| Estado | Mostra | Omite |
|--------|--------|-------|
| imprimindo / pausada | progresso, %, arquivo, restante (ou "—"), temperaturas, atualizado há | — |
| ociosa | temperaturas, atualizado há | progresso, arquivo, restante |
| erro | motivo em `PanelHero.detail`; temperaturas se vierem na resposta | progresso, arquivo, restante |
| offline | motivo e "no response for X min" | progresso, arquivo, restante, temperaturas |

Antes da primeira resposta: offline, com o motivo "waiting for first response".

**Sem impressoras**: `PanelHero` com "OmaKlippy" / "no printers configured", o texto "Add a printer with:" e o comando
de cadastro de [settings.md](./settings.md#como-o-usuário-cadastra-documentado-no-readme) em
texto selecionável.

**Ações**: nenhum botão nesta fatia (FR-021). O fim do painel fica reservado para a linha de
ações da fatia 002.

## Interações

| Entrada | Efeito |
|---------|--------|
| hover no ícone | tooltip de uma linha (atraso do shell, 400 ms) |
| clique esquerdo no ícone | abre ou fecha o painel |
| clique do meio / direito no ícone | nada nesta fatia |
| Escape / clique fora | fecha o painel |
| j/k ou setas no painel | move o cursor na lista de impressoras |
| Enter / clique numa linha | seleciona a impressora (`selectedKey`) e atualiza o detalhe |
| Tab / Shift+Tab | passa para o painel vizinho do bar (`switchPanel`), como nos painéis nativos |
| `omarchy-shell shell summon io.github.brunorzm.omaklippy '{}'` | abre o painel |
| `omarchy-shell shell hide io.github.brunorzm.omaklippy` | fecha o painel |

## IPC

Target `io.github.brunorzm.omaklippy`:

| Método | Efeito |
|--------|--------|
| `refresh()` | Ciclo imediato em todas as instâncias (`broadcast`), respeitando uma requisição em voo por impressora. |

Abrir e fechar o painel é feito pelo `summon`/`hide` do shell (tabela acima), que escolhe a
instância certa. Um `open()` próprio com `broadcast` abriria o painel em todos os monitores.

```bash
omarchy-shell io.github.brunorzm.omaklippy refresh
```
