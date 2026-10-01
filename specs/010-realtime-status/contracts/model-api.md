# Contract: `Model.js` (fatia 010)

Mesmas regras das fatias anteriores: funções puras, nunca lançam, mesmo objeto quando nada muda,
textos em `TEXT` (inglês). Tipos em [../data-model.md](../data-model.md); mensagens em
[connection.md](./connection.md).

## Textos novos

```text
live: "live"
liveUnavailable: "Live updates unavailable: %1"
liveInstall: "install qt6-websockets"
```

## Mensagens

| Função | Contrato |
|--------|----------|
| `liveUrl(baseUrl)` | `http`→`ws`, `https`→`wss`, + `/websocket`; inválido → `""`. Casos: `http://voron.local` → `ws://voron.local/websocket`; `http://biqu.local:7125` → `ws://biqu.local:7125/websocket`; `https://x/moon` → `wss://x/moon/websocket` |
| `buildSubscribeMessage(id)` | texto JSON-RPC `printer.objects.subscribe` com os objetos da consulta de hoje |
| `parseLiveMessage(text)` | `{ kind, id, status, diff, message }`, `kind` ∈ `result`, `error`, `update`, `klippyReady`, `klippyDisconnected`, `ignore`. `notify_proc_stat_update` → `ignore` sem `JSON.parse` (pelo começo do texto). Fixtures: `ws-subscribe-voron` → `result` com `status`; `ws-update-voron` → `update` com `diff`; `ws-subscribe-error.synthetic` → `error` com `message`; `ws-klippy-*.synthetic`; `ws-proc-stat.synthetic` → `ignore`; lixo → `ignore` |
| `mergeStatus(prev, diff)` | por objeto, os campos do `diff` sobre os de `prev`; objetos novos entram; `prev` intacto |
| `isUrgentDiff(diff)` | `true` quando toca `webhooks` ou `print_stats.state` |
| `readingFromStatus(status)` | a leitura que `parseResponse` monta de `result.status`, com `httpStatus: 200`, `reachable: true`; `parseResponse` passa a usá-la |

## Máquina da conexão

| Função | Contrato |
|--------|----------|
| `emptyLive(url)` | `{ state: "idle", url, attempt: 0, retryAt: null, lastFrameAt: null, subscribeId: 0, buffer: null, dirty: false, urgent: false }` |
| `reconcileLives(lives, printers, now)` | uma entrada por impressora com `liveUrl` não vazio; as que saem somem; `url` mudou → nova |
| `liveTick(lives, now)` | `{ lives, actions }`: `open` para `idle`/`waiting` vencidos; `ping` a cada 5 s em `subscribed`; `close` + `waiting` com 10 s sem quadro |
| `liveOpened(lives, key, now)` | `connecting` → `open`; ação `send` da inscrição (`subscribeId + 1`) |
| `liveMessage(lives, key, parsed, now)` | atualiza `lastFrameAt` e aplica a transição do data-model; devolve `{ lives, actions, entered, left }` (`entered`: passou a `subscribed`; `left`: deixou de estar) |
| `livePong(lives, key, now)` | só `lastFrameAt` |
| `liveClosed(lives, key, now)` | `waiting`, `retryAt` = now + 2·2^attempt s (máx. 30 s), `attempt + 1`, `buffer: null`; `left` se estava `subscribed` |
| `liveFlush(lives, key, force)` | `{ lives, reading }`: com `dirty` e (`urgent` ou `force`), a leitura do buffer e `dirty: false`; senão `reading: null` |

## Motor (mudanças)

| Função | Contrato |
|--------|----------|
| `planDispatch(...)` | pula impressoras com `live: true` |
| `acceptLive(statuses, key, reading, now)` | `applyReading` + `live: true` + `requestedAt: now`, sem `pending`/`seq`; chave desconhecida → mesmo objeto |
| `leaveLive(statuses, key)` | `live: false`; já `false` → mesmo objeto |
| `detailFor(...)` | `freshnessText` = `TEXT.live` com `live: true` (e estado diferente de `offline`) |
| `liveWarning(unavailable)` | `fill(TEXT.liveUnavailable, TEXT.liveInstall)` ou `""` |
| `buildPanelModel(...)` | campo novo `liveWarning` (parâmetro opcional no fim; sem ele, `""`) |

## Cobertura exigida

Cada caso com as fixtures `ws-*`; "nunca lança" para cada função nova; o teste de textos em inglês
cobre os textos novos; os testes atuais de `planDispatch`, `parseResponse` e `buildPanelModel`
continuam passando sem mudança.
