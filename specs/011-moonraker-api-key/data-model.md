# Data Model: Chave de API do Moonraker por impressora

## Impressora (configuração crua, `printers[i]`)

| Campo | Tipo | Regras |
|-------|------|--------|
| `apiKey` | texto, opcional | sem espaços nas pontas; vazio = sem chave; fora de `!`–`~` ou > 256 caracteres → impressora inválida (`invalid API key`) |

## Impressora (normalizada, `normalizePrinters`) — campos novos

| Campo | Tipo | Regras |
|-------|------|--------|
| `apiKey` | texto | a chave limpa, ou `""` |
| `apiKeyHint` | texto | `"…" + 4 últimos caracteres`, ou `""` |

## Pedido (qualquer `curl` do plugin a uma impressora)

| Campo | Tipo | Regras |
|-------|------|--------|
| `args` | lista | como hoje; com chave, mais `-H`, `@-` |
| `stdin` | texto | `"X-Api-Key: <chave>\n"` com chave; `""` sem (entrada fechada) |

## LiveConnection (010) — mudanças

| Campo | Tipo | Regras |
|-------|------|--------|
| `apiKey` | texto | a da impressora; mudar a chave recria a entrada (como mudar o endereço) |
| `identifyId` | inteiro | `id` do `identify` pendente; 0 sem chave |
| `keyRejected` | bool | o `identify` foi recusado; sem novas tentativas até a conexão cair ou a chave mudar |

```text
open (com chave)  --opened-->  envia identify (id)          estado open
open  --resposta ok do identify-->  envia subscribe (id+1)
open  --erro do identify-->        keyRejected (fica na consulta periódica)
open (sem chave)  --opened-->  envia subscribe               (como na 010)
```

## AddForm (009) — mudanças

| Campo | Tipo | Regras |
|-------|------|--------|
| `state` | enum | + `needsKey`: a conferência respondeu 401/403; mostra o campo da chave e "Check again" |
| `apiKey` | texto | a chave digitada (nunca mostrada de volta) |

## ApiKeyForm (tela Printers…, impressora selecionada)

| Campo | Tipo | Regras |
|-------|------|--------|
| `open` | bool | o campo "API key" está aberto para a impressora selecionada |
| `message` | texto | `invalid API key` antes de gravar, ou vazio |
| Remover | — | `ConfirmDialog` "Remove the API key of %1? …" com Back selecionado |
