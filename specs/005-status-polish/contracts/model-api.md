# Contract: `Model.js` (funções novas e alteradas)

Complementa os contratos das fatias 001–004. Regras gerais inalteradas (puras, sem relógio, nunca
lançam, mesmo objeto quando nada muda, textos em `TEXT`). Tipos em
[../data-model.md](../data-model.md).

## Leitura e status

- `parseResponse` (alterada): `displayMessage` (R1).
- `initialStatus` / `applyReading` (alteradas): `message`, `progress`, `printDuration`, `estimate`
  pelo data model.

## Estimativa do fatiador

### `buildMetadataArgs(baseUrl, filename, timeoutSec) → string[]`

`buildCurlArgs(baseUrl + "/server/files/metadata?filename=" + encodeURIComponent(filename),
timeoutSec)`; `baseUrl` ou `filename` vazio → `[]`.

### `parseMetadataResponse(stdout, exitCode) → number | null`

Via `readTransport`: HTTP 2xx com `result.estimated_time` finito `> 0` → o número; qualquer outra
coisa → `null`. Nunca lança.

### `planEstimate(statuses, printers, timeoutMs) → { statuses, requests }`

Para cada impressora válida com `hasJob(state)`, `filename !== ""` e `estimate` ausente ou de
outro arquivo: `estimate = { filename, seconds: null, pending: true, seq: (anterior + 1) }` e um
pedido `{ key, seq, filename, args: buildMetadataArgs(...) }`. Nada a pedir → o mesmo objeto
`statuses` e `requests: []`.

### `acceptEstimate(statuses, key, seq, filename, seconds) → statuses`

Com `estimate` pendente, mesmo `seq` e mesmo `filename`: `seconds` gravado (ou `null`) e `pending:
false`. Senão, o mesmo objeto.

## Tempo restante

### `blendRemaining(progressRemaining, slicerTotal, printDuration, progress) → number | null`

Pela tabela do data model. `estimateRemaining` não muda.

### `detailFor` (alterada)

`messageText` e `remainingText` pelo data model.

## Exportações novas

`buildMetadataArgs`, `parseMetadataResponse`, `planEstimate`, `acceptEstimate`, `blendRemaining`.
