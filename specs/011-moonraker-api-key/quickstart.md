# Quickstart: validar a chave de API

Comportamento em [data-model.md](./data-model.md) e [contracts/](./contracts/).

> **Segurança**: o assistente nunca lê a chave de uma impressora real e nunca a coloca na linha de
> comando. Tirar este computador dos `trusted_clients` de uma impressora e obter a chave dela são
> passos do usuário. `shell.json` com backup antes de cada gravação de teste.

## 1. Gates de toda tarefa

```bash
node --test tests/
omarchy plugin validate .
qmllint -I "$OMARCHY_PATH/shell" BarWidget.qml Panel.qml LiveConnection.qml   # e o lint com qs/ em scratch
```

## 2. Servidor falso (scratchpad)

Um HTTP em Python que exige `X-Api-Key` (status com a fixture `standby`, `POST` de pausa aceito,
`/server/info`) e o `WebSocketServer` do `qml` que exige `identify` com a chave antes da inscrição;
`shell.json` só com as impressoras falsas e restaurado depois.

| # | Passos | Esperado |
|---|--------|----------|
| 1 | impressora falsa sem chave | `unauthorized — … or set an API key` |
| 2 | Set API key com a chave certa (pelo painel) | status `idle` (HTTP) e `live` (WebSocket falso) |
| 3 | chave errada | `API key rejected`; WebSocket sem inscrição |
| 4 | varredura de `/proc/*/cmdline` a cada 50 ms durante 1–3 | a chave nunca aparece |
| 5 | Remove API key (confirmar) | `shell.json` sem `apiKey`, resto igual |
| 6 | Add by address na falsa | `needs an API key`, campo da chave, Check again → adiciona com a chave |

## 3. Impressora real (se o usuário quiser)

O usuário tira este computador dos `trusted_clients` de uma impressora e reinicia o Moonraker dela;
o painel mostra o novo texto de recusa; ele informa a chave (Set API key); status ao vivo e um
comando funcionam; ele devolve o computador aos `trusted_clients` e remove a chave.

## 4. Sem regressão

As impressoras sem chave (Voron e Biqu hoje) funcionam como antes: `live`, consultas, comandos.

## 5. Ciclo de vida e hardware

Checklist das fatias anteriores; registrar em `specs/011-moonraker-api-key/hardware-test.md`.
