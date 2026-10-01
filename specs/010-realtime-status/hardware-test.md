# Teste em hardware: Status em tempo real pela conexão contínua com o Moonraker

Roteiro: [quickstart §2, §3 e §5](./quickstart.md). O usuário mexeu nas impressoras pelo Mainsail
(alvo do bico, reinício do Moonraker, Klipper parado) e pelo painel (Restart Klipper); o assistente
só leu (`GET /server/info` e `/printer/objects/query?extruder=target` a cada 1 s, conexões do
`quickshell` por `ss`, processos `curl` do widget a cada 50 ms) e abriu o painel por `summon` para
os prints.

```text
Data:        2026-10-01
Versões:     omarchy 4.0.4-1, quickshell 0.3.1-1, qt6-websockets 6.11.2-1
Impressoras: Voron (voron.local, Moonraker v0.11.0-1-g1cfb0c4, Klipper v0.13.0-770-gce7002be-dirty)
             Biqu B1 (biqu.local, Moonraker v0.10.0-31-gd5ee171)
Conexão:     ws://<host>/websocket pelo nginx do Mainsail (porta 80), o endereço cadastrado
Monitores:   um (eDP-1): uma barra, uma conexão por impressora
```

## Ao vivo (US1)

- Depois do reinício do shell: uma conexão por impressora; **0 consultas de status em 20 s** (antes
  da fatia: 12 por impressora por minuto, por barra); painel com `live` na linha de atualização.
- Alvo de 65 °C posto no bico da Voron pelo usuário às 15:29:45: o painel, aberto pelo observador
  logo depois, já mostrava `Nozzle 29/65 °C` e `live` — **até ~1,6 s** depois da mudança na
  impressora (o observador lê a impressora a cada 1 s e tira o print 0,6 s depois de abrir o painel).

## Queda e volta (US2)

```text
15:31:08–10  Biqu: Moonraker reiniciando (pedido do usuário no Mainsail)
15:31:15     conexão do widget com a Biqu caiu
15:31:20     Moonraker da Biqu de volta (ready)
15:31:26     widget reconectado (11 s depois da queda, 6 s depois da volta) — meta ≤30 s
```

```text
15:33:09     Voron: serviço do Klipper parado pelo usuário; a conexão continua (Moonraker de pé)
15:33:23     consulta HTTP do widget à Voron observada (fora do ao vivo)
             painel: "Restart Klipper" oferecido (008); o usuário reiniciou pelo painel
15:34:09     Klipper em startup
15:34:12     Klipper ready; consultas param de novo (ao vivo)
```

As consultas HTTP às impressoras reais duram dezenas de milissegundos e o observador de 50 ms pega
só algumas; o "Restart Klipper" só aparece pelas respostas 503 da consulta periódica, o que confirma
que ela voltou com o Klipper desconectado.

## Comandos sem consulta extra (US3)

Impressão real na Voron (`CleanWalk_Duo_2025_…med_ABS_6m19s.gcode`), pausada e retomada pelo usuário
pelo painel, com a Voron ao vivo:

```text
16:04:19  print_stats.state paused (print_duration 75 s); print até 0,5 s depois: painel "PAUSED · 16%"
16:05:01  print_stats.state printing; print até 0,5 s depois: painel "printing 16%", linha "live"
```

- 0 notificações da área de trabalho (`dbus-monitor` no `Notify`): a pausa pelo painel ficou
  protegida (004) também com a leitura ao vivo.
- 0 consultas `objects/query` do widget à Voron durante o teste (sem a consulta extra depois de cada
  comando, FR-008); a conexão continuou a mesma.
- Nenhum erro no log do shell.

## Servidor falso (T014)

`WebSocketServer` num `qml` do scratchpad em 127.0.0.1:7199 (respondendo a inscrição com a
`ws-subscribe-voron`), `shell.json` só com ele e restaurado idêntico depois:

| Cenário | Resultado |
|---------|-----------|
| ao vivo | 0 consultas HTTP |
| conexão morta em silêncio (`SIGSTOP`) | consulta periódica de volta em 10,7 s com o limite de 10 s → limite baixado para 9 s → **9,2 s** |
| servidor de volta (`SIGCONT`) | ao vivo de novo em menos de 2 s, sem consultas |
| inscrição recusada | nunca ao vivo; consulta periódica (painel "network error (curl 52)"); uma conexão só, sem fechar e reabrir |

## Notificação com a impressora ao vivo (004)

A impressão do teste da US3 terminou às 16:10:36: uma única notificação "Print complete"
(`dbus-monitor`) no mesmo segundo em que a Voron passou a `complete`.

## Ciclo de vida

Clique pelo usuário (Pause, Resume, Restart Klipper e a seleção de impressora pelo painel);
`summon` (`ok`, painel aberto) e `hide` (fechado); `disable`: a entrada saiu do `shell.json` e as
conexões do `quickshell` com as impressoras caíram de 2 para **0**, sem `curl` sobrando; `enable`:
entrada recriada sem impressoras, nenhuma conexão; `shell.json` restaurado do backup (idêntico): as
2 conexões voltaram sozinhas, sem reiniciar o shell; `omarchy-restart-shell`: 2 conexões de novo e
nenhum erro no log. `remove`/reinstalar: pendente, depois do push.
