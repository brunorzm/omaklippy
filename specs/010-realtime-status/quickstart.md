# Quickstart: validar o status em tempo real

Comportamento em [data-model.md](./data-model.md) e [contracts/](./contracts/).

> **Segurança**: o assistente só conecta e se inscreve (leitura) e faz `GET`. Aquecer o bico,
> reiniciar o Moonraker, parar o Klipper e os comandos do painel são feitos pelo usuário (Mainsail
> ou painel). O assistente prepara observadores (contagem de consultas, prints, log) e confere.

## 1. Gates de toda tarefa

```bash
node --test tests/
omarchy plugin validate .
qmllint -I "$OMARCHY_PATH/shell" BarWidget.qml Panel.qml LiveConnection.qml   # e o lint com qs/ em scratch
```

Depois de mudar código, `omarchy-restart-shell` (obrigatório depois de criar `LiveConnection.qml`).

## 2. Ao vivo (US1)

| # | Passos | Esperado |
|---|--------|----------|
| 1 | shell reiniciado, painel aberto na Voron | linha de atualização `live` |
| 2 | contar `curl … /printer/objects/query` por 60 s | 0 (hoje: 24 por barra) |
| 3 | o usuário aquece o bico pelo Mainsail | alvo e temperatura no painel em ≤2 s |
| 4 | o usuário pausa e retoma uma impressão pelo painel (US3) | `paused`/`printing` em ≤2 s, sem notificação, sem consulta extra |

## 3. Alternativa e reconexão (US2)

| # | Passos | Esperado |
|---|--------|----------|
| 1 | o usuário reinicia o Moonraker da Biqu | em ≤10 s, `updated … ago` (consulta periódica); volta a `live` sozinho em ≤30 s |
| 2 | o usuário para o serviço do Klipper (como na 008) | sai do `live`; `Restart Klipper` depois de 15 s; ao reiniciar, volta a `live` |
| 3 | impressora desligada no início | `offline` como hoje; tentativas espaçadas até 30 s, sem erros no log |
| 4 | conexão silenciosamente morta e inscrição com erro | por servidor falso (`WebSocketServer` do QtWebSockets num `qml` do scratchpad): queda percebida em ≤10 s |
| 5 | sem o módulo (não dá para desinstalar: conferido pelo teste puro e por um `Loader` com módulo inexistente no scratchpad) | aviso `Live updates unavailable: install qt6-websockets` |

## 4. Ciclo de vida (Princípio VI)

Checklist das fatias anteriores, mais: depois de `disable`, reinício do shell e `remove`, nenhuma
conexão aberta com as impressoras (`ss -tnp | grep -E ':7125|:80'` sem o `quickshell`).

## 5. Hardware (Princípio VII)

Registrar em `specs/010-realtime-status/hardware-test.md`: latência medida, consultas por minuto
antes e depois, tempo de queda e de volta, versões do Moonraker (Voron v0.11.0, Biqu v0.10.0).
