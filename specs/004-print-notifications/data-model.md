# Data Model: Notificações de impressão no desktop

Complementa os data models das fatias [001](../001-printer-status-bar/data-model.md),
[002](../002-panel-print-actions/data-model.md) e [003](../003-open-web-ui/data-model.md). Só o
que muda está aqui. Tudo em memória; o único dado persistido são as quatro chaves novas da
configuração do widget, no `shell.json`.

## Configuração do widget: chaves novas

| Chave | Tipo | Padrão | Regra |
|-------|------|--------|-------|
| `notifyComplete` | `"On"` \| `"Off"` | `"On"` | conclusão (FR-001) |
| `notifyFailed` | `"On"` \| `"Off"` | `"On"` | falha (FR-002) |
| `notifyPaused` | `"On"` \| `"Off"` | `"On"` | pausa fora do painel (FR-003) |
| `notifyLostContact` | `"On"` \| `"Off"` | `"On"` | contato perdido (FR-014) |

`readSettings` → `config.notify = { complete, failed, paused, lostContact }` (booleanos). Desligado
só com `"Off"` (sem diferenciar maiúsculas) ou `false`; qualquer outro valor ou ausência → ligado.

## `PrinterStatus`: campos novos

| Campo | Tipo | Regra |
|-------|------|-------|
| `printState` | string | `print_stats.state` cru (`printing`, `paused`, `complete`, `cancelled`, `standby`, `error`, `""`); `""` quando offline ou antes da primeira resposta |
| `requestedAt` | number \| null | instante em que a última consulta foi enviada (`planDispatch(…, now)`); `null` antes da primeira |
| `klippyState` | string | `webhooks.state` cru (`ready`, `startup`, `shutdown`, `error`, `""`); `""` quando offline (análise C1) |

`initialStatus` ganha `printState: ""`, `requestedAt: null` e `klippyState: ""`. `applyReading`
preenche `printState` e `klippyState` a partir da leitura quando há resposta.

## `Watch` (por impressora, por instância do widget; `watches[key]` no `BarWidget`)

| Campo | Tipo | Regra |
|-------|------|-------|
| `seeded` | bool | já houve uma leitura com resposta |
| `last` | `Snapshot` \| null | último estado **com resposta** |
| `silent` | number | leituras seguidas sem resposta desde `last` |
| `lostNotified` | bool | o contato perdido já foi avisado nesta queda |

`Snapshot` = `{ state, printState, filename, heating }`, com `heating` = `nozzle.target > 0 ||
bed.target > 0` naquela leitura.

"Com resposta" = `status.state !== "offline"` (um erro do Klipper responde; um host que não
responde, não).

### Transições de `observe(watch, status, protectedNow)` → `{ watch, events }`

```text
sem resposta:
  não semeado                      → nada
  silent + 1; se silent ≥ 3, !lostNotified e hasJob(last.state)
                                   → evento lostContact; lostNotified = true
com resposta:
  não semeado                      → semeia (last = snapshot, silent = 0), sem evento
  hasJob(last.state) e printState "complete" e state ≠ "error" → complete
  hasJob(last.state) e falha                                   → failed (motivo, arquivo)
  last.state "idle" e last.heating e falha                     → failed (motivo, sem arquivo)
  (falha = state "error" e klippyState ≠ "startup": o Klipper reiniciando não é falha)
  last.state "printing" e state "paused"                        → paused
  depois: last = snapshot, silent = 0, lostNotified = false
protectedNow = true → events = [] (o watch é atualizado do mesmo jeito)
```

Estado repetido não casa com nenhuma regra (FR-010). Cancelamento (`cancelled`, ou pausada →
`standby`) também não (FR-004).

### Reconciliação

`reconcileWatches(watches, printers)`: mantém só as chaves existentes; impressora nova entra sem
`watch` (semeia na primeira resposta).

## `PrintEvent`

| Campo | Tipo |
|-------|------|
| `type` | `"complete"` \| `"failed"` \| `"paused"` \| `"lostContact"` |
| `filename` | string (pode ser `""`) |
| `reason` | string (só `failed`) |

## `Notification` (`buildNotification(event, displayName)`)

| Tipo | Urgência | Título | Corpo |
|------|----------|--------|-------|
| complete | normal | `Print complete` | `<impressora> — <arquivo>` (sem arquivo: `<impressora>`) |
| failed | critical | `Print failed` | `<impressora>: <motivo>` + ` (<arquivo>)` quando houver |
| paused | normal | `Print paused` | `<impressora> — <arquivo>` |
| lostContact | critical | `Printer not responding` | `<impressora> stopped answering during a print` + ` (<arquivo>)` |

`args` = `["notify-send", "-a", "OmaKlippy", "-u", <urgência>, "-i", "printer", <título>, <corpo>]`.

## Estado compartilhado (`Shared.js`, `.pragma library`)

Recipiente mutável; toda regra é função pura de `Model.js` sobre os objetos abaixo.

| Campo | Forma | Funções |
|-------|-------|---------|
| `registry` | `{ instances: number[], next: number }` | `registerInstance`, `unregisterInstance`, `isLeader` (= `instances[0] === id`) |
| `protections` | `{ [key]: { pending: number, answeredAt: number \| null, released: { [instanceId]: true } } }` | `protectStart(p, key)`, `protectFinish(p, key, now)`, `isProtected(p, key, id)`, `releaseProtection(p, key, requestedAt, id, registry)` |
| `notify` | `{ available: bool \| null, message: string }` | `parseNotifyResult` → atualização |

A proteção é liberada **por instância** (análise I1): cada barra consulta no próprio ritmo, e uma
consulta do líder que saiu antes da resposta não pode ser lida sem proteção só porque outra barra
já leu depois. `isProtected(p, key, id)` = há entrada e `id` não está em `released`.
`releaseProtection(p, key, requestedAt, id, registry)`: com `pending === 0` e `requestedAt >=
answeredAt`, marca `released[id]`; quando todas as instâncias de `registry.instances` estão
marcadas, apaga a entrada; senão devolve o mesmo objeto. `protectStart` zera `released` (um
comando novo protege todas de novo).

## `NotifyResult` (`parseNotifyResult(exitCode, launched)`)

| Situação | Resultado |
|----------|-----------|
| saiu com 0 | `{ ok: true, message: "" }` |
| não iniciou | `{ ok: false, message: "notify-send not found" }` |
| guarda (`-2`) | `{ ok: false, message: "no answer from notify-send" }` |
| outro código | `{ ok: false, message: "notification service unavailable (exit N)" }` |

## `PanelModel`: campo novo

`notifyWarning`: `""` ou `Notifications unavailable: <motivo>`; vem da cópia local do
`Shared.notify` feita pelo `BarWidget`.
