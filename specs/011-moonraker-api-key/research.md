# Research: Chave de API do Moonraker por impressora

Decisões técnicas da fatia 011. Fontes: código do Moonraker nas versões das impressoras do usuário
(`moonraker/components/authorization.py`, `websockets.py`, `common.py`, tags v0.10.0 e v0.11.0,
baixados do GitHub para o scratchpad) e testes locais de 2026-10-01 só com leitura.

## R1. Como o Moonraker aceita a chave

- **HTTP**: cabeçalho `X-Api-Key: <chave>` (`authenticate_request`: JWT → token de uso único →
  `X-Api-Key` → IP confiável; sem nada disso, 401 "Unauthorized"). Vale para consultas e comandos.
- **WebSocket**: a conexão **abre mesmo sem autorização** (`prepare` marca `_need_auth`); o cliente
  então chama `server.connection.identify` (sem exigência de autorização) com `api_key`; sem isso,
  qualquer outro método responde 401. Chave errada → o próprio `identify` responde erro 401.
- **Endpoints sem autorização**: só `/access/login`, `/access/refresh_jwt`, `/access/info` e o
  `identify`. Logo, `/server/info` (conferência da 009 e verificação da rede) responde 401 numa
  impressora que exige chave.
- `/access/info` (sem autorização) diz se este computador é confiável: medido na Voron
  `{"login_required": false, "trusted": true}`.

## R2. A chave fora da linha de comando (FR-003, US2)

- **Decision**: o `curl` recebe o cabeçalho pela entrada padrão: argumentos `-H @-` e, na entrada,
  `X-Api-Key: <chave>\n`. No QML, o processo abre com `stdinEnabled: true`, escreve a linha em
  `onStarted` e desliga `stdinEnabled` (fecha a entrada: o `curl` lê até o fim dela). É o padrão do
  painel de rede do Omarchy para a senha do Wi-Fi ("The password goes over stdin, never argv").
- **Medido**: `printf 'X-Test-Header: hello\n' | curl -sv -H @- … /access/info` → a requisição sai
  com `X-Test-Header: hello` (curl 8.22.0). Docs do Quickshell: "If this property is false the
  process's stdin channel will be closed".
- **Sem chave**: nenhum `-H @-` e entrada desligada, exatamente como hoje.
- **WebSocket**: a chave vai dentro da mensagem `identify`, depois de aberta a conexão; nunca no
  endereço (FR-003, FR-009).
- **Alternatives considered**: `-H "X-Api-Key: …"` (visível em `ps`, vetado pela spec); token de uso
  único (`/access/oneshot_token` pedido com a chave, depois `?token=` no endereço da conexão): um
  pedido a mais por conexão, desnecessário com o `identify`; arquivo de configuração do `curl` (proibido criar
  arquivos, Princípio III).

## R3. Ordem na conexão contínua (FR-002)

- **Decision**: com chave, depois de aberta a conexão: `identify` (`client_name` "OmaKlippy",
  `version` do manifesto, `type` "other", `url` do repositório, `api_key`) e **só depois da resposta**
  a inscrição. Resposta de erro do `identify` (401) → "chave recusada": a impressora fica na consulta
  periódica (que mostra o mesmo motivo) e a conexão espera, sem nova tentativa até mudar a chave ou a
  conexão cair. Sem chave: inscrição direto, como na 010.
- **Rationale**: o Moonraker trata cada mensagem de forma assíncrona; mandar a inscrição junto com o
  `identify` arriscaria a inscrição chegar antes da autorização.

## R4. Mensagens de recusa (FR-005, FR-006)

- Sem chave, 401/403: `unauthorized — allow this computer in trusted_clients or set an API key`.
- Com chave, 401/403: `API key rejected`.
- As funções de leitura de resposta (`parseResponse`, `parseActionResponse`, `parseMoonrakerCheck`)
  ganham um parâmetro opcional "tem chave"; sem ele, o texto sem chave.

## R5. Configuração (FR-001, FR-007, FR-008)

- **Decision**: campo `apiKey` (texto) em cada item de `printers`, ao lado de `name`, `address` e
  `webUrl`. `normalizePrinters` lê `apiKey` sem espaços nas pontas; vazio = sem chave; com
  caracteres fora de ASCII visível (`!`–`~`) ou mais de 256 caracteres → a impressora fica inválida
  com o motivo `invalid API key` (como um endereço inválido, sem nenhum pedido).
- A chave do Moonraker é um `uuid4().hex` (32 caracteres hexadecimais), mas a regra aceita qualquer
  texto visível, para não recusar chaves de instalações modificadas.
- **Indicação no painel**: `API key …a1b2` (4 últimos caracteres) na tela de cadastro, nunca a chave
  inteira (FR-004).
- A gravação da 009 já preserva campos desconhecidos (lista crua): `apiKey` passa a ser escrita por
  `addPrinterToList` (opcional) e por uma função nova `setPrinterApiKey(raw, order, key)` (`""`
  remove o campo).

## R6. Busca na rede (edge case da spec)

- **Decision**: a verificação passa a aceitar `401` além de `200` como "há um Moonraker aqui"; esses
  resultados aparecem com a nota `needs an API key` e o nome vem do anúncio ou do nome na rede (o
  `/printer/info` também responde 401). Adicionar grava sem chave; a impressora aparece com o motivo
  de recusa, e o "Set API key" está na mesma tela.

## R7. Teste em hardware (Princípio VII)

- As duas impressoras confiam neste computador. Cenários:
  - **servidor falso** (scratchpad): HTTP em Python que exige `X-Api-Key` (status, comando e
    conferência) e o `WebSocketServer` do `qml` que exige `identify` com a chave;
  - **impressora real**, se o usuário quiser: ele tira este computador dos `trusted_clients` de uma
    delas (ou põe `force_logins`) e reinicia o Moonraker; a chave é obtida por ele (o Moonraker a
    devolve a clientes confiáveis em `GET /access/api_key`, ou fica no banco de dados dele). O
    assistente não lê a chave da impressora por conta própria.
- **Vazamento** (SC-002): durante consultas, comandos e conexão, varrer `/proc/*/cmdline` a cada
  50 ms procurando a chave; esperado: nenhuma ocorrência.

## R8. Binários (Princípio III)

Nenhum novo. O `curl` passa a ler cabeçalho da entrada padrão (`-H @-`).
