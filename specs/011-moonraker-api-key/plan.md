# Implementation Plan: Chave de API do Moonraker por impressora

**Branch**: `main` (sem branch dedicada; o script informou `011-moonraker-api-key`) | **Date**: 2026-10-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/011-moonraker-api-key/spec.md`

## Summary

1. **Configuração**: campo opcional `apiKey` por impressora, inline no `shell.json`, validado e
   preservado pelas gravações da 009.
2. **Pedidos HTTP**: com chave, cada `curl` recebe `-H @-` e lê `X-Api-Key: <chave>` da entrada
   padrão (nunca da linha de comando). **Conexão contínua**: `server.connection.identify` com a chave,
   e a inscrição só depois da resposta.
3. **Mensagens**: recusa sem chave sugere a chave; recusa com chave diz "API key rejected".
4. **Painel**: "Set API key" / "Remove API key" para a impressora selecionada (Printers…), campo da
   chave no "Add by address" quando a conferência é recusada, nota "needs an API key" na busca.

Detalhes em [research.md](./research.md).

## Technical Context

**Language/Version**: QML (Qt 6.11, Quickshell 0.3.1, omarchy 4.0.4-1) e JavaScript ES5+ em `Model.js`

**Primary Dependencies**: as da 010; `Process` do Quickshell com `stdinEnabled`/`write()`; `curl -H @-`

**Storage**: o `shell.json` do shell (campo `apiKey`), gravado pelo próprio shell (009)

**Testing**: `node --test tests/` (novo `tests/api-key.test.js`); fixtures de 401 (real) e de
`identify`; servidor falso HTTP (Python) + WebSocket (`qml`) no scratchpad; varredura de
`/proc/*/cmdline`; teste em impressora real opcional, conduzido pelo usuário

**Target Platform**: Omarchy Quattro, `omarchy-shell`

**Project Type**: plugin de desktop (bar-widget) de pasta única

**Performance Goals**: nenhum pedido a mais por ciclo; um `identify` a mais por conexão

**Constraints**: a chave nunca em `args`, endereços, mensagens ou logs; nada de arquivos novos

**Scale/Scope**: uma chave por impressora

Nenhum item ficou como NEEDS CLARIFICATION.

## Constitution Check

| Princípio | Status | Como o plano atende |
|-----------|--------|---------------------|
| I. Runtime do Omarchy | ✅ | A chave fica inline na entrada do widget; gravada pelo shell. |
| II. Shell nunca bloqueia | ✅ | Mesmos processos assíncronos com guarda; a escrita na entrada é imediata. |
| III. Mínimo privilégio | ✅ | Nenhum binário nem arquivo novo; a chave só vai à própria impressora e nunca por argumento; risco do `shell.json` legível registrado no README. |
| IV. Degradação graciosa | ✅ | Chave inválida/recusada vira motivo explícito no painel; o resto segue. |
| V. Lógica pura testável | ✅ | Validação, pedidos com chave, mensagens, `identify`, gravação e modelos de tela em `Model.js`, com testes. |
| VI. Validação obrigatória | ✅ | Gates por tarefa; ciclo de vida. |
| VII. Hardware real | ✅ | Sem regressão nas duas impressoras; cenário com chave pelo servidor falso e, se o usuário quiser, numa impressora real. |
| VIII. Visual nativo | ✅ | `TextField` com `password`, `Button`, `ConfirmDialog` e tokens. |

**Resultado**: aprovado, sem violações.

**Pontos de atenção para as tarefas**:
- **testes que mudam de propósito**: `tests/errors.test.js:45` e `:132` comparam o texto antigo de
  "unauthorized" (FR-005 muda o texto);
- **todo** construtor de pedido precisa passar a chave (status, estimativa, serviço, comandos,
  conferência do formulário, `hostname` do formulário); um teste confere que nenhum `args` gerado
  contém a chave;
- os quatro componentes de processo do `BarWidget.qml` (consulta, estimativa, serviço, comando) e
  o genérico da 009 ganham a escrita da entrada;
- o README tem o texto antigo de "unauthorized" e precisa do aviso do `shell.json` legível.

## Project Structure

```text
specs/011-moonraker-api-key/
├── plan.md, research.md, data-model.md, quickstart.md
├── contracts/{model-api.md, display.md}
├── checklists/requirements.md
├── hardware-test.md     # no teste
└── tasks.md             # /speckit-tasks
```

```text
io.github.brunorzm.omaklippy/
├── manifest.json        # version 0.11.0
├── Model.js             # chave na configuração, pedidos com stdin, mensagens, identify, gravação,
│                        #   formulários e tela de cadastro
├── BarWidget.qml        # processos com stdin; ações de chave; formulário needsKey
├── Panel.qml            # Set/Remove API key, campo da chave, nota needs an API key
├── LiveConnection.qml   # sem mudança (o identify é só mais uma mensagem)
├── README.md            # chave de API, risco do shell.json, texto de unauthorized
└── tests/
    ├── api-key.test.js  # novo
    ├── errors.test.js   # 2 asserts do texto de unauthorized (de propósito)
    └── fixtures/        # + server-info-unauthorized.synthetic, ws-identify-*.synthetic
```

## Complexity Tracking

Nenhuma violação da constituição a justificar.
