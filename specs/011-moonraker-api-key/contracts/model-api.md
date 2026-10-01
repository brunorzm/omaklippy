# Contract: `Model.js` (fatia 011)

Mesmas regras de sempre: funções puras, nunca lançam, mesmo objeto quando nada muda, textos em
`TEXT` (inglês). Decisões em [../research.md](../research.md).

## Textos

```text
unauthorized (muda): "unauthorized — allow this computer in trusted_clients or set an API key"
apiKeyRejected: "API key rejected"
invalidApiKey: "invalid API key"
setup.apiKey: "API key"                 setup.apiKeyHint: "API key %1"   (%1 = "…a1b2")
setup.setApiKey: "Set API key"          setup.saveApiKey: "Save"
setup.removeApiKey: "Remove API key"    setup.needsKey: "needs an API key"
setup.checkAgain: "Check again"         setup.keyRequired: "%1 needs an API key"
confirm.removeKeyMessage: "Remove the API key of %1? It will need this computer in trusted_clients."
```

## Configuração

| Função | Contrato |
|--------|----------|
| `normalizeApiKey(text)` | `{ key, valid }`: sem espaços nas pontas; `""` válido (sem chave); fora de `!`–`~` ou > 256 → `valid: false` |
| `normalizePrinters` | + `apiKey`, `apiKeyHint` (`"…" + 4 últimos`); chave inválida → `invalidReason: TEXT.invalidApiKey` |
| `addPrinterToList(raw, address, name, apiKey)` | + `apiKey` no item novo quando não vazia; chave inválida → `error: TEXT.invalidApiKey` |
| `setPrinterApiKey(raw, order, key)` | `{ list, error }`: grava/troca `apiKey` do item de ordem `order` (como `removePrinterFromList`), `""` tira o campo; inválida → erro; resto intacto |

## Pedidos

| Função | Contrato |
|--------|----------|
| `keyedRequest(args, apiKey)` | `{ args, stdin }`: com chave, `args` + `["-H", "@-"]` antes da URL e `stdin` `"X-Api-Key: <chave>\n"`; sem chave, `args` iguais e `stdin` `""` |
| `planDispatch`, `planEstimate`, `planServiceInfo`, `planCommand`, `submitForm`, `acceptCheck` | cada pedido ganha `stdin` (via `keyedRequest` com a chave da impressora / do formulário) |
| nenhum `args` | contém a chave (teste: procurar a chave em todos os `args` gerados) |

## Respostas

| Função | Contrato |
|--------|----------|
| `readTransport(stdout, exitCode, hasKey)` | 401/403 → `TEXT.apiKeyRejected` com `hasKey`, senão `TEXT.unauthorized` |
| `parseResponse`, `parseActionResponse`, `parseMoonrakerCheck` | + `hasKey` opcional, repassado |
| `parseMoonrakerCheck` | + `needsKey: true` em 401/403 sem chave |
| `parseScan` | sem mudança (`200`); nova `parseScanNeedsKey(stdout)` → IPs com `401`, que entram na busca como candidatos com `needsKey: true` (os testes da 009 não mudam) |

## Conexão contínua

| Função | Contrato |
|--------|----------|
| `buildIdentifyMessage(id, apiKey, version)` | JSON-RPC `server.connection.identify` com `client_name` "OmaKlippy", `version`, `type` "other", `url` do repositório, `api_key` |
| `reconcileLives` | a entrada guarda `apiKey`; chave diferente → entrada nova |
| `liveOpened` | com chave: ação `send` do `identify` (`identifyId`), sem inscrição ainda; sem chave: como na 010 |
| `liveMessage` | resposta do `identify`: ok → `send` da inscrição; erro → `keyRejected: true`, sem inscrição |
| `parseLiveMessage` | já entrega `result`/`error` com `id` (sem mudança) |

## Formulários (009)

| Função | Contrato |
|--------|----------|
| `acceptCheck` | resposta com `needsKey` → estado `needsKey` (sem `unreachable`) |
| `submitForm(form, raw, address, name, timeoutSec, apiKey)` | com chave, a conferência vai com ela |
| `buildSetupModel` | + `apiKeyHint` e `hasKey` da selecionada; `formNeedsKey`; resultados com `needsKey` |
| `setupCursorStops` | + `apiKeyField`, `checkAgain` (formulário em `needsKey`), `setKey`, `removeKey` (impressora selecionada) |

## Cobertura exigida

Fixtures `unauthorized` (real), novas `server-info-unauthorized.synthetic` e respostas de `identify`
(ok e 401); teste de que nenhum `args` gerado contém a chave; os testes das fatias 001–010 continuam
passando (o texto de `TEXT.unauthorized` muda: os testes que o comparam usam a constante, conferir).
