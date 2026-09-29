# Registro do teste em hardware: 002-panel-print-actions

Princípio VII da constituição. Roteiro em [quickstart.md](./quickstart.md#6-teste-em-hardware-princípio-vii).
Todas as ações na impressora real foram acionadas pelo usuário; o assistente só leu o estado
(observador `GET` a cada 1 s) e tirou capturas.

```text
Data:                  2026-09-29
Resultado:             APROVADO
Impressora:            Voron (voron.local, 192.168.0.110)
Versão do Klipper:     v0.13.0-770-gce7002be-dirty
Versão do Moonraker:   v0.11.0-1-g1cfb0c4
Acesso:                sem autenticação (este computador em trusted_clients)
Omarchy:               4.0.4-1, dois monitores (eDP-1 + DP-3); tema com urgent cinza (#565d60)
                       e um segundo tema escolhido pelo usuário
Impressão de teste:    CleanWalk_Duo_2025_12_31_assembly_brimmed_ABS_22m23s.gcode
```

## Linha do tempo (observador)

```text
18:10:48  printing | ready
18:11:26  paused   | ready      ← Pause pelo painel (botão girando durante a macro)
18:11:52  printing | ready      ← Resume pelo painel
18:13:52  paused   | ready      ← POST de pausa pelo terminal (captura da fixture action-ok)
18:15:49  printing | ready      ← Resume pelo painel
18:16:30  standby  | ready      ← Cancel + "Cancel print" pelo painel → idle
18:18:07  standby  | shutdown   ← Emergency stop + "Stop" pelo painel
                                  "Shutdown due to webhooks request …"
18:19:28  standby  | startup    ← FIRMWARE_RESTART pelo Mainsail
18:19:30  standby  | ready
```

## Cenários

Legenda: [x] verificado na impressora real · [s] verificado com o Moonraker falso local
(127.0.0.1, acionado pelo usuário com o mouse, exceto onde indicado) e coberto por teste
automatizado.

```text
US1 pausar/retomar
  [x] Pause e Resume pelo painel; o estado muda sozinho
  [x] macro de pausa: o botão fica girando até a resposta
  [s] clique repetido / Enter repetido: um único POST (teclado, pelo assistente)
  [s] Cancel e Emergency stop inertes enquanto só a US1 existia (teclado)

US2 cancelar
  [x] Cancel → confirmação com impressora e arquivo → "Cancel print" → idle
  [s] clique fora, Back (mouse) e Enter logo ao abrir (teclado): nenhum POST
  [s] Escape fecha só o diálogo; o segundo Escape fecha o painel
  [s] confirmação fecha sozinha se a impressora resolvida muda ou a ação some
  [s] hide/summon com a confirmação aberta: reabre sem diálogo, nenhum POST

US3 parada de emergência
  [x] Emergency stop + "Stop" → shutdown com a mensagem do Klipper; FIRMWARE_RESTART → idle
  [s] disponível durante um Pause lento; ambos em andamento ao mesmo tempo
  [x] distinguível no tema com urgent cinza e no segundo tema (usuário)

US4 retorno
  [s] sucesso: primeira consulta 0,01 s depois da resposta (SC-002)
  [s] 401: "Resume failed: unauthorized — …"
  [s] conexão derrubada: "Resume failed: network error (curl 52)"; a mensagem continua com a
      impressora offline e os botões sumidos (SC-005)
  [s] a mensagem some ao trocar de impressora
  [s] sem resposta em 60 s: mensagem de timeout, um único POST, nenhum curl sobrando

Ciclo de vida
  [s] clique, Escape, troca de painel, tooltip, botões do meio/direito sem efeito (FR-017)
  [s] desabilitar com comando em andamento: 0 processos curl; reabilitar; reiniciar sem reenvio
  [x] remover (depois do push): pasta, entrada no shell.json e processos somem; nada fora da
      pasta; reinstalado do GitHub (4f9f3fe) e impressoras recadastradas, funcionando
```

## Fixture real capturada

`tests/fixtures/action-ok.json`: `POST /printer/print/pause` na Voron, `{"result":"ok"}` com 200,
igual à sintética.

## Achados e correções durante a validação

1. **Emergency stop parecia desabilitado** no tema com `urgent` cinza (texto e borda em
   `urgent`). Passou a ter fundo `Util.alpha(urgent, 0.22)` e texto na cor normal (display.md,
   research R8).
2. **Mensagem de falha pouco legível** em `urgent` cinza: texto na cor normal, precedido de um
   glifo de alerta em `urgent`.
3. **Nome de arquivo longo sem espaços** passava da borda do diálogo de confirmação (visto na
   Voron). `confirmMessage` insere um espaço de largura zero depois de `_`, `-` e `.` no nome. Conferido
   pelo usuário: o nome quebra em três linhas, depois de `_`, e fica dentro da caixa.
4. **Hot reload**: editar qualquer arquivo da pasta do plugin (até `tasks.md`) com o shell
   rodando recarrega o plugin, e a instância recarregada para de consultar. Bug do Omarchy 4.0.4
   já registrado na fatia 001; durante testes ao vivo, reiniciar o shell depois de cada edição.
5. **Protetor de tela**: com ele ativo, teclas simuladas (`wtype`) não chegam ao painel. Os testes
   de teclado automatizados foram interrompidos e o restante foi feito pelo usuário.
