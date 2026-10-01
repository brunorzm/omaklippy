# Contract: API do Moonraker (serviço do Klipper)

Complementa os contratos da [002](../../002-panel-print-actions/contracts/moonraker.md) e da
[007](../../007-firmware-restart/contracts/moonraker.md). Referência:
https://moonraker.readthedocs.io/en/latest/external_api/machine/. Decisões em
[../research.md](../research.md).

## Requisições

```text
GET  {baseUrl}/machine/system_info                      # nome do serviço; uma vez por episódio
POST {baseUrl}/machine/services/restart?service=<nome>  # só com confirmação; sem corpo
Accept: application/json
```

O GET usa os argumentos de consulta (`timeoutSec` da configuração); o POST, os das ações (conexão
com o `timeoutSec`, total de 60 s). Sem autenticação (`trusted_clients`).

## Respostas do `system_info` (campos usados)

```json
{"result":{"system_info":{
  "provider":"systemd_dbus",
  "instance_ids":{"moonraker":"moonraker","klipper":"klipper"},
  "available_services":["klipper","moonraker", "..."]}}}
```

Lido na Voron e na Biqu em 2026-09-30 19:25: `instance_ids.klipper = "klipper"`, `klipper` em
`available_services`, todos os serviços `active`.

## Respostas do POST

| Situação | HTTP | Resultado |
|----------|------|-----------|
| Aceito | 200 `{"result":"ok"}` | sucesso |
| Serviço fora da lista de permitidos / `provider` `none` | 400 com `error.message` | falha com a mensagem |
| Fora de `trusted_clients` | 401/403 | falha "unauthorized — …" |
| Sem conexão / DNS / tempo esgotado | — | falha pelo código do curl |

## Efeito no estado

| Momento | Consulta de status | Painel |
|---------|--------------------|--------|
| serviço parado | 503 "Klippy Host not connected" | error; botão depois de 15 s |
| logo depois do `ok` | 503 por alguns segundos | error, sem botão (relógio zerado) |
| serviço conectado | 200, `startup` | error "Printer is not ready…", sem botão |
| pronto | 200, `ready` | idle |

## Fixtures

| Fixture | Origem | Uso |
|---------|--------|-----|
| `system-info.synthetic` | a partir da leitura real da Voron (19:25), só os campos usados | nome `klipper` |
| `system-info-instance.synthetic` | escrita à mão (instância `klipper-1`) | nome `klipper-1` |
| `system-info-no-klipper.synthetic` | escrita à mão (`provider` `none`, sem `klipper`) | `null` |
| `action-service-not-allowed.synthetic` | escrita à mão (400) | falha com a mensagem |
| `klippy-disconnected`, `klippy-restarting` (reais, existentes) | 503 | relógio de desconexão |
| `system-info-voron` (real) | capturada no teste em hardware, reduzida aos campos usados (o resto traz IPs e números de série; o repositório é público) | nome real |
