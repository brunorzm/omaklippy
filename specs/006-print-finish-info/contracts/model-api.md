# Contract: `Model.js` (funções novas e alteradas) e exibição

Complementa os contratos das fatias 001–005. Regras gerais inalteradas. Tipos em
[../data-model.md](../data-model.md).

## Textos novos em `TEXT`

```text
panel.ends: "Ends"
panel.layer: "Layer"
finish: {
  tomorrow: "tomorrow %1",
  days: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
}
left: "%1 left"
```

## Leitura, status e estimativa

- `parseResponse` (alterada): `currentLayer`, `totalLayer` de `print_stats.info`.
- `initialStatus` / `applyReading` (alteradas): os dois campos no status.
- `parseMetadataLayers(stdout, exitCode) → number | null` (nova).
- `planEstimate` (alterada): o `estimate` pendente ganha `layerCount: null`.
- `acceptEstimate(statuses, key, seq, filename, seconds, layerCount)` (alterada): parâmetro
  opcional `layerCount` (ausente/inválido → `null`).

## Exibição

- `formatFinish(finishMs, nowMs) → string` (nova), pela tabela do data model.
- `tooltipLine(printer, status) → string` (nova).
- `buildIconState` (alterada): `tooltip` via `tooltipLine`.
- `detailFor` (alterada): `finishText`, `layerText`.

## Exportações novas

`parseMetadataLayers`, `formatFinish`, `tooltipLine`.

## `BarWidget.qml`

O `estimateComponent` da 005 passa `Model.parseMetadataLayers(output, exitCode)` como
`layerCount` ao `acceptEstimate`. Nada mais muda (o tooltip já vem de `iconState.tooltip`).

## `Panel.qml`

No bloco da impressão, depois de `Remaining`:

```text
│ Remaining                    26m     │
│ Ends                       16:52     │  InfoRow, visível com finishText
│ Layer                      12/62     │  InfoRow, visível com layerText
```
