# Contract: API do Moonraker (reinício do firmware)

Complementa o [contrato de ações da 002](../../002-panel-print-actions/contracts/moonraker.md).
Referência: https://moonraker.readthedocs.io/en/latest/external_api/printer/ ("Firmware Restart").
Decisões em [../research.md](../research.md#r1-endpoint).

## Requisição

```text
POST {baseUrl}/printer/firmware_restart
Accept: application/json
(sem corpo)
```

Mesmos argumentos de curl das ações da 002 (conexão com o `timeoutSec` da configuração, total de
60 s), sem autenticação (`trusted_clients`). Um envio por confirmação, sem reenvio.

## Respostas

| Situação | HTTP | Corpo | Resultado |
|----------|------|-------|-----------|
| Aceito (o Moonraker responde depois de o Klippy desconectar) | 200 | `{"result":"ok"}` | sucesso |
| Klipper desconectado do Moonraker | 503 | `{"error":{"code":503,"message":"Klippy Host not connected"}}` | falha com a mensagem (o botão nem aparece nesse estado; só acontece se o estado mudou entre a consulta e o envio) |
| Recusa (400) | 400 | `{"error":{...}}` | falha com a mensagem |
| Fora de `trusted_clients` | 401/403 | `{"error":{...}}` | falha "unauthorized — …" |
| Sem conexão / DNS / tempo esgotado | — | — | falha pelo código de saída do curl |

## Efeito no estado (consultas seguintes, fatia 001)

| Momento | Consulta | Painel |
|---------|----------|--------|
| antes | 200, `webhooks.state = shutdown` | error + motivo, botão |
| logo depois do `ok` | 503 "Klippy Disconnected" | error "Klippy Disconnected", sem botão |
| alguns segundos | 200, `webhooks.state = startup` | error "Printer is not ready…", sem botão |
| pronto | 200, `webhooks.state = ready`, `print_stats.state = standby` | idle |
| causa persiste | 200, `webhooks.state = shutdown` de novo | error + motivo, botão de novo |

## Fixtures

| Fixture | Como obter | Uso |
|---------|-----------|-----|
| `klippy-error.synthetic` | escrita à mão: `webhooks.state = "error"`, mensagem de erro de configuração | botão aparece |
| `shutdown`, `shutdown.synthetic`, `startup`, `klippy-restarting`, `klippy-disconnected`, `print-error.synthetic` (existentes) | reutilizadas | tabela de disponibilidade |
| `action-ok.synthetic`, `action-refused.synthetic`, `action-klippy-disconnected.synthetic` (existentes) | reutilizadas | resultado do comando |
| `action-restart-ok` (real) | capturada **pelo usuário** no teste em hardware, se possível (a resposta do POST vem do clique dele) | `parseActionResponse` → `ok: true` |
