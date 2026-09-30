# Data Model: Abrir a interface web da impressora pelo painel

Complementa os data models das fatias [001](../001-printer-status-bar/data-model.md) e
[002](../002-panel-print-actions/data-model.md). Só o que muda está aqui. Tudo continua em
memória; o único dado persistido é o campo opcional `webUrl`, escrito pelo usuário no
`shell.json`.

## Entrada de impressora na configuração (`settings.printers[i]`)

| Campo | Tipo | Novo? | Regra |
|-------|------|-------|-------|
| `name` | string | não | como na 001 |
| `address` | string | não | como na 001 (endereço do Moonraker) |
| `webUrl` | string, opcional | **sim** | endereço da interface web; mesmas formas de `address` (`host`, `host:porta`, `http(s)://host[:porta][/caminho]`). Ausente, não string ou vazio depois de `trim` → endereço derivado |

Exemplo:

```json
[
  { "name": "Voron", "address": "voron.local" },
  { "name": "Ender", "address": "192.168.1.51:7125" },
  { "name": "Lab", "address": "lab.local:7130", "webUrl": "http://lab.local:8080" }
]
```

Endereços abertos: `http://voron.local`, `http://192.168.1.51`, `http://lab.local:8080`.

## `PrinterConfig` (saída de `normalizePrinters`): campo novo

| Campo | Tipo | Regra |
|-------|------|-------|
| `webUrl` | string | endereço efetivo da interface web, ou `""` quando não há endereço válido |

Cálculo (FR-005 a FR-007):

| Entrada | `webUrl` |
|---------|----------|
| `webUrl` informado e válido | `normalizeAddress(webUrl)`, como está (porta 7125 explícita **não** é retirada) |
| `webUrl` informado e inválido (`"a b"`, `"ftp://x"`) | `""` (só o botão some; `baseUrl`, status e comandos não mudam) |
| sem `webUrl` | `deriveWebUrl(baseUrl)` |
| sem `webUrl` e `address` inválido | `""` |

`key`, `baseUrl`, `invalidReason` e `displayName` não mudam. Uma impressora com `address`
inválido e `webUrl` válido continua "offline: invalid address" e mostra o botão.

### `deriveWebUrl(baseUrl)`

| `baseUrl` | Resultado |
|-----------|-----------|
| `http://voron.local` | `http://voron.local` |
| `http://192.168.1.51:7125` | `http://192.168.1.51` |
| `https://p.lan:7125/x` | `https://p.lan/x` |
| `http://p.lan:8080` | `http://p.lan:8080` |
| `http://h/mainsail` | `http://h/mainsail` |
| `http://h:71250` (inválido na normalização) / `""` | `""` |

## `PrinterCommands`: slot novo `web`

| Campo | Tipo | Regra |
|-------|------|-------|
| `busy` | `CommandSlot \| null` | como na 002 (Pause/Resume/Cancel) |
| `estop` | `CommandSlot \| null` | como na 002 |
| **`web`** | `CommandSlot \| null` | abertura da interface web em andamento (`action: "openWebUi"`) |
| `failure` | `CommandFailure \| null` | como na 002; também recebe a falha da abertura |
| `seq` | number | contador comum aos três slots |

`emptyCommands()` → `{ busy: null, estop: null, web: null, failure: null, seq: 0 }`.

### Regras (`planOpenWeb`)

- Recusa (devolve o mesmo `commands`, `request: null`) quando: impressora inválida como objeto,
  `webUrl === ""`, ou `web` ocupado.
- **Não** olha `busy` nem `estop` (FR-014), e `planCommand` continua sem olhar `web`.
- Aceita: `seq + 1`, `web = { action: "openWebUi", seq, startedAt: now }`, `failure = null`.

### Transições

```text
web: null ──planOpenWeb──▶ { action: openWebUi, seq } ──acceptCommandResult(seq)──▶ null
                                                        ├─ ok     → failure = null, painel fecha
                                                        └─ falha  → failure = "Open web UI failed: <motivo>"
```

Resultado com `seq` diferente do slot → ignorado (mesma regra da 002).

## `WebLaunchResult` (`parseWebLaunchResult(exitCode, launched)`)

| Situação | Resultado |
|----------|-----------|
| saiu com 0 | `{ ok: true, message: "" }` |
| não chegou a iniciar (`launched === false`) | `{ ok: false, message: "omarchy-launch-browser not found" }` |
| saiu com código ≠ 0 | `{ ok: false, message: "browser launcher exited with code N" }` |
| guarda de 10 s (QML passa `exitCode = -2`, `launched = true`) | `{ ok: false, message: "no answer from the browser launcher" }` |

## `ActionsModel`: botão novo

`buildActionsModel(printer, status, printerCommands)` ganha o campo `web`:

```text
web: {
  id: "openWebUi", label: "Open web UI", glyph: ACTION_GLYPHS.openWebUi,
  confirm: false, urgent: false,
  busy: printerCommands.web !== null,
  enabled: planOpenWeb(...) aceitaria agora
} | null   // null quando printer.webUrl === ""
```

O modelo vazio (sem impressora ou sem status) é
`{ buttons: [], primary: [], emergency: null, web: null, failureText: "", filename: "" }`: a
chave `web` sempre existe.

`web` também entra em `buttons` (último item), mas **não** em `primary` nem em `emergency`.
O botão existe em qualquer estado (`printing`, `paused`, `idle`, `error`, `offline`), inclusive
com `status.state` de impressora de endereço inválido.

## Cursor do painel

`cursorStops(panelModel)`: `printer` (se houver dropdown) → `primary` habilitados →
`emergencyStop` habilitado → **`openWebUi` habilitado** (última parada, FR-004).
