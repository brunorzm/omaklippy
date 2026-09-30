# Teste em hardware: Notificações de impressão

Roteiro: [quickstart §6](./quickstart.md#6-teste-em-hardware-princípio-vii). Todas as ações nas
impressoras foram feitas **pelo usuário** (Mainsail e painel do plugin). O assistente só rodou um
observador `GET` em laço (1 s) que registrou cada mudança de `webhooks.state/print_stats.state` e
cada notificação do OmaKlippy guardada pelo serviço de notificações do Omarchy.

```text
Data:        2026-09-30
Impressoras: Voron (voron.local; Klipper v0.13.0-770-gce7002be-dirty, Moonraker v0.11.0-1-g1cfb0c4)
             Biqu B1 (biqu.local; Klipper v0.13.0-707-gf604aeeea, Moonraker v0.10.0-31-gd5ee171), ociosa
Monitores:   eDP-1 e DP-3 ligados o tempo todo
Arquivo:     CleanWalk_Duo_2025_12_31_assembly_brimmed_ABS_22m23s.gcode (Voron)
```

## Registro do observador

```text
12:01:47.826 STATE voron ready/printing   ← usuário inicia pelo Mainsail (heat-soak)
12:26:14.584 STATE voron no-answer        ← uma consulta do observador sem resposta
12:26:16.177 STATE voron ready/printing
12:27:58.450 STATE voron ready/paused     ← usuário pausa pelo Mainsail
12:27:58.469 NOTIFY Print paused | Voron — CleanWalk_…_22m23s.gcode | urgency 1 (normal)
12:29:03.121 STATE voron ready/printing   ← retoma pelo Mainsail: nada
12:29:14.908 STATE voron ready/paused     ← usuário pausa pelo painel do plugin no eDP-1: nada
12:29:47.243 STATE voron ready/printing   ← retoma: nada
12:41:28.630 STATE voron ready/complete   ← fim da impressão
12:41:27.890 NOTIFY Print complete | Voron — CleanWalk_…_22m23s.gcode | urgency 1 (normal)
```

(O observador consulta a cada 1 s e o plugin a cada 5 s, em relógios diferentes; por isso a
notificação de conclusão aparece registrada antes da mudança vista pelo observador.)

## Resultado

| Critério | Resultado |
|----------|-----------|
| SC-001 conclusão em até um ciclo | ✅ notificação no mesmo segundo em que o observador viu `complete` |
| SC-005 pausa pelo Mainsail → 1 | ✅ |
| SC-005 pausa pelo painel → 0 | ✅ pelo painel do **eDP-1**, completando o T022 (o do DP-3 foi testado com o Moonraker falso) |
| Retomar → 0 | ✅ duas vezes |
| Uma notificação por evento com dois monitores (SC-002) | ✅ 1 de cada |
| Falha curta de rede não avisa | ✅ uma consulta perdida às 12:26:14 sem "Printer not responding" |
| SC-009 conclusão e pausa somem sozinhas | ✅ urgência normal |
| SC-004 cancelamento → 0 | não repetido na impressora real (opcional); coberto pelo Moonraker falso (pausada → `standby`, cenário 5) |
| Desconectar um monitor | não feito (opcional); a troca de líder foi coberta pelo hot reload (cenário 12) |
| Falha e contato perdido | só no Moonraker falso, por segurança (nunca provocados numa impressora real) |

## Moonraker falso (2026-09-30, dois monitores)

| Cenário | Esperado | Obtido |
|---------|----------|--------|
| 1 printing → complete | 1, some sozinha | 1 em 4,1 s, urgência normal |
| complete repetido | 0 | 0 |
| 5 paused → standby (cancelamento da Voron) | 0 | 0 |
| 10 restart do shell com `complete` | 0 | 0 |
| 12 hot reload no meio, depois complete | 1 | 1 |
| 2 printing → print-error | 1, fica | 1, crítica, na tela após 1 min |
| 8 ocioso aquecendo → shutdown | 1, fica | 1, crítica, sem arquivo |
| 9 ocioso frio → shutdown | 0 | 0 |
| 6 servidor fora ~2 ciclos | 0 | 0 |
| 7 servidor fora 4+ ciclos | 1, fica | 1 após 11 s; nada na volta |
| 3 pausa externa | 1 | 1 |
| 4 Pause pelo painel (DP-3) | 0 | 0 |
| 4 Pause do painel recusado (400) + pausa externa | 1 | 1 (painel mostrou "Pause failed: …") |
| 11 `notifyComplete` Off / On | 0 / 1 | 0 / 1 |
| disable/enable e conclusão | 1, sem processos sobrando | 1 |

## Indisponibilidade (FR-012, SC-006)

Não testada ao vivo: o `PATH` do shell começa com `/usr/share/omarchy/bin` e um `notify-send`
falso não sobrepõe o real (hardware test da 003). Coberta pelos testes automáticos
(`parseNotifyResult`, `notifyWarning`, `buildPanelModel`); ao vivo, conferido que o painel **não**
mostra o aviso com tudo funcionando.

## Ciclo de vida

Escape, summon/hide, restart do shell, hot reload, disable/enable conferidos com o Moonraker
falso. Pendente: `omarchy plugin remove` + reinstalar depois do push.
