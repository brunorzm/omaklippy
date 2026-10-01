# Contract: `Model.js` (fatia 008)

Complementa os contratos da [002](../../002-panel-print-actions/contracts/model-api.md) e da
[007](../../007-firmware-restart/contracts/model-api.md). Mesmas regras: funções puras, nunca
lançam, mesmo objeto quando nada muda, textos em `TEXT` (inglês).

## Textos e constantes

```text
TEXT.actions.klipperRestart: "Restart Klipper"
TEXT.confirm.klipperMessage: "Restart the Klipper service on %1? It will start again on the printer's computer."
(botão de confirmar: TEXT.confirm.restart = "Restart", da 007)
ACTIONS.klipperRestart = { path: "/machine/services/restart", confirm: true, slot: "busy" }
ACTION_GLYPHS.klipperRestart = "\u{f0450}"   // nf-md-reload
KLIPPY_DOWN_OFFER_MS = 15000
DEFAULT_KLIPPER_SERVICE = "klipper"
```

## Status

- `initialStatus(key)`: + `klippyDownSince: null`, `klipperService: null`.
- `applyReading(prev, reading, now)`: regras de [data-model.md](../data-model.md#campos-novos-em-printerstatus).
  Casos: `klippy-disconnected` sobre status sem relógio → `now`; segundo 503 → mesmo valor;
  `startup`/`standby.synthetic`/`shutdown` → `null`; offline (`timeout`) → `null`;
  `klipperService` com nome preservado em qualquer leitura; com `name: null` e não pendente →
  `null` quando o relógio zera.
- `clearKlippyDown(statuses, key) → statuses`: zera `klippyDownSince` da impressora; já nulo ou
  chave ausente → mesmo objeto.

## Disponibilidade

- `canRestartKlipper(status, now) → bool`: `state === "error"`, `klippyDownSince` finito e
  `now − klippyDownSince ≥ KLIPPY_DOWN_OFFER_MS`. `now` inválido → `false`. Casos: 14 999 ms →
  `false`; 15 000 → `true`; `klippyState` `shutdown` sem relógio → `false`; lixo → `false`.
- `actionsFor(status, now)`: o da 007 e `klipperRestart` quando `canRestartKlipper`. Sem `now`,
  igual ao da 007.

## Requisição

- `buildActionArgs(baseUrl, action, connectTimeoutSec, service)`: para `klipperRestart`, a URL é
  `baseUrl + "/machine/services/restart?service=" + encodeURIComponent(service || "klipper")`;
  as demais ações ignoram `service`. Casos: `"klipper-1"` → `?service=klipper-1`; vazio → `klipper`.
- `planCommand(commands, printer, status, action, timeoutMs, now)`: disponibilidade por
  `actionsFor(status, now)`; passa `status.klipperService.name` a `buildActionArgs`. Casos:
  aceito com 503 há 15 s; recusado com 503 há 10 s; clique duplo → `null`; `estop` ocupado → `null`.

## Nome do serviço

- `buildServiceInfoArgs(baseUrl, timeoutSec)`: `buildCurlArgs(baseUrl + "/machine/system_info", timeoutSec)`;
  `baseUrl` vazio → `[]`.
- `parseServiceInfo(stdout, exitCode) → string | null`: `result.system_info.instance_ids.klipper`
  se string não vazia; senão `null` (transporte com erro, HTTP fora de 2xx, campo ausente).
  Casos: `system-info.synthetic` → `"klipper"`; `system-info-instance.synthetic` → `"klipper-1"`;
  `system-info-no-klipper.synthetic` → `null`; `refused`, `timeout`, `garbage.synthetic` → `null`.
- `planServiceInfo(statuses, printers, timeoutMs) → { statuses, requests }`: uma requisição por
  impressora válida com `klippyDownSince` não nulo e `klipperService` nulo; marca `pending`.
  Segunda chamada sem mudança → sem requisições e mesmo objeto.
- `acceptServiceInfo(statuses, key, seq, name) → statuses`: `seq` diferente, não pendente ou chave
  ausente → mesmo objeto; senão `{ name: name || null, pending: false, seq }`.

## Painel

- `buildActionsModel(printer, status, printerCommands, now)`: ids de `actionsFor(status, now)`;
  `klipperRestart` em `primary` com `urgent: false`, `confirm: true`; `busy`/`enabled` como as
  demais. Sem `now` → igual ao da 007.
- `buildPanelModel(...)`: passa o seu `now` a `buildActionsModel`.
- `confirmMessage("klipperRestart", "Voron")` →
  `"Restart the Klipper service on Voron? It will start again on the printer's computer."`;
  `confirmLabel("klipperRestart")` → `"Restart"`.

## Notificações

Sem função nova. Teste: `observe` sobre `klippy-disconnected` → `klippy-disconnected` → `startup`
→ `standby.synthetic` gera 0 eventos, com e sem proteção.

## Cobertura exigida

Cada caso acima; "nunca lança" para as funções novas; o teste de textos em inglês cobre as
chaves novas. Teste antigo que muda de propósito: "initialStatus is offline, waiting for the first
answer" (`tests/response.test.js`).
