# Contract: `Model.js` (funções novas e alteradas)

Complementa os contratos das fatias [001](../../001-printer-status-bar/contracts/model-api.md) e
[002](../../002-panel-print-actions/contracts/model-api.md). Regras gerais inalteradas: funções
puras, sem relógio, nunca lançam exceção, devolvem o **mesmo** objeto quando nada muda, e todo
texto visível fica em `TEXT` (inglês; o teste que proíbe português cobre as chaves novas). Tipos
em [../data-model.md](../data-model.md).

## Textos novos em `TEXT`

```text
actions.openWebUi: "Open web UI"
launcherNotFound: "omarchy-launch-browser not found"
launcherExitCode: "browser launcher exited with code %1"
launcherTimeout: "no answer from the browser launcher"
```

Falha exibida: `fill(TEXT.actionFailed, TEXT.actions.openWebUi, motivo)` →
`Open web UI failed: omarchy-launch-browser not found`.

## Constantes

- `ACTION_GLYPHS.openWebUi = "\u{f03cc}"` (nf-md-open_in_new).
- `WEB_LAUNCH_TIMEOUT_SEC = 10`.
- `MOONRAKER_DEFAULT_PORT = 7125` (só para `deriveWebUrl`).
- `ACTIONS` **não** ganha `openWebUi`: não é um `POST` ao Moonraker, e `isAction`/`planCommand`
  continuam recusando esse id.

## Endereço

### `deriveWebUrl(baseUrl) → string`

Tabela em [data-model.md](../data-model.md#deriveweburlbaseurl). Retira `:7125` só quando é a
porta exata logo depois do host; mantém esquema e caminho. Entrada não string ou `""` → `""`.

### `normalizePrinters(list)` (alterada)

Acrescenta `webUrl` a cada item, pela tabela de
[data-model.md](../data-model.md#printerconfig-saída-de-normalizeprinters-campo-novo). Os demais
campos, a ordem e a `key` não mudam. `readSettings` herda o campo sem mudança própria.

## Abertura

### `emptyCommands()` (alterada)

`{ busy: null, estop: null, web: null, failure: null, seq: 0 }`.

### `planOpenWeb(commands, printer, now) → { commands, request }`

- Recusa → `{ commands: <mesmo objeto>, request: null }` pelas regras do data model.
- Aceita → `request = { key, seq, args: buildWebLaunchArgs(printer.webUrl),
  guardMs: WEB_LAUNCH_TIMEOUT_SEC * 1000 }`.

### `buildWebLaunchArgs(url) → string[]`

`["omarchy-launch-browser", url]`; `url` não string ou `""` → `[]`. Sem shell.

### `parseWebLaunchResult(exitCode, launched) → { ok, message }`

Tabela `WebLaunchResult` do data model. `exitCode === -2` (guarda) vem antes de "≠ 0".

### `acceptCommandResult(commands, key, seq, result)` (alterada)

Procura o `seq` em `busy`, `estop` **e `web`**. Rótulo da falha: `TEXT.actions[action]`, então
`openWebUi` vira "Open web UI". Resto igual à 002.

### `planCommand` (inalterada, com teste novo)

Com `web` ocupado, Pause/Resume/Cancel/Emergency stop continuam sendo aceitos (FR-014).

### `reconcileCommands`, `clearFailures` (inalteradas)

Já cobrem o slot novo: trabalham com a entrada inteira da impressora.

## Painel

### `buildActionsModel(printer, status, printerCommands)` (alterada)

- Campo novo `web` (ou `null`) e botão `openWebUi` no fim de `buttons`, pelo data model.
- `primary`, `emergency`, `failureText` e `filename` inalterados.

### `cursorStops(panelModel)` (alterada)

`openWebUi` depois de `emergencyStop`, só se `actions.web.enabled`.

### `buildPanelModel` (inalterada)

Já repassa o `ActionsModel`; o botão aparece com a impressora em erro, offline ou com endereço
inválido porque `statusFor` sempre devolve um status.

## Exportações novas em `module.exports`

`ACTION_GLYPHS` (já exportado, ganha a chave), `WEB_LAUNCH_TIMEOUT_SEC`, `deriveWebUrl`,
`planOpenWeb`, `buildWebLaunchArgs`, `parseWebLaunchResult`.
