# Contract: widget, estado compartilhado e painel

Como `BarWidget.qml`, `Shared.js` e `Panel.qml` usam as funções de
[model-api.md](./model-api.md). Nada de decisão no QML além de chamar essas funções.

## `Shared.js` (novo, `.pragma library`)

```js
.pragma library
// State shared by every OmaKlippy widget instance in the shell (one per bar).
// A plain holder: every rule lives in Model.js.
var state = { registry: null, protections: {}, notify: { available: null, message: "" } }
```

`registry` começa `null` e é criado com `Model.emptyRegistry()` na primeira instância. A
biblioteca sobrevive ao hot reload (research R2): mudanças nela só valem depois de
`omarchy-restart-shell`.

## `BarWidget.qml`

| Momento | Comportamento |
|---------|---------------|
| `Component.onCompleted` | `registerInstance` → `instanceId`; depois `syncConfig()` como hoje |
| `Component.onDestruction` | `unregisterInstance(instanceId)`; `stopRequests(false)` como hoje |
| `syncConfig()` | também `watches = Model.reconcileWatches(watches, config.printers)` |
| `dispatch(onlyKey)` | passa `Date.now()` como `now` a `planDispatch` |
| `accept(key, seq, reading)` | depois de `acceptResult`, **só se o status mudou** (objeto novo): `prot = Shared.state.protections`; `protectedNow = Model.isProtected(prot, key, instanceId)`; `r = Model.observe(watches[key], statuses[key], protectedNow)`; `watches` atualizado; `Shared.state.protections = Model.releaseProtection(prot, key, statuses[key].requestedAt, instanceId, Shared.state.registry)`; se `isLeader` → para cada evento de `Model.filterEvents(r.events, config.notify)`: `sendNotification(key, event)` |
| `runAction(...)` | quando um comando é realmente criado: `Shared.state.protections = Model.protectStart(…, key)` |
| `acceptCommand(key, seq, result)` | antes do resto: `Shared.state.protections = Model.protectFinish(…, key, Date.now())` |
| `sendNotification(key, event)` | `n = Model.buildNotification(event, displayName)`; cria `notifyComponent` em `requestHolder` com `n.args` |
| `acceptNotify(result)` | `Shared.state.notify = { available: result.ok, message: result.message }`; `refreshNotifyWarning()` |
| `refreshNotifyWarning()` | `notifyWarningText = Model.notifyWarning(Shared.state.notify)`; chamado em `panelOpened()` e no timer de 15 s já existente |
| Ao virar líder com algum tipo ligado | uma vez: `notify-send --version` pelo mesmo `notifyComponent`, só para detectar o binário ausente (não mostra nada) |

A proteção começa e termina em qualquer instância (o painel pode estar em outro monitor); os
eventos são descartados em todas, e só o líder envia.

`notifyComponent`: esqueleto do `webLaunchComponent` da 003 (sem stdout), guarda de
`NOTIFY_TIMEOUT_SEC`, resultado por `Model.parseNotifyResult`. Fica em `requestHolder` com
`key: ""`. `stopRequests(true)` (troca de configuração, para processos de impressoras removidas)
passa a ignorar itens com `key` vazia, para não matar notificações em voo; `stopRequests(false)`
(destruição do widget) para tudo, como hoje.

Painéis em dois monitores: como antes, cada instância tem o seu; o aviso de indisponibilidade
aparece em qualquer um (vem do estado compartilhado).

## `Panel.qml`

Uma linha de texto, visível quando `panelModel.notifyWarning !== ""`, acima de "updated … ago",
em `Style.font.caption` e cor `root.dim` (sem cor de alerta: é informativo). Não é parada do
cursor.

## Manifesto

```json
{ "key": "notifyComplete", "type": "enum", "label": "Notify when a print completes", "options": ["On", "Off"], "defaultValue": "On" },
{ "key": "notifyFailed", "type": "enum", "label": "Notify when a print fails", "options": ["On", "Off"], "defaultValue": "On" },
{ "key": "notifyPaused", "type": "enum", "label": "Notify when a print pauses outside the panel", "options": ["On", "Off"], "defaultValue": "On" },
{ "key": "notifyLostContact", "type": "enum", "label": "Notify when a printing printer stops answering", "options": ["On", "Off"], "defaultValue": "On" }
```

Também em `barWidget.defaults`: as quatro chaves com `"On"`. `version` → `0.4.0`.
