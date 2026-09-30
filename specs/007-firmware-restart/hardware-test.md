# Teste em hardware: Reiniciar o firmware pelo painel

Roteiro: [quickstart §5](./quickstart.md#5-teste-em-hardware-princípio-vii). A parada de emergência
e o reinício foram acionados **pelo usuário** pelo painel; o assistente só fez `GET` (um observador
a cada 1 s em `webhooks` e `print_stats`) e contou as notificações com `dbus-monitor`.

```text
Data:        2026-09-30
Impressora:  Voron (voron.local; Klipper v0.13.0-770-gce7002be-dirty, Moonraker v0.11.0-1-g1cfb0c4)
Estado:      ociosa e fria (bico e mesa a 37 °C, sem alvo), última impressão concluída
```

## Registro do observador (mudanças de estado)

```text
19:21:45 200 ready    complete | Printer is ready
19:22:41 200 shutdown complete | Shutdown due to webhooks request      ← Emergency stop pelo painel
19:23:16 503 "Klippy Host not connected"                               ← Restart firmware pelo painel
19:23:18 200 startup  standby
19:23:20 200 ready    standby  | Printer is ready
```

## Resultados

| Critério | Resultado |
|----------|-----------|
| Ociosa: sem "Restart firmware", com Emergency stop | ✅ |
| Depois da parada: Emergency stop some, Restart firmware aparece (FR-001, FR-002) | ✅ |
| Confirmação com o nome e "Back" selecionado; confirmar envia (FR-003, FR-004) | ✅ |
| Painel acompanha 503 → inicialização → idle sozinho (US1.3) | ✅ o Klipper ficou pronto 4 s depois do reinício |
| SC-001: 3 interações (abrir, acionar, confirmar) | ✅ |
| SC-002: idle em até 2 ciclos depois de pronto | ✅ observado pelo usuário |
| SC-005: 0 notificações | ✅ contador do `dbus-monitor` inalterado |

**Diferença do plano**: na Voron o 503 do reinício veio como "Klippy Host not connected", não
"Klippy Disconnected" (a fixture `klippy-restarting` é de outro momento do reinício). Nos dois casos
o `klippyState` fica vazio e o botão não aparece; nada muda no código.

A captura real da resposta do POST (`action-restart-ok`, opcional no contrato) não foi feita: o
POST sai do plugin, não de um comando do assistente, e o resultado `ok` ficou evidente pela
sequência do observador.

## Moonraker falso (2026-09-30)

Cenários do [quickstart §2](./quickstart.md#2-moonraker-falso), pelo teclado (assistente) e pelo
mouse (usuário): botão só em `shutdown` e `klippy-error.synthetic`; sem botão em `startup`, 503,
erro de impressão, printing e offline; desistir não envia; confirmar → 1 POST e a sequência até
idle; resposta lenta → spinner e 1 POST; confirmação fecha sozinha quando a impressora sai da
configuração (0 POST); falhas 503, 400 e conexão fechada (`network error (curl 52)`) mostradas no
painel; falha persistente volta a error com o botão; 0 notificações do reinício. Detalhes nas
anotações das tarefas T009 e T012.

## Ciclo de vida

Clique, Escape (a confirmação consome o primeiro), `summon`/`hide`, `disable`/`enable` (o `enable`
recria a entrada sem as impressoras, como antes; configuração restaurada do backup), reinício do
shell com as consultas retomadas e nenhum `curl` sobrando.

Remover (2026-09-30, depois do push de `e015de3`, com cópia da pasta no scratchpad):
`omarchy plugin remove --yes` apagou a pasta e a entrada no `shell.json`; logo depois ainda havia
processos `curl` (não inspecionados), e nenhum depois do reinício do shell; nenhum `notify-send`.
Reinstalado do GitHub (`e015de3`, conteúdo igual ao da cópia), `.specify/feature.json` restaurado,
Voron e Biqu recadastradas, shell reiniciado: painel com a Voron ociosa, Emergency stop e Open web
UI, sem Restart firmware.
