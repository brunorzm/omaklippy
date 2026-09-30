# Quickstart: validar a fatia "Quando termina"

Comportamento esperado em [data-model.md](./data-model.md) e
[contracts/model-api.md](./contracts/model-api.md). Moonraker falso: o da 005 (responde status e
metadados a partir de arquivos de estado no scratchpad).

> **Segurança**: só `GET` nas impressoras reais; impressão feita pelo usuário.

## 1. Gates de toda tarefa

```bash
node --test tests/
omarchy plugin validate .
qmllint -I "$OMARCHY_PATH/shell" BarWidget.qml Panel.qml
```

Depois de mudar código, `omarchy-restart-shell`.

## 2. Moonraker falso

| # | Passos | Esperado |
|---|--------|----------|
| 1 | `printing.synthetic` + metadados ok | painel com `Ends` = agora + restante (±1 min); tooltip `Fake — printing 42% · 12m left` |
| 2 | `printing` (heat-soak real, sem `info`) + metadados 404 | sem `Ends` (restante "—"); tooltip sem sufixo |
| 3 | fixture com `info` 12/62 | `Layer 12/62` |
| 4 | fixture com `info.current_layer` 5 e `total_layer` null + metadados ok (13 camadas) | `Layer 5/13` |
| 5 | `printing.synthetic` (sem `info`) | sem linha `Layer` |
| 6 | `paused.synthetic` com o painel aberto por 1–2 min | `Ends` vai ficando mais tarde |
| 7 | `standby.synthetic` | tooltip igual ao de antes; sem `Ends`/`Layer` |
| 8 | menu "Printer" com duas impressoras | opções iguais às de antes (sem "left") |

Tooltip: passar o mouse não é possível pelo assistente (sem ferramenta de mouse); conferir pelo
teste puro e, ao vivo, pelo usuário.

## 3. Ciclo de vida (Princípio VI)

Checklist das fatias anteriores; `remove`/reinstalar depois do push, com cópia da pasta e
`.specify/feature.json` restaurado.

## 4. Teste em hardware (Princípio VII)

Com o usuário, na Voron: durante uma impressão, conferir `Ends` contra o relógio da barra
(agora + restante, ±1 min), o tooltip (passar o mouse) e que a linha `Layer` não aparece (a Voron
não informa a camada). Opcional: se o usuário ativar no OrcaSlicer o comando de troca de camada
(`SET_PRINT_STATS_INFO`), conferir a linha `Layer` contra a interface web (metade positiva do
SC-003); sem isso, ela fica coberta só pelo Moonraker falso. Registrar em
`specs/006-print-finish-info/hardware-test.md`.
