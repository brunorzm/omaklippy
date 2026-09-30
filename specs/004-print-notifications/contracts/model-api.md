# Contract: `Model.js` (funções novas e alteradas)

Complementa os contratos das fatias 001–003. Regras gerais inalteradas: funções puras, sem
relógio, nunca lançam exceção, devolvem o **mesmo** objeto quando nada muda, e todo texto visível
fica em `TEXT` (inglês). Tipos em [../data-model.md](../data-model.md).

## Textos novos em `TEXT`

```text
notify: {
  completeTitle: "Print complete",
  failedTitle: "Print failed",
  pausedTitle: "Print paused",
  lostTitle: "Printer not responding",
  withFile: "%1 — %2",                  // impressora, arquivo
  failedBody: "%1: %2",                 // impressora, motivo
  lostBody: "%1 stopped answering during a print",
  fileSuffix: " (%1)",
  unavailable: "Notifications unavailable: %1",
  notFound: "notify-send not found",
  serviceUnavailable: "notification service unavailable (exit %1)",
  timeout: "no answer from notify-send"
}
```

## Constantes

- `NOTIFY_LOST_AFTER = 3` (leituras sem resposta).
- `NOTIFY_TIMEOUT_SEC = 10`.
- `NOTIFY_APP_NAME = "OmaKlippy"`, `NOTIFY_ICON = "printer"`.

## Configuração

### `readSettings(settings)` (alterada)

Acrescenta `notify: { complete, failed, paused, lostContact }` pela tabela do data model. Demais
campos inalterados.

## Status

### `initialStatus(key)` / `applyReading(prev, reading, now)` (alteradas)

Campos `printState`, `requestedAt` e `klippyState` pelo data model. `applyReading` não mexe em `requestedAt`.

### `planDispatch(statuses, printers, timeoutMs, onlyKey, now)` (alterada)

Parâmetro novo `now` (opcional; ausente → `null`): cada impressora consultada recebe
`requestedAt = now`. Chamadas antigas sem `now` continuam válidas.

## Eventos

### `emptyWatch()` → `{ seeded: false, last: null, silent: 0, lostNotified: false }`

### `observe(watch, status, protectedNow) → { watch, events }`

Regras e transições em [data-model.md](../data-model.md#transições-de-observewatch-status-protectednow--watch-events).
`watch` ausente/inválido → tratado como `emptyWatch()`. `status` inválido → `{ watch, events: [] }`
com o mesmo `watch`.

### `reconcileWatches(watches, printers)` → watches

### `filterEvents(events, notifyPrefs)` → events

Mantém só os tipos ligados em `config.notify` (`lostContact` ↔ `lostContact`).

### `buildNotification(event, displayName)` → `{ urgency, title, body, args }`

Tabela do data model. Tipo desconhecido → `null`.

### `parseNotifyResult(exitCode, launched)` → `{ ok, message }`

Tabela do data model.

### `notifyWarning(notifyState)` → string

`available === false` → `fill(TEXT.notify.unavailable, message)`; senão `""`.

## Instâncias e proteções

- `emptyRegistry()` → `{ instances: [], next: 1 }`
- `registerInstance(reg)` → `{ registry, id }` (id = `reg.next`)
- `unregisterInstance(reg, id)` → registry
- `isLeader(reg, id)` → bool
- `protectStart(prot, key)` → prot com `pending + 1` e `released: {}` (cria a entrada com `answeredAt: null`)
- `protectFinish(prot, key, now)` → prot com `pending - 1` (mínimo 0) e `answeredAt = now`;
  sem entrada → mesmo objeto
- `isProtected(prot, key, id)` → bool (entrada existe e `id` não liberado)
- `releaseProtection(prot, key, requestedAt, id, registry)` → com `pending === 0` e `requestedAt`
  numérico `>= answeredAt`, marca `id` como liberado e apaga a entrada quando todas as instâncias
  do `registry` estão liberadas; senão o mesmo objeto

## Painel

### `buildPanelModel(printers, statusesByKey, selectedKey, now, commandsByKey, notifyWarningText)` (alterada)

Parâmetro novo opcional; o modelo ganha `notifyWarning` (string, `""` por padrão), também no
modelo vazio.

## Exportações novas

`NOTIFY_LOST_AFTER`, `NOTIFY_TIMEOUT_SEC`, `emptyWatch`, `observe`, `reconcileWatches`,
`filterEvents`, `buildNotification`, `parseNotifyResult`, `notifyWarning`, `emptyRegistry`,
`registerInstance`, `unregisterInstance`, `isLeader`, `protectStart`, `protectFinish`,
`isProtected`, `releaseProtection`.
