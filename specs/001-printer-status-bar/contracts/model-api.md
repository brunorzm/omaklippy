# Contract: `Model.js` (lógica pura)

Superfície testável da fatia (Princípio V). Regras para todas as funções:

- Puras e determinísticas: sem acesso a objetos do Quickshell, `Date.now()`, rede ou arquivos;
  quando precisam do tempo, recebem `now` (ms).
- Nunca lançam exceção: entradas malformadas (`null`, `undefined`, tipos errados, JSON inválido)
  produzem um resultado válido e degradado.
- O arquivo não usa `.pragma library` e termina com
  `if (typeof module !== "undefined") module.exports = { ... }`, convenção dos modelos
  first-party, para o QML (`import "Model.js" as Model`) e o Node (`require`) usarem o mesmo
  arquivo.

Tipos referenciados em [../data-model.md](../data-model.md).

## Configuração

### `readSettings(settings) → { printers: PrinterConfig[], intervalMs, timeoutMs }`

- Aplica padrões e limites de `WidgetSettings` (intervalo 5 s em [2, 3600]; timeout 3 s em
  [1, 30]).
- `printers` passa por `normalizePrinters`.

### `normalizeAddress(text) → string`

Retorna a URL base, ou `""` se o endereço for inválido.

| Entrada | Saída |
|---------|-------|
| `"192.168.1.50"` | `"http://192.168.1.50"` |
| `"voron.local:7125"` | `"http://voron.local:7125"` |
| `"http://voron.local/"` | `"http://voron.local"` |
| `"https://p.lan:8443"` | `"https://p.lan:8443"` |
| `"  voron  "` | `"http://voron"` (espaços nas pontas são removidos) |
| `""`, `"ftp://x"`, `"a b"`, `"http://"`, `"host:abc"`, `"host:70000"` | `""` |

Caminhos depois do host (`http://h/mainsail`) são mantidos sem a `/` final.

### `normalizePrinters(list) → PrinterConfig[]`

- Ignora itens que não são objeto ou não têm `address` string.
- Preenche `key`, `order`, `baseUrl`, `invalidReason` e `displayName` (via `disambiguateNames`).
- Nome vazio → host da URL (ou o texto cru do endereço, se inválido).

### `disambiguateNames(printers) → printers`

Se dois ou mais itens têm o mesmo `name` (comparação sem diferenciar maiúsculas e ignorando
espaços nas pontas), o `displayName` de cada um vira `"<name> (<host[:porta]>)"`; nomes únicos
ficam como estão.

## Requisição

### `buildQueryUrl(baseUrl) → string`

`baseUrl + "/printer/objects/query?webhooks&print_stats&virtual_sdcard&display_status&extruder=temperature,target&heater_bed=temperature,target"`

### `buildCurlArgs(url, timeoutSec) → string[]`

`["curl", "-sS", "--connect-timeout", T, "--max-time", T, "-H", "Accept: application/json", "-w", "\n%{http_code}", url]`,
com `T = String(timeoutSec)`. Não usa shell, então não há interpolação nem quoting.

## Resposta

### `parseResponse(stdout, exitCode) → Reading`

Primeiro o código de saída do curl, depois o código HTTP (a última linha do stdout, gerada pelo
`-w`; vale `000` quando não houve resposta):

| curl `exitCode` | Resultado |
|-----------------|-----------|
| `0` | Segue para o código HTTP. |
| `3` | `reachable:false`, "endereço inválido" |
| `6` | `reachable:false`, "host não encontrado" |
| `7` | `reachable:false`, "conexão recusada" |
| `28` | `reachable:false`, "sem resposta (tempo limite)" |
| `-1`, `127` ou processo que não iniciou | `reachable:true`, `httpStatus:0`, "curl não encontrado" → estado `error` (Princípio IV) |
| outro ≠ 0 | `reachable:false`, `"falha de rede (curl <código>)"` |

| HTTP | Resultado |
|------|-----------|
| `200` com `result.status` objeto | Preenche `klippyState`, `printState`, `progress`, `printDuration`, `filename`, `nozzle`, `bed`. |
| `200` sem `result.status`, ou corpo não-JSON | `errorMessage` "resposta inesperada". |
| `401` / `403` | "acesso não autorizado — libere este computador em trusted_clients" |
| outro ≥ 400 | `errorMessage` = `error.message` do corpo, ou `"HTTP <código>"`. |

Campos ausentes na resposta viram `null`/`""`. Números não finitos viram `null`.

### `deriveState(reading) → { state, reason }`

Avaliada nesta ordem (research R3):

1. `!reachable` → `offline`, `reason = errorMessage`.
2. `errorMessage` não vazio → `error`.
3. `klippyState !== "ready"` → `error`; `reason` = `state_message` ou `"Klipper: <estado>"`.
4. `printState`: `printing` → `printing`; `paused` → `paused`; `error` → `error`
   (`print_stats.message`); `standby` / `complete` / `cancelled` / `""` → `idle`.

### `computePercent(state, progress) → integer | null`

- `null` se `state` não é `printing`/`paused` ou se `progress` não é número.
- Senão, `Math.min(99, Math.floor(clamp(progress, 0, 1) * 100))`.
- Casos: `0.427 → 42`, `0.999 → 99`, `1 → 99`, `-0.1 → 0`.

### `estimateRemaining(state, progress, printDuration) → seconds | null`

- `null` fora de `printing`/`paused`, com `progress < 0.01`, `printDuration <= 0` ou entradas
  não numéricas.
- Senão, `Math.max(0, printDuration / progress - printDuration)`.

### `applyReading(prev, reading, now) → PrinterStatus`

Transições em [../data-model.md](../data-model.md#transições). Em `offline`: limpa
`percent`, `remainingSec`, `filename`, `nozzle` e `bed` (FR-009) e preserva `offlineSince` se já
estava offline.

## Motor de consulta

Estas funções tiram do QML toda a decisão de estado do polling (Princípio V). `statuses` é um
objeto `{ [key]: PrinterStatus }`. Nenhuma delas altera a entrada: sempre devolvem um objeto novo,
ou o **mesmo** objeto quando não há mudança, para o QML poder comparar por identidade.

### `initialStatus(key) → PrinterStatus`

`{ key, state: "offline", reason: "aguardando primeira resposta", percent: null,
remainingSec: null, filename: "", nozzle: null, bed: null, lastSeenAt: null,
offlineSince: null, pending: false, seq: 0 }`

### `reconcileStatuses(statuses, printers) → statuses`

- Chave presente em `printers` e em `statuses` → mantém o status.
- Chave nova → `initialStatus(key)`; se a impressora tem `invalidReason`, o status é offline com
  esse motivo.
- Chave em `statuses` que não está mais em `printers` → removida.

### `planDispatch(statuses, printers, timeoutMs) → { statuses, requests }`

- Para cada impressora válida (sem `invalidReason`) cujo status tem `pending: false`: `seq + 1`,
  `pending: true` e um item `{ key, seq, args: buildCurlArgs(buildQueryUrl(baseUrl), ceil(timeoutMs/1000)) }`
  em `requests`.
- Impressoras pendentes ou inválidas não geram requisição.

### `acceptResult(statuses, key, seq, reading, now) → statuses`

- Aplica `applyReading(status, reading, now)` e marca `pending: false` **somente** se a chave
  existe, `status.pending === true` e `status.seq === seq`.
- Qualquer outro caso (chave removida, seq antigo, segundo resultado com o mesmo seq, por exemplo
  o `onExited` que chega depois da guarda de timeout) → devolve `statuses` inalterado (FR-012).

## Visão

### `pickHighlighted(printers, statusesByKey) → { printer, status } | null`

Prioridade `error` > `printing` > `paused` > `offline` > `idle`; empate pela menor `order` (por
isso recebe a lista de impressoras, e não só os status). Retorna `null` para lista vazia.
Impressoras com `invalidReason` contam como `offline`.

### `resolveSelection(selectedKey, printers, statusesByKey) → string`

`selectedKey` se ainda existe em `printers`; senão a chave de `pickHighlighted`; senão `""`.

### `buildIconState(printers, statusesByKey, selectedKey) → IconState`

Modo, progresso e tooltip de uma linha da impressora escolhida no painel (`selectedKey`, se ainda
existir) ou, sem escolha, da de `pickHighlighted` (FR-002). Sem impressoras →
`{ mode: "empty", progress: null, tooltip: "OmaKlippy — nenhuma impressora configurada" }`.
Casos: imprimindo 42% → `progress 0.42`, `"Voron — imprimindo 42%"`; offline →
`progress null`, `"Voron — offline"`.

### `buildPanelModel(printers, statusesByKey, selectedKey, now) → PanelModel`

Monta o conteúdo do painel ([../data-model.md](../data-model.md#panelmodel-derivado-para-o-painel-buildpanelmodel),
[display.md](./display.md#painel)). Em `offline`, `freshnessText` é `"sem resposta há 3 min"`;
fora de offline, `"atualizado há <1 min"`. `rows` fica vazio com uma impressora só.

### `tidyMessage(text) → string`

Mensagens do Klipper chegam com quebras de linha manuais. Mantém os parágrafos separados por
linha em branco, junta as linhas dentro de cada parágrafo e reduz espaços repetidos. Não-texto →
`""`. `buildPanelModel` aplica essa função ao `reason` exibido.

### `stateLabel(state) → string`

`printing` → "imprimindo", `paused` → "pausada", `idle` → "ociosa", `error` → "erro",
`offline` → "offline".

### `formatTemp(t) → string`, `formatDuration(sec) → string`, `formatAgo(ms) → string`

- `formatTemp({current:214.8, target:215})` → `"215/215 °C"`; `target` 0 → `"25 °C"`;
  `null` → `"—"`.
- `formatDuration(3725)` → `"1h 02m"`; `59` → `"<1m"`; `null` → `"—"`.
- `formatAgo(95000)` → `"há 1 min"`; `< 60000` → `"há <1 min"`.

## Cobertura de teste exigida

Cada linha das tabelas acima é um caso de teste. Há também um teste por fixture de
[moonraker.md](./moonraker.md#fixtures), comparando o `Reading` e o `deriveState` esperados, e um
teste de "nunca lança" para cada função com entradas `null`/`undefined`/`{}`/`"lixo"`.
