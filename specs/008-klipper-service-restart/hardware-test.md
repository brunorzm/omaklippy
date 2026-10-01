# Teste em hardware: Reiniciar o serviço do Klipper pelo painel

Roteiro: [quickstart §5](./quickstart.md#5-teste-em-hardware-princípio-vii). O serviço do Klipper foi
parado pelo usuário no Mainsail e reiniciado por ele pelo painel; o assistente só fez `GET` (um
observador a cada 1 s em `webhooks` e `print_stats`, com o código HTTP; o `system_info`; o log do
Moonraker) e contou as notificações com `dbus-monitor`.

```text
Data:        2026-10-01
Impressora:  Voron (voron.local; Klipper v0.13.0-770-gce7002be-dirty, Moonraker v0.11.0-1-g1cfb0c4)
Estado:      ociosa e fria (bico 32 °C, mesa 31 °C, sem alvo)
system_info: provider systemd_dbus, instance_ids.klipper "klipper", klipper em available_services
             (capturado como tests/fixtures/system-info-voron.json, reduzido aos campos usados)
```

## Registro do observador (mudanças de estado)

```text
06:53:15 200 ready    standby | Printer is ready
06:54:27 503 "Klippy Host not connected"          ← serviço parado pelo usuário no Mainsail
06:54:57 200 startup  standby                     ← depois do Restart Klipper pelo painel
06:55:00 200 ready    standby | Printer is ready
```

Log do Moonraker (só registra requisições com erro, então não mostra o POST aceito): 503 nas
consultas até 06:54:55.6, "Klippy Connection Established" às 06:54:55.999, "Klippy ready" às
06:55:00.437.

## Resultados

| Critério | Resultado |
|----------|-----------|
| Serviço parado: error "Klippy Host not connected", sem botão no início (FR-002) | ✅ |
| Botão depois de ~15 s (FR-001, SC-003) | ✅ |
| Confirmação e envio; volta a idle sem o botão reaparecer no meio (US1.4) | ✅ o Klipper ficou pronto ~5 s depois do reinício |
| SC-001: 3 interações (abrir, acionar, confirmar) | ✅ |
| SC-005: 0 notificações | ✅ contador do `dbus-monitor` em 0 |
| Escape na confirmação (passo 4) | não feito na Voron; conferido com o Moonraker falso (T011) |

A suposição do plano de que o Moonraker aceita `?service=` na query de um POST (lida no código do
Moonraker) ficou confirmada: o serviço reiniciou a partir do botão.

## Moonraker falso (2026-10-01)

Cenários do [quickstart §2](./quickstart.md#2-moonraker-falso), com o usuário clicando: ver as
anotações das tarefas T011, T014 e T022. Na primeira confirmação saíram dois POSTs no mesmo segundo,
sem repetição em 5 confirmações seguintes; a trava entre barras (FR-013) foi acrescentada e
validada.

## Ciclo de vida

Clique e Escape pelo usuário; `summon`/`hide`, `disable`/`enable` (o `enable` recria a entrada sem
as impressoras; restauradas do backup) e reinício do shell por comando, sem `curl` sobrando; depois
do reinício, painel com a Voron ociosa e atualizada.

Remover (2026-10-01, depois do push de `e58250f`, com cópia da pasta no scratchpad):
`omarchy plugin remove --yes` apagou a pasta e a entrada no `shell.json`; nenhum `notify-send`
sobrando. Reinstalado do GitHub (`e58250f`, conteúdo igual ao da cópia), `.specify/feature.json`
restaurado, Voron e Biqu recadastradas, shell reiniciado sem `curl` sobrando: painel com a Biqu
ociosa (seleção automática), Emergency stop e Open web UI.
