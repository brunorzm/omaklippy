# Data Model: Status em tempo real pela conexão contínua com o Moonraker

Tudo em memória, por instância do widget (uma por barra). Decisões em [research.md](./research.md).

## LiveConnection (por impressora, `lives[key]`)

| Campo | Tipo | Regras |
|-------|------|--------|
| `state` | enum | `idle`, `connecting`, `open`, `subscribed`, `waiting` (até a próxima tentativa) |
| `url` | string | `liveUrl(baseUrl)`; `""` para endereço inválido (nunca conecta) |
| `attempt` | inteiro | tentativas seguidas sem inscrição; zera quando uma inscrição dá certo |
| `retryAt` | ms ou null | quando tentar de novo (`waiting`) |
| `lastFrameAt` | ms ou null | último quadro recebido (mensagem ou `pong`) |
| `subscribeId` | inteiro | `id` do último pedido de inscrição; respostas com outro `id` são ignoradas |
| `buffer` | objeto ou null | o status completo mesclado (`result.status` + atualizações) |
| `dirty` / `urgent` | bool | o buffer mudou desde a última entrega / a mudança toca estado |

Transições (todas por funções puras que devolvem `{ lives, actions }`):

```text
idle/waiting --(retryAt passou)--> connecting        ação: open
connecting   --opened-->           open              ação: send subscribe (id+1)
open         --resposta ok-->      subscribed        buffer = result.status; urgent; attempt = 0
open         --resposta erro-->    open              (Klipper fora: fica na consulta periódica)
subscribed   --notify_status_update--> subscribed    buffer = merge; dirty (urgent se estado)
subscribed   --notify_klippy_disconnected--> open    buffer = null (volta à consulta periódica)
open/subscribed --notify_klippy_ready--> open        ação: send subscribe (id+1)
qualquer aberta --9 s sem quadro / fechou / erro--> waiting   retryAt = now + 2,4,8,16,30 s; ação: close
open/subscribed --a cada 5 s-->    (mesmo)           ação: ping
```

## Status da impressora (o de hoje, `statuses[key]`) — campos novos

| Campo | Tipo | Regras |
|-------|------|--------|
| `live` | bool | `true` enquanto a conexão está `subscribed`; `planDispatch` pula a impressora |

Entrada ao vivo: `acceptLive(statuses, key, reading, now)` aplica a leitura (`applyReading`), marca
`live: true` e `requestedAt: now`, sem mexer em `pending`/`seq`. Saída do ao vivo:
`leaveLive(statuses, key)` marca `live: false` (a próxima consulta periódica sai na hora).

## Disponibilidade (por instância)

| Campo | Tipo | Regras |
|-------|------|--------|
| `liveUnavailable` | bool | o `Loader` de `LiveConnection.qml` deu erro (módulo ausente); vale para todas as impressoras |
