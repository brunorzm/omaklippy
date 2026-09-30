# Quickstart: validar a fatia "Polimento do status"

Comportamento esperado em [data-model.md](./data-model.md) e [contracts/](./contracts/).
Preparação: [fatia 001](../001-printer-status-bar/quickstart.md); Moonraker falso:
[fatia 002](../002-panel-print-actions/quickstart.md#2-moonraker-falso-falhas-e-cliques-sem-risco).

> **Segurança**: só `GET` nas impressoras reais. Impressão e pausa reais são feitas pelo usuário.
> Trocar o tema do desktop também é passo do usuário.

## 1. Gates de toda tarefa

```bash
node --test tests/
omarchy plugin validate .
qmllint -I "$OMARCHY_PATH/shell" BarWidget.qml Panel.qml
```

Depois de mudar código, `omarchy-restart-shell`.

## 2. Moonraker falso

O servidor falso do scratchpad passa a responder também `GET /server/files/metadata` com o
conteúdo de uma fixture escolhida num arquivo de estado (`metadata-ok` ou `metadata-missing`) e a
registrar cada pedido no log (para contar buscas, FR-009).

| # | Passos | Esperado |
|---|--------|----------|
| 1 | fixture de impressão com `display_status.message` = "Aquecendo a Camara" | linha da mensagem no painel |
| 2 | a mesma com mensagem vazia | nenhuma linha (FR-002) |
| 3 | `standby` com mensagem "Imprimindo" | nenhuma linha (FR-004) |
| 4 | impressão com `print_duration` 0 e metadados ok | "Remaining" = estimativa do fatiador (22m) desde o primeiro ciclo (SC-002) |
| 5 | metadados 404 | "Remaining" como hoje ("—" até ~1%) |
| 6 | vários ciclos com a mesma impressão | uma busca de metadados por barra no log (FR-009) |
| 7 | fim da impressão e nova impressão do mesmo arquivo | nova busca |
| 8 | `paused.synthetic` com progresso baixo | marcador de pausa no ícone; some ao voltar a `printing` |
| 9 | `shutdown.synthetic` | selo de erro, sem marcador de pausa |

## 3. Tempo restante numa linha do tempo

Coberto por teste (`blendRemaining` sobre uma sequência sintética de progresso, com `P` muito
errado a 2%): nunca negativo nem zero (SC-004) e variação máxima de 10% entre ciclos depois de 2%
(SC-007).

## 4. Ciclo de vida (Princípio VI)

Checklist das fatias anteriores; `remove`/reinstalar só depois do push, com cópia da pasta.

## 5. Teste em hardware (Princípio VII)

Com o usuário, na Voron (ou na Biqu):

1. O usuário inicia uma impressão fatiada no OrcaSlicer.
2. Observador `GET` a cada ciclo registrando `display_status.message`, `print_duration`,
   `progress` e o tempo restante que o painel mostraria (calculado pelas mesmas funções puras).
3. SC-001: a mensagem do heat-soak aparece no painel (captura de tela).
4. SC-002: o tempo restante aparece em até 2 ciclos após o início.
5. Com menos de 10% de progresso, o usuário pausa pelo painel ou Mainsail → captura do ícone
   (SC-005, tema atual); o usuário troca para um tema claro, nova captura, e volta ao tema dele.
6. SC-003: nos primeiros 10%, o tempo exibido fica entre a estimativa do fatiador (menos o tempo
   impresso) e a pelo progresso, com `|R − S| ≤ 0,1·|P − S|`. No fim, anotar a diferença para o
   fim real só como observação (precisão do fatiador).

Registrar em `specs/005-status-polish/hardware-test.md`.
