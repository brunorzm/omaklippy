# Teste em hardware: Quando termina

Roteiro: [quickstart §4](./quickstart.md#4-teste-em-hardware-princípio-vii). Impressão iniciada
pelo usuário; o assistente só fez `GET` (status e metadados) e capturas. Um observador registrou a
cada 5 s o que o painel e o tooltip mostrariam, calculado pelas mesmas funções puras do plugin.

```text
Data:        2026-09-30
Impressora:  Voron (voron.local; Klipper v0.13.0-770-gce7002be-dirty, Moonraker v0.11.0-1-g1cfb0c4)
Arquivo:     CleanWalk_Duo_2025_12_31_assembly_brimmed_ABS_6m19s.gcode (OrcaSlicer, estimated_time 379 s, layer_count 11)
Monitores:   só eDP-1
```

## Falha encontrada pelo usuário e corrigida (FR-013)

Com a primeira versão, às 17:00:50 o painel mostrava "Remaining 6m" e "Ends 17:07" com a Voron
ainda no heat-soak (`print_duration` 0). O usuário apontou que o horário era falso: os 6 min do
fatiador só contam a partir da primeira extrusão. A falha vinha da fatia 005 (que mostrava o tempo
do fatiador durante o aquecimento como se fosse o tempo até o fim); a 006 a transformou num
horário. Corrigido no mesmo teste (T021): aquecendo, o painel mostra "6m + warm-up" e nenhum
horário, e o tooltip "warming up". Conferido ao vivo às 17:05 (captura) e depois pelo observador.

## Registro do observador (versão corrigida, a partir de 17:05:27)

```text
17:05:27 aquecendo  msg "Aquecendo a Camara"                   Remaining 6m + warm-up  Ends -   tooltip "… · warming up"
17:10:12 aquecendo  msg "Fixando Temperatura da Mesa"          (igual)
17:10:22 aquecendo  msg "Aquecendo Bico"
17:11:22 aquecendo  msg "Aguardando 30 segundos"
17:12:17 aquecendo  msg "Nivelando o Eixo"
17:14:07 aquecendo  msg "Auto Z calibration"
17:15:32 aquecendo  msg "Medindo a Mesa"
17:16:47 aquecendo  msg "Estabilizando Temperatura de Impressao"
17:17:37 aquecendo  msg "Imprimindo"
17:17:42 imprimindo d=4 s                                      Remaining 5m            Ends 17:24  tooltip "Voron — printing 5% · 5m left"
17:24:27 fim (idle), 406 s de impressão real
```

O aquecimento durou ≈ 17 minutos (de ~17:00 a 17:17:37): com a primeira versão, "Ends 17:07" teria
errado por ~17 minutos.

## Resultado

| Critério | Resultado |
|----------|-----------|
| SC-001 horário = agora + restante (±1 min) | ✅ a partir da primeira extrusão: "Ends 17:24" às 17:17:42; oscilou só entre 17:24 e 17:25; a impressão terminou às 17:24:27 |
| FR-013 aquecimento | ✅ sem horário e "6m + warm-up" durante os ~17 min de aquecimento; o horário apareceu no primeiro ciclo depois da primeira extrusão |
| SC-002 tooltip | ✅ conferido pelo usuário passando o mouse ("· 6m left" na primeira versão; o observador registra "· warming up" e depois "· 5m left" na corrigida) |
| SC-003 camada | metade negativa ✅: a Voron não informa a camada (`info` nulo) e a linha `Layer` nunca apareceu. Metade positiva só com o Moonraker falso ("12/62", "5/13"); o comando de camada no OrcaSlicer não foi ativado |
| SC-004 | ✅ nenhum horário sem tempo restante conhecido; nenhuma camada inventada |
| Mensagem da 005 (bônus) | ✅ a sequência de mensagens do `PRINT_START` da Voron apareceu ao vivo, o caso que não tinha sido observado no teste da 005 |
| Precisão do fatiador (observação) | 406 s reais contra 379 s estimados (+7%) |

## Ciclo de vida

Com o Moonraker falso: conclusão → 1 notificação, Escape, disable/enable sem `curl` sobrando.
Pendente: `omarchy plugin remove` + reinstalar depois do push.
