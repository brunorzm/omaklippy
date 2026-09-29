# Research: Ações de impressão no painel

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Date**: 2026-09-29

Fontes: documentação do Moonraker (https://moonraker.readthedocs.io/en/latest/external_api/printer/),
código do Moonraker (`moonraker/components/klippy_apis.py`) e do Klipper
(`klippy/extras/pause_resume.py`), componentes de `/usr/share/omarchy/shell/Ui` (omarchy 4.0.4-1) e
seus usos first-party (`plugins/clipboard/Clipboard.qml`, `plugins/panels/power/Panel.qml`), e a
fatia 001 ([research](../001-printer-status-bar/research.md), [contratos](../001-printer-status-bar/contracts/)).

## R1. Endpoints do Moonraker para as ações

- **Decision**: uma requisição `POST` sem corpo por ação:

  | Ação | Endpoint | O que o Moonraker/Klipper faz |
  |------|----------|-------------------------------|
  | pause | `POST /printer/print/pause` | webhook `pause_resume/pause` → G-code `PAUSE` (a macro da impressora, se existir) |
  | resume | `POST /printer/print/resume` | webhook `pause_resume/resume` → G-code `RESUME` |
  | cancel | `POST /printer/print/cancel` | webhook `pause_resume/cancel` → G-code `CANCEL_PRINT` |
  | emergencyStop | `POST /printer/emergency_stop` | webhook `emergency_stop`, **fora da fila de G-code**; o Klipper vai para `shutdown` |

  Sucesso: HTTP 2xx, corpo normalmente `{"result":"ok"}`. O corpo de um 2xx **não** é validado:
  qualquer 2xx é sucesso, porque o estado real vem da consulta seguinte.
- **Rationale**: são os endpoints que Mainsail e Fluidd usam; seguem as macros da impressora
  (Assumptions da spec). O endpoint de parada é o único caminho que não espera a fila de G-code
  (um `M112` por `gcode/script` ficaria atrás de uma macro lenta).
- **Alternatives considered**: `POST /printer/gcode/script?script=PAUSE` (mesmo efeito para pausa,
  mas pior para a parada e exige montar G-code); WebSocket JSON-RPC (depende de QtWebSockets,
  opcional pela constituição, e não traz ganho para comandos isolados).

## R2. Respostas "ok" sem efeito e recusas

- **Finding**: `PAUSE` com a impressão já pausada responde "Print already paused" e `RESUME` sem
  pausa responde "Print is not paused, resume aborted" com `respond_info`, sem erro. O Moonraker
  devolve `ok`. Erros levantados por macros (`action_raise_error`) e comandos inválidos voltam como
  HTTP 4xx com `{"error":{"message":...}}`. Klipper desconectado → 503 "Klippy Host not
  connected", como na consulta.
- **Decision**: "ok sem mudança de estado" é **sucesso sem mensagem**; a atualização imediata
  (R4) mostra os botões certos. Recusa (4xx/5xx) é falha com a mensagem do corpo, limpa por
  `tidyMessage`. É o caminho do edge case "a impressão terminou por outro meio".

## R3. Mapeamento de falhas compartilhado com a consulta

- **Decision**: extrair de `parseResponse` a parte de transporte (código de saída do curl,
  separação corpo/código HTTP, 401/403, ≥ 400 com `error.message`) para uma função interna
  `readTransport(stdout, exitCode)`. `parseResponse` (consulta) e `parseActionResponse` (ação)
  usam a mesma função. Os testes existentes de `parseResponse` continuam valendo sem mudança e
  garantem que a refatoração não alterou a consulta.
- **Diferença para ações**: offline (curl 6/7/28, …) vira falha com o mesmo texto; timeout de
  ação tem mensagem própria (R5), porque o comando pode ter chegado e ainda estar rodando.
- **Rationale**: FR-015 pede os mesmos motivos da consulta (sem resposta, não autorizado, recusa);
  duplicar a tabela criaria divergência.
- **Alternatives considered**: `curl -f` (descarta o corpo e perde a mensagem do Klipper).

## R4. Atualização imediata depois do comando (FR-014, SC-002)

- **Problema**: `planDispatch` pula impressoras com consulta pendente. Uma atualização disparada
  ao fim do comando pode não acontecer, e uma consulta já em voo pode ter lido o estado de
  **antes** do comando. Com intervalo de 5 s, o painel levaria até um ciclo inteiro para mudar.
- **Decision**: marca `followUp` no `PrinterStatus`:
  - `requestFollowUp(statuses, key)`: se a consulta da impressora está pendente, marca
    `followUp: true`; senão não muda nada.
  - `planDispatch(statuses, printers, timeoutMs, onlyKey)`: novo parâmetro opcional para consultar
    só uma impressora; ao despachar, zera `followUp`.
  - `acceptResult` preserva `followUp`. O `BarWidget`, depois de aceitar um resultado com
    `followUp: true`, despacha de novo só aquela impressora.
  - Ao fim de um comando: `requestFollowUp` e depois `planDispatch(…, key)`. Se não havia consulta
    pendente, sai uma na hora; se havia, sai outra assim que ela voltar.
- **Rationale**: a mudança aparece em ≤ 1 consulta (≤ timeout, 3 s por padrão, na prática < 1 s
  em rede local) depois da resposta do comando, sem depender do intervalo, e sem nunca ter duas
  consultas em voo para a mesma impressora (restrição da fatia 001).
- **Alternatives considered**: cancelar a consulta em voo e disparar outra (mata processos à toa e
  mexe no `seq`); esperar o próximo ciclo (não atende SC-002).

## R5. Tempo limite dos comandos (FR-013)

- **Decision**: `curl --connect-timeout <timeoutSec da configuração> --max-time 60`, com guarda
  `Timer` de 61 s. Constante `COMMAND_TIMEOUT_SEC = 60` em `Model.js`, sem nova configuração.
  Nenhum reenvio automático.
- **Rationale**: o tempo de conexão curto faz uma impressora desligada falhar tão rápido quanto a
  consulta (o comando comprovadamente não saiu). Os 60 s cobrem macros de estacionar, `M400` e
  reaquecimento em `RESUME`, e ficam acima do máximo do `timeoutSec` (30 s), atendendo "maior que
  o da consulta" para qualquer configuração válida. Estourar o tempo não prova que o comando falhou,
  por isso a mensagem pede para conferir a impressora antes de tentar de novo. O curl devolve 28
  tanto no tempo de conexão quanto no tempo total; a mesma mensagem serve aos dois casos.
- **Alternatives considered**: `timeoutMs + fixo` (acopla a um valor que não tem relação com a
  duração das macros); nova configuração no `schema` (a spec não pede, e o shell 4.0.4 não tem
  formulário, research R5 da 001).

## R6. Onde fica o estado dos comandos

- **Decision**: no `BarWidget`, ao lado de `statuses`: `commands = { [printerKey]:
  PrinterCommands }`, sempre substituído e nunca alterado no lugar. Cada comando é um `Process`
  de curta duração criado pelo `BarWidget` (mesmo padrão de `requestComponent`: guarda, `seq`,
  resultado único). O painel só lê um modelo pronto (`buildActionsModel`) e chama
  `hostWidget.runAction(action)`.
- **Rationale**: fechar o painel não mata o comando (edge case); o `BarWidget` já é o dono de
  processos e estado (research R8 da 001). Cada instância (monitor) tem seus próprios comandos,
  como a spec aceita.
- **Decisão do usuário (2026-09-29)**: a parada de emergência fica disponível enquanto Pause,
  Resume ou Cancel está em andamento (Clarifications e FR-012 da spec). Por isso
  `PrinterCommands` tem duas vagas: `busy` (pause/resume/cancel) e `estop`. Com `estop` em
  andamento, nada mais é enviado.
- **Falha exibida**: guardada por impressora em `failure`, limpa quando uma nova ação é enviada
  para ela e quando o usuário troca de impressora (FR-015). O resultado de um comando que termina
  depois da troca é guardado na impressora que o recebeu e só aparece quando ela for selecionada
  (edge case). A falha aparece mesmo quando os botões somem (impressora offline depois de a
  ação falhar), senão SC-005 não seria atendido.

## R7. Confirmação (FR-008, FR-009, SC-004)

- **Decision**: `ConfirmDialog` de `qs.Ui`, como no Clipboard: filho do `PanelKeyCatcher`, irmão
  do `Flickable`, `anchors.fill` e `z` acima do conteúdo. Teclas: o `focusTarget` continua sendo o
  `PanelKeyCatcher`. Com o diálogo aberto ele fica `blocked` e não aceita o evento, que sobe para
  o pai: um `Item` que envolve o `PanelKeyCatcher` e, no `Keys.onPressed`, repassa a tecla para
  `confirm.handleKey(event)` e aceita o evento (Escape incluído, para não fechar o painel). O alvo do comando é a chave guardada ao abrir o diálogo, e o diálogo fecha se a
  impressora resolvida mudar ou o botão sumir ou ficar desabilitado. Mouse: clique no fundo = desistir (comportamento do componente).
- **Segurança do teclado**: o componente começa com `selectedIndex: 1` (o botão de confirmar).
  O painel define `selectedIndex = 0` (desistir) **a cada abertura**. Assim Enter logo depois de
  abrir nunca confirma; confirmar exige mover para o botão destrutivo (←/→/Tab) e Enter, ou
  clicar nele.
- **Textos**: o botão "desistir" do componente se chama "Cancel" por padrão, o que colidiria com
  a ação "Cancel". Rótulos próprios em `Model.TEXT`: desistir = "Back"; confirmar = "Cancel print"
  / "Stop". Mensagens montadas por `confirmMessage(action, displayName, filename)`:
  `Cancel the print "hook.gcode" on Voron?` e `Emergency stop Voron? Klipper will shut down
  until a firmware restart.`. O componente usa botões de largura fixa (`Style.space(88)`); os
  rótulos curtos cabem, a conferir na implementação.
- **Fechamento automático sem envio**: troca de impressora (FR-016), fechar o painel, reabrir, e a
  ação deixar de estar disponível enquanto a confirmação está aberta (a impressão terminou).
  Na confirmação, o `BarWidget` ainda revalida pelo `planCommand`, que recusa ações fora de
  `availableActions` (FR-011/FR-012).
- **Alternatives considered**: diálogo próprio (fere o Princípio VIII sem ganho); confirmação
  por segundo clique no mesmo botão (fácil de disparar sem querer com clique duplo, contra
  SC-004).

## R8. Botões e visual (FR-006, Princípio VIII)

- **Decision**: `Button` de `qs.Ui` com `bordered: true`, ícone e rótulo, padrão da linha de
  perfis do painel de energia. Layout abaixo das temperaturas:
  - linha 1: "Pause"/"Resume" e "Cancel", lado a lado, largura dividida;
  - espaço `Style.space(12)`, depois "Emergency stop" em linha própria, largura total,
    preenchida com `Util.alpha(urgent, 0.22)` e texto na cor normal. Ociosa: só essa linha.
  - **Achado na implementação (2026-09-29)**: a primeira versão pintava o texto e a borda em
    `urgent`. No tema em uso (`red = #565d60`, cinza), o e-stop disponível ficava igual a um botão
    desabilitado, o que é perigoso. O preenchimento resolve em qualquer tema: disponível = cheio e
    claro; desabilitado = vazado e esmaecido.
- **Em andamento**: o botão acionado mostra `iconSpinning: true` com o glifo de progresso; os
  botões bloqueados ficam com `enabled: false` e opacidade reduzida (o `Button` não tem visual de
  desabilitado próprio; a opacidade relativa segue o que o painel já faz com a barra pausada).
- **Glifos** (Nerd Font do bar, constantes em `Model.js`, a conferir visualmente): pause
  `nf-md-pause`, resume `nf-md-play`, cancel `nf-md-stop`, emergency stop `nf-md-alert_octagon`,
  em andamento `nf-md-loading`.
- **Rationale**: tudo por tokens (`Style.space`, `Style.font`, `bar.urgent`); a separação física
  entre "Cancel" e "Emergency stop" evita o clique acidental (FR-006). O tema Solitude tem `urgent`
  cinza (hardware-test da 001), então o ícone de alerta e a linha própria dão a distinção também
  por forma.

## R9. Teclado no painel (FR-007)

- **Decision**: o cursor do painel passa de um único alvo (o dropdown) para uma lista de
  paradas calculada por função pura `cursorStops(panelModel)`: `"printer"` (se o dropdown
  aparece) seguido dos ids dos botões visíveis e habilitados, na ordem de leitura.
  `stepCursor(stops, current, delta)` move: j/↓/l/→ = +1, k/↑/h/← = −1, sem dar a volta; parada que
  deixou de existir cai na mais próxima. Enter/Espaço ativa: dropdown abre o menu; botão chama a
  mesma função do clique (Pause/Resume enviam; Cancel/Emergency stop abrem a confirmação).
  Mouse sobre um botão move o cursor para ele (`onHovered`), como no painel de energia.
- **Rationale**: é o modelo dos painéis nativos (cursor desenhado por `hasCursor`), e a ordem das
  paradas fica testável fora do shell (Princípio V).

## R10. Fixtures e testes

- **Decision**: fixtures de ação em `tests/fixtures/` com o mesmo formato
  `{exitCode, stdout}`. Sintéticas até o teste em hardware: `action-ok.synthetic`
  (`{"result":"ok"}` 200), `action-refused.synthetic` (400 com mensagem de macro),
  `action-klippy-disconnected.synthetic` (503). As falhas de rede reais já existentes
  (`refused`, `timeout`, `dns`, `unauthorized`) servem também para as ações, porque o transporte é
  o mesmo (R3). No teste em hardware, o **usuário** captura `action-ok` real (o assistente não
  envia comandos às impressoras).
- Novo arquivo de teste `tests/actions.test.js`; `tests/engine.test.js` ganha os casos de
  `followUp`/`onlyKey`; `tests/panel.test.js` ganha `cursorStops`/`stepCursor` e o campo `actions`.
