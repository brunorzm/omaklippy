# Teste em hardware: Polimento do status

Roteiro: [quickstart §5](./quickstart.md#5-teste-em-hardware-princípio-vii). Impressão, pausa e
troca de tema feitas **pelo usuário**. O assistente só fez `GET` (status e metadados) e capturas.

```text
Data:        2026-09-30
Impressora:  Voron (voron.local; Klipper v0.13.0-770-gce7002be-dirty, Moonraker v0.11.0-1-g1cfb0c4)
Arquivo:     CleanWalk_Duo_2025_12_31_assembly_brimmed_ABS_31m41s.gcode (OrcaSlicer, estimated_time 1901 s)
Monitores:   só eDP-1 (DP-3 desconectado)
```

## Pausado a 14–15% (usuário)

Leitura às 15:14:54: `paused`, `print_duration` 309 s (impressão real), `total_duration` 2077 s
(≈ 29 min de heat-soak antes), progresso 0,1501, mensagem `Imprimindo`.

| Critério | Resultado |
|----------|-----------|
| Mensagem (FR-001, FR-004) | ✅ "Imprimindo" no painel com a impressora pausada |
| Tempo restante (FR-006) | ✅ "Remaining 26m" = 1616 s, exatamente a combinação calculada: `S` = 1901 − 309 = 1592, `P` = 1750, peso 0,15 |
| SC-005 marcador de pausa | ✅ "‖" legível no canto do ícone, com a barra de progresso atenuada a 15%, no tema escuro do usuário e num tema claro (placa na cor do fundo da barra) |
| Retomar | ✅ o tempo restante voltou a cair sem saltos (1606 → 1599 s em 20 s de impressão) |

## Não observado ao vivo

O usuário iniciou a impressão antes de o observador ser montado, então o heat-soak real não foi
acompanhado:

- **SC-001** (mensagem do heat-soak no painel) e **SC-002** (tempo restante desde o primeiro
  ciclo): validados com o Moonraker falso usando a fixture **real** do heat-soak da própria Voron
  (`printing.json`: "Aquecendo a Camara", `print_duration` 0) → "Aquecendo a Camara" e
  "Remaining 22m" desde o primeiro ciclo.
- **SC-003** (primeiros 10%): coberto pelo teste da linha do tempo sintética; ao vivo, só a leitura
  a 15%, que segue a mesma fórmula.

## Moonraker falso (2026-09-30, só eDP-1)

| Cenário | Resultado |
|---------|-----------|
| heat-soak real da Voron + metadados | "Aquecendo a Camara" e "Remaining 22m" |
| impressão com mensagem vazia | sem linha; 12m (combinação a 42%) |
| `standby` guardando "Imprimindo" | sem linha (FR-004) |
| metadados 404 numa nova impressão | "Remaining —" (como antes) |
| buscas de metadados | 1 por impressão, nome com espaço codificado (`CONE1%2060_…`); nova impressão do mesmo arquivo busca de novo |
| ritmo das consultas de status (SC-006) | 5 s mantidos (18 de 19 intervalos; o outro foi um follow-up) |
| marcador de pausa | redesenhado duas vezes depois de capturas ampliadas: a 1ª cortava o glifo, a 2ª se fundia a ele; a final tem placa na cor do fundo da barra, como o selo de erro |
| conclusão, Escape, disable/enable | 1 notificação; painel fecha; sem processos sobrando |

## Fim da impressão (observação)

Registrado pelo observador (`GET` a cada 5 s de 15:19 a 15:52, 396 leituras, tempo restante
calculado pelas mesmas funções puras do painel). A impressão terminou às 15:52:15 com 1978 s de
impressão real contra 1901 s estimados pelo fatiador (4% a mais).

| Tempo impresso | Progresso | Mostrado | Faltava de fato | Diferença |
|----------------|-----------|----------|-----------------|-----------|
| 313 s | 15% | 1614 s (26m) | 1660 s | −3% |
| 613 s | 21% | 1500 s | 1360 s | +10% |
| 913 s | 36% | 1223 s | 1060 s | +15% |
| 1213 s | 56% | 840 s | 760 s | +11% |
| 1513 s | 76% | 459 s | 460 s | 0% |
| 1813 s | 92% | 159 s | 160 s | −1% |

- **SC-004**: nenhuma leitura com tempo zero ou negativo durante a impressão; no fim, `<1m` e,
  com a impressora ociosa, "—".
- **SC-007**: maior salto além do tempo decorrido entre leituras seguidas: 7,5% (93 → 95 s, a
  1898 s, quando a estimativa do fatiador se esgotou, o salto registrado no plano); no resto,
  menor que isso. Dentro do limite de 10%.
- A superestimativa no meio (até +15%) acompanha a estimativa pelo progresso, que nesse trecho
  ficou acima do fatiador (o fatiador errou só 4% no total). Hipótese, não verificada: o progresso
  por posição no arquivo avança mais devagar que o tempo nas primeiras camadas desta peça. No fim,
  o valor converge (0% e −1%).
- **FR-004**: a impressora continuou exibindo "Imprimindo" depois do fim (o observador registra a
  mensagem crua); o painel não a mostra com a impressora ociosa, regra coberta por teste e vista
  ao vivo com o Moonraker falso.

## Ciclo de vida

Pendente: `omarchy plugin remove` + reinstalar depois do push.
