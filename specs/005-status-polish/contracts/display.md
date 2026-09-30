# Contract: exibição (mensagem, tempo restante, marcador de pausa) e busca da estimativa

## Painel (`Panel.qml`)

No bloco da impressão (visível só com impressão, `showJob`), logo abaixo da linha de progresso e
acima de "File":

```text
│ ███████░░░░░░░░░░░░░░░░░░  42%       │
│ Aquecendo a Camara                   │  messageText: bodySmall, root.dim, quebra de linha
│ File                    hook.gcode   │
│ Remaining                    12m     │  remainingText (blendRemaining)
```

A linha só existe com `messageText !== ""` (FR-002). Texto puro (`Text.PlainText`), largura do
painel, `wrapMode: Text.WordWrap`.

## Ícone (`BarWidget.qml`)

Com `iconState.mode === "paused"`: duas barrinhas verticais no canto superior direito do ícone,
no lugar em que o selo de erro aparece em "error" (os estados são exclusivos).

| Propriedade | Regra |
|-------------|-------|
| altura | `Math.max(3, Style.space(6))` |
| largura de cada barra | `Math.max(1, Style.space(2))`, espaço entre elas igual à largura |
| cor | `button.markColor` (foreground do bar) |
| contorno | `Color.bar.background`, `Math.max(1, Style.space(1))`, como o selo de erro |

A barra de progresso atenuada (`pausedFillOpacity`) continua.

## Busca da estimativa (`BarWidget.qml`)

| Momento | Comportamento |
|---------|---------------|
| `dispatch(onlyKey)` | depois do `planDispatch` atual, `plan = Model.planEstimate(statuses, config.printers, config.timeoutMs)`; `statuses = plan.statuses`; cada pedido cria um `estimateComponent` em `requestHolder` (com `key`) |
| resultado | `statuses = Model.acceptEstimate(statuses, key, seq, filename, Model.parseMetadataResponse(stdout, exitCode))` |

`estimateComponent`: o mesmo esqueleto do `requestComponent` (stdout + exit code + guarda de
`timeoutMs + 1000`, resultado único). Como tem `key`, `stopRequests` o trata como as consultas.
