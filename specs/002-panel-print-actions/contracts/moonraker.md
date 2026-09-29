# Contract: API do Moonraker (ações)

Complementa o [contrato de consulta da fatia 001](../../001-printer-status-bar/contracts/moonraker.md),
que continua valendo sem mudança. Referência:
https://moonraker.readthedocs.io/en/latest/external_api/printer/. Decisões em
[../research.md](../research.md#r1-endpoints-do-moonraker-para-as-ações).

## Requisições

Uma por ação, sempre para a impressora selecionada no momento do acionamento, sem reenvio.

```text
POST {baseUrl}/printer/print/pause
POST {baseUrl}/printer/print/resume
POST {baseUrl}/printer/print/cancel
POST {baseUrl}/printer/emergency_stop
Accept: application/json
(sem corpo)
```

Executadas com `curl` (argumentos em
[model-api.md](./model-api.md#buildactionargsbaseurl-action-connecttimeoutsec--string)):
conexão com o `timeoutSec` da configuração, tempo total de 60 s. Sem autenticação, como a
consulta (`trusted_clients`).

## Respostas

| Situação | HTTP | Corpo | Resultado |
|----------|------|-------|-----------|
| Aceito | 200 | `{"result":"ok"}` | sucesso (qualquer 2xx; corpo não é validado) |
| Aceito sem efeito (`PAUSE` já pausada, `RESUME` sem pausa) | 200 | `{"result":"ok"}` | sucesso; a consulta seguinte mostra o estado real |
| Macro recusou (`action_raise_error`) ou comando inválido | 400 | `{"error":{"code":400,"message":"..."}}` | falha com a mensagem |
| Klipper desconectado | 503 | `{"error":{"code":503,"message":"Klippy Host not connected"}}` | falha com a mensagem |
| Fora de `trusted_clients` | 401/403 | `{"error":{...}}` | falha "unauthorized — …" |
| Sem conexão / DNS / tempo esgotado | — | — | falha pelo código de saída do curl |

Efeito esperado no estado (visto pela consulta seguinte, fatia 001):

| Ação | `print_stats.state` / `webhooks.state` depois |
|------|-----------------------------------------------|
| pause | `paused` (depois de a macro terminar) |
| resume | `printing` |
| cancel | `standby` (Voron) ou `cancelled` → painel "idle" |
| emergencyStop | `webhooks.state = shutdown` → painel "error" com a mensagem do Klipper |

## Fixtures novas

Formato igual ao da fatia 001 (`{exitCode, stdout}`), em `tests/fixtures/`.

| Fixture | Como obter | `parseActionResponse` esperado |
|---------|-----------|--------------------------------|
| `action-ok.synthetic` | escrita à mão | `ok: true` |
| `action-refused.synthetic` | 400 com mensagem de macro | `ok: false`, mensagem do corpo |
| `action-klippy-disconnected.synthetic` | 503 | `ok: false`, "Klippy Host not connected" |
| `action-ok` (real) | capturada **pelo usuário** no teste em hardware ([quickstart](../quickstart.md#6-teste-em-hardware-princípio-vii)) | `ok: true` |
| `refused`, `timeout`, `dns`, `unauthorized` (existentes) | reutilizadas: o transporte é o mesmo | `ok: false`, motivos da tabela de `parseActionResponse` |
