# Contract: conexão contínua com o Moonraker (fatia 010)

Medições e decisões em [../research.md](../research.md) (R2, R3, R5, R6).

## Endereço

```text
ws(s)://<host>[:port][/path]/websocket      (de liveUrl(baseUrl))
```

Conferido: porta 7125 direta e porta 80 pelo nginx do Mainsail, nas duas impressoras, sem chave.

## Enviado (só isto, FR-015)

```json
{"jsonrpc":"2.0","method":"printer.objects.subscribe","id":<n>,"params":{"objects":{
  "webhooks":null,"print_stats":null,"virtual_sdcard":null,"display_status":null,
  "extruder":["temperature","target"],"heater_bed":["temperature","target"]}}}
```

- ao abrir e depois de cada `notify_klippy_ready`;
- `ping` do protocolo WebSocket a cada 5 s com a inscrição ativa.

## Recebido

| Mensagem | Efeito |
|----------|--------|
| `{"result":{"eventtime":…,"status":{…}},"id":<n>}` (n = último pedido) | status completo; ao vivo |
| `{"error":{"code":503,"message":"Klippy Host not connected"},"id":<n>}` | fica na consulta periódica |
| `{"method":"notify_status_update","params":[{diff},eventtime]}` | mescla; entrega em ≤1 s (na hora se estado) |
| `{"method":"notify_klippy_disconnected"}` | sai do ao vivo (consulta periódica, 503 da 008) |
| `{"method":"notify_klippy_ready"}` | nova inscrição |
| `{"method":"notify_proc_stat_update",…}` | ignorada sem parse |
| outra | ignorada |
| `pong` | sinal de vida |

## Tempos

| O quê | Valor |
|-------|-------|
| entrega de atualizações | no máximo 1 por segundo por impressora; mudança de estado na hora |
| ping | a cada 5 s |
| conexão morta | 10 s sem nenhum quadro |
| reconexão | 2, 4, 8, 16, 30, 30… s; volta a 2 s depois de uma inscrição |

## Fixtures

| Fixture | Origem |
|---------|--------|
| `ws-subscribe-voron` | resposta real da inscrição na Voron (2026-10-01), parada |
| `ws-update-voron` | `notify_status_update` real (só temperaturas) |
| `ws-update-printing.synthetic` | atualização com `print_stats.state` `paused`, progresso e alvo |
| `ws-subscribe-error.synthetic` | erro 503 da inscrição com o Klipper fora |
| `ws-klippy-disconnected.synthetic`, `ws-klippy-ready.synthetic` | notificações do Moonraker (documentação) |
| `ws-proc-stat.synthetic` | `notify_proc_stat_update` reduzido |

Formato: `{ "message": "<texto recebido>" }` (diferente do `{ exitCode, stdout }` das consultas).
