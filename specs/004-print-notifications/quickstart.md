# Quickstart: validar a fatia "Notificações de impressão"

Roteiro para provar a fatia e cumprir os Princípios VI e VII. Comportamento esperado em
[data-model.md](./data-model.md), [model-api.md](./contracts/model-api.md) e
[widget.md](./contracts/widget.md). Preparação: [fatia 001](../001-printer-status-bar/quickstart.md);
Moonraker falso: [fatia 002](../002-panel-print-actions/quickstart.md#2-moonraker-falso-falhas-e-cliques-sem-risco).

> **Segurança**: nunca provocar erro, parada de emergência ou desligamento numa impressora real.
> Conclusão e pausa reais são feitas **pelo usuário**. Falha, contato perdido e aquecimento usam o
> Moonraker falso.

```bash
PLUGIN_ID=io.github.brunorzm.omaklippy
PLUGIN_DIR=~/.config/omarchy/plugins/$PLUGIN_ID
NOTIF_DIR=~/.local/state/omarchy/notifications   # popups; history/ quando somem
```

## 1. Gates de toda tarefa

```bash
node --test "$PLUGIN_DIR/tests/"
omarchy plugin validate "$PLUGIN_DIR"
qmllint -I "$OMARCHY_PATH/shell" "$PLUGIN_DIR/BarWidget.qml" "$PLUGIN_DIR/Panel.qml"
```

Depois de mudar código, `omarchy-restart-shell` (mudanças em `Shared.js` só valem assim).

## 2. Contar notificações

Cada notificação vira um arquivo do serviço em `$NOTIF_DIR` (e em `history/` quando some).
Contar os arquivos com `OmaKlippy` antes e depois de cada cenário:

```bash
grep -rl OmaKlippy "$NOTIF_DIR" 2>/dev/null | wc -l
```

(Conferir o formato do arquivo na primeira execução e ajustar o `grep` se preciso.)

## 3. Cenários com o Moonraker falso (dois monitores ligados)

Backup do `shell.json`; cadastrar só a impressora falsa. O falso lê a fixture de um arquivo de
estado, como na 003.

| # | Passos | Esperado |
|---|--------|----------|
| 1 | `printing.synthetic` → `complete` | 1 "Print complete" com impressora e arquivo, some sozinha (SC-001, SC-002, SC-009) |
| 2 | `printing.synthetic` → `print-error.synthetic` | 1 "Print failed" com o motivo, fica na tela (SC-009) |
| 3 | `printing.synthetic` → `paused.synthetic` (sem usar o painel) | 1 "Print paused" |
| 4 | `printing.synthetic` → Pause **pelo painel** (POST ok) → `paused.synthetic` | 0 (SC-005) |
| 5 | `paused.synthetic` → `standby.synthetic` (cancelamento da Voron) | 0 (SC-004) |
| 6 | `printing.synthetic`, parar o servidor por 2 ciclos e voltar | 0 |
| 7 | `printing.synthetic`, parar o servidor por 4+ ciclos | 1 "Printer not responding", fica na tela (SC-007) |
| 8 | ocioso com alvo do bico > 0 (fixture sintética) → `shutdown.synthetic` | 1 "Print failed" sem arquivo (SC-008) |
| 9 | `standby.synthetic` (frio) → `shutdown.synthetic` | 0 (SC-008) |
| 10 | com `complete` já ativo, `omarchy-restart-shell` | 0 (SC-003) |
| 11 | `notifyComplete: "Off"` e repetir o 1 | 0 (US4) |
| 12 | Hot reload (tocar um arquivo do plugin) no meio de uma impressão falsa e depois concluir | 1 (líder reeleito, sem duplicar) |

## 4. Indisponibilidade (FR-012, SC-006)

O `PATH` do shell começa com `/usr/share/omarchy/bin` (hardware test da 003), então um
`notify-send` falso em `~/.local/bin` **não** o sobrepõe. Cobrir por testes puros
(`parseNotifyResult`, `notifyWarning`) e conferir ao vivo apenas que, com tudo funcionando, o
painel **não** mostra o aviso.

## 5. Ciclo de vida (Princípio VI)

Checklist das fatias anteriores (clique, Escape, summon/hide, disable/enable recadastrando as
impressoras, restart do shell, remove/reinstalar depois do push) mais: com dois monitores, um
evento gera uma notificação; desconectar um monitor e gerar outro evento ainda gera uma.

## 6. Teste em hardware (Princípio VII)

Com o usuário:

1. **Conclusão (SC-001)**: o usuário inicia uma impressão curta (um cubo pequeno) numa das
   impressoras; o assistente observa com um `GET` em laço e confere que chega 1 "Print complete"
   em até um ciclo depois de `print_stats.state = complete`.
2. **Pausa pelo Mainsail (SC-005)**: com uma impressão em andamento, o usuário pausa pelo
   Mainsail → 1 "Print paused"; retoma pelo Mainsail; pausa pelo painel → 0.
3. **Cancelamento (SC-004)**: o usuário cancela pelo painel (ou Mainsail) → 0.

Registrar em `specs/004-print-notifications/hardware-test.md`: data, impressoras e versões,
cenários, horários do evento e da notificação, contagens.
