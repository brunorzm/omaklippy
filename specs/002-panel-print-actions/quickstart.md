# Quickstart: validar a fatia "Ações de impressão no painel"

Roteiro para provar a fatia de ponta a ponta e cumprir os gates dos Princípios VI e VII. O
comportamento esperado está em [display.md](./contracts/display.md),
[moonraker.md](./contracts/moonraker.md) e [model-api.md](./contracts/model-api.md). A preparação
(plugin instalado, impressoras cadastradas) é a da
[fatia 001](../001-printer-status-bar/quickstart.md).

> **Regra de segurança**: o assistente só faz consultas `GET` às impressoras reais. Todo
> Pause/Resume/Cancel/Emergency stop numa impressora real é acionado **pelo usuário**, pelos
> botões do plugin. O assistente prepara observadores (consulta de estado em laço, capturas de
> tela) e confere o resultado.

```bash
PLUGIN_ID=io.github.brunorzm.omaklippy
PLUGIN_DIR=~/.config/omarchy/plugins/$PLUGIN_ID
PRINTER=voron.local            # ajuste
```

## 1. Gates de toda tarefa

```bash
node --test "$PLUGIN_DIR/tests/"
omarchy plugin validate "$PLUGIN_DIR"
qmllint -I "$OMARCHY_PATH/shell" "$PLUGIN_DIR/BarWidget.qml" "$PLUGIN_DIR/Panel.qml"
```

Esperado: tudo sem erro, inclusive os testes da fatia 001 sem alteração. Depois de mudar código,
`omarchy-restart-shell` (o hot reload não recarrega plugin de terceiros).

## 2. Moonraker falso (falhas e cliques sem risco)

Para os cenários de falha e de clique repetido sem tocar numa impressora real, suba no
scratchpad um servidor HTTP local mínimo que:

- responda `GET /printer/objects/query` com o corpo de uma fixture escolhida (`printing`,
  `paused`, `standby`);
- responda os quatro `POST` com um código configurável (200 `{"result":"ok"}`, 400 com mensagem,
  401, 503), com atraso configurável (para ver o "em andamento");
- registre cada `POST` recebido num log (para contar envios em SC-003).

Cadastre-o como uma impressora extra (`127.0.0.1:<porta>`) no `shell.json`. Ele fica fora da
pasta do plugin e não é entregue.

## 3. Cenários (Moonraker falso)

**US1 / US2 / US3, botões por estado**

1. Fixture `printing`: aparecem Pause, Cancel e Emergency stop; Resume não aparece.
2. Fixture `paused`: Resume, Cancel e Emergency stop; Pause não aparece.
3. Fixture `standby`: só Emergency stop. Servidor parado (offline) ou 503: nenhum botão.
4. Emergency stop em linha própria, com a cor `urgent` do tema, separado de Cancel.

**Confirmação (SC-004)**

1. Cancel → diálogo com o nome da impressora e do arquivo, "Back" selecionado. Enter
   imediatamente → fecha sem `POST` no log. Escape e clique no fundo → idem.
2. ← (ou Tab) para "Cancel print" e Enter → um `POST /printer/print/cancel` no log.
3. Emergency stop → mesma verificação, com "Stop" e `POST /printer/emergency_stop`.
4. Com a confirmação aberta, trocar de impressora no dropdown pelo mouse → o diálogo fecha
   e nada é enviado (FR-016). Fechar o painel com o diálogo aberto → idem.

**Em andamento e clique repetido (SC-003, SC-006)**

1. Atraso de 10 s no `POST` de pause. Clicar Pause várias vezes rápido e apertar Enter com o
   cursor nele: o log mostra **um** `POST`. O botão gira; Cancel fica desabilitado.
2. Durante o atraso, Emergency stop continua habilitado e abre a confirmação (decisão de
   2026-09-29).
3. Durante o atraso, a barra, outros painéis e o dropdown continuam respondendo.
4. Fechar o painel durante o atraso e reabrir: o comando continua; o resultado aparece.

**Retorno (US4, SC-002, SC-005)**

1. 200 → o painel muda para o novo estado da fixture em ≤ 2 s depois da resposta, sem esperar
   o intervalo (troque a fixture do `GET` junto com a resposta do `POST`).
2. 401 → "Pause failed: unauthorized — …" abaixo dos botões.
3. 400 com mensagem → "Pause failed: <mensagem>".
4. Servidor parado → "Pause failed: connection refused"; no ciclo seguinte a impressora fica
   offline, os botões somem e a mensagem **continua** visível.
5. Atraso maior que 60 s → após 60 s, mensagem de timeout; o log mostra um único `POST` (sem
   reenvio).
6. A mensagem some ao acionar outra ação ou trocar de impressora.
7. Trocar de impressora com um comando em andamento → a mensagem de falha não aparece na nova
   impressora; volta a aparecer ao selecionar a que recebeu o comando, se ele falhou.

**Teclado (FR-007)**: j/k percorrem dropdown → botões primários → Emergency stop, sem dar a
volta; Enter/Espaço acionam; botões desabilitados não recebem o cursor.

## 4. Checklist de ciclo de vida (Princípio VI)

O mesmo da [fatia 001](../001-printer-status-bar/quickstart.md#5-checklist-de-ciclo-de-vida-princípio-vi),
mais:

| Passo | Esperado |
|-------|----------|
| Summon/hide com confirmação aberta | o painel fecha e a confirmação some, sem envio |
| Desabilitar com comando em andamento | nenhum `curl` restante (`pgrep -af 'curl.*printer/'` vazio) |
| Reiniciar o shell | nenhum comando é reenviado; falhas anteriores não reaparecem |

## 5. Tema

Em pelo menos dois temas (um com `urgent` cinza, como o Solitude), Emergency stop continua
distinguível pela linha própria e pelo ícone de alerta.

## 6. Teste em hardware (Princípio VII)

Feito com a Voron (e a Biqu B1 quando disponível), **acionado pelo usuário**. O assistente roda
um observador de estado (consulta `GET` em laço, gravando `print_stats.state` e
`webhooks.state` com horário) e captura telas do painel.

1. Impressão de teste curta em andamento: **Pause** pelo painel → `paused` no painel em ≤ 2 s
   depois de a macro terminar; **Resume** → `printing`.
2. **Cancel** → confirmação com o arquivo certo; confirmar → painel "idle".
3. Com a impressora ociosa e sem nada importante: **Emergency stop** → confirmação; confirmar →
   painel e ícone "error" com a mensagem do Klipper. O usuário faz `FIRMWARE_RESTART` pelo
   Mainsail depois.
4. Pause com macro longa (estacionamento): o botão fica "em andamento" até a resposta.
5. Captura de fixture real, num ciclo separado depois do passo 1: com a impressão em andamento,
   o usuário roda o `POST` de pausa pelo terminal, no formato de `tests/fixtures/README.md` com
   `-X POST` e `/printer/print/pause`, salva como `tests/fixtures/action-ok.json` e retoma pelo
   botão Resume.
6. SC-002: pelo observador, medir o intervalo entre a resposta do comando e a mudança no painel
   (esperado ≤ 2 s; pior caso teórico = uma consulta em voo + uma nova, até 2 × `timeoutSec`).

Registro em `specs/002-panel-print-actions/hardware-test.md`:

```text
Data:
Impressora(s):
Versão do Klipper / Moonraker:
US1 pausar/retomar:   [ ] pause [ ] resume [ ] macro longa "em andamento"
US2 cancelar:         [ ] confirmação com arquivo [ ] desistir não envia [ ] confirmar → idle
US3 parada:           [ ] confirmação [ ] shutdown com mensagem [ ] botões somem em erro
US4 retorno:          [ ] sucesso atualiza na hora [ ] falha real (desligada ou 401)
Teclado e mouse:      [ ]
Ciclo de vida:        [ ] completo
Fixture action-ok:    [ ] capturada
Observações:
```
