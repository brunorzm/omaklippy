# Research: Reiniciar o firmware pelo painel

Decisões técnicas da fatia 007. A spec não tem `NEEDS CLARIFICATION`.

## R1. Endpoint

- **Decision**: `POST {baseUrl}/printer/firmware_restart`, sem corpo, com os mesmos argumentos de
  curl das ações da 002 (`buildActionArgs`). Resposta documentada: `{"result":"ok"}`.
- **Rationale**: é o endpoint "Firmware Restart" da API do Moonraker
  (https://moonraker.readthedocs.io/en/latest/external_api/printer/: "Requests a complete Klipper
  restart. Both the Klippy Application and connected MCUs will be reset."), o mesmo que o Mainsail
  usa (`printer.firmware_restart`). O Moonraker o executa como o G-code `FIRMWARE_RESTART`, que o
  Klipper aceita mesmo em `shutdown` e `error` (comando registrado para "quando não pronto"); ao
  perder a conexão com o Klippy durante o reinício, o Moonraker trata "Klippy Disconnected" como
  sucesso e responde `ok`.
- **Alternatives considered**: `POST /printer/restart` (o `RESTART` só do host: não reinicia as
  MCUs, então não recupera uma falha de MCU nem uma parada de emergência, que desliga as MCUs);
  `POST /printer/gcode/script?script=FIRMWARE_RESTART` (mesmo efeito, mas o endpoint dedicado é o
  documentado para isso); `/machine/services/restart?service=klipper` (reinicia o serviço no
  computador da impressora: fora de escopo na spec).

## R2. Quando o botão aparece (FR-001, FR-002)

- **Decision**: `canRestartFirmware(status)` =
  `status.state === "error" && (status.klippyState === "shutdown" || status.klippyState === "error")`.
  `actionsFor(status)` = `availableActions(status.state)` mais `firmwareRestart` quando
  `canRestartFirmware(status)`. `planCommand` e `buildActionsModel` passam a usar `actionsFor`.
  `availableActions(state)` não muda (contrato e testes da 002).
- **Rationale**: o estado `error` do plugin junta casos diferentes, e só dois têm o que reiniciar.
  Conferido com as fixtures reais e `applyReading`:

  | Leitura | `state` | `klippyState` | Botão |
  |---------|---------|---------------|-------|
  | `shutdown` (falha do MCU, Biqu) / `shutdown.synthetic` (M112) | error | `shutdown` | sim |
  | `webhooks.state = "error"` (erro de configuração; referência do Klipper: ready, startup, shutdown, error) | error | `error` | sim |
  | `startup` (reiniciando) | error | `startup` | não |
  | 503 `klippy-restarting` ("Klippy Disconnected") e `klippy-disconnected` ("Host not connected") | error | `""` | não |
  | `print-error.synthetic` (impressão falhou, Klipper pronto) | error | `ready` | não |
  | 401/403, resposta inesperada | error | `""` | não |
  | offline, printing, paused, idle | — | — | não |

  `applyReading` sobrescreve `klippyState` a cada leitura (zera no offline e no 503), então o
  botão some na mesma consulta em que o Klipper começa a reiniciar. Não há fixture real de
  `webhooks.state = "error"`: nova `klippy-error.synthetic.json`.
- **Alternatives considered**: acrescentar `firmwareRestart` à tabela `ACTIONS_BY_STATE["error"]`
  (mostraria o botão em 503, `startup` e erro de impressão, contra o FR-002); mudar a assinatura
  de `availableActions` para receber o status (quebra o contrato e os testes da 002).

## R3. Slot e concorrência (FR-005, FR-006)

- **Decision**: `ACTIONS.firmwareRestart = { path: "/printer/firmware_restart", confirm: true, slot: "busy" }`;
  mesmo `COMMAND_TIMEOUT_SEC` (60 s) e guarda de 61 s; sem reenvio.
- **Rationale**: nos estados em que o botão aparece nenhuma outra ação de impressora está
  disponível, então o slot `busy` basta e as regras de `planCommand` (clique duplo, `estop` em
  andamento) valem sem mudança. Consequência aceita: se um comando anterior ainda está pendente
  (uma pausa cuja macro foi interrompida pela parada de emergência, ou a própria parada ainda sem
  resposta), "Restart firmware" aparece desabilitado até esse comando responder (no máximo 61 s).
  Open web UI tem slot próprio e não interfere.
- **Alternatives considered**: um quarto slot (exigiria generalizar a regra de `planCommand` para
  "slot da ação ocupado", sem ganho real).

## R4. Sequência do reinício vista pelo painel (US1.3, SC-002)

- **Decision**: nada novo no motor. Depois da resposta, `acceptCommand` já pede a consulta
  imediata (002). Sequência esperada no Moonraker: `shutdown` (200) → POST `ok` → 503 "Klippy
  Disconnected" → `startup` (200) → `ready` (200). O painel mostra "error" com "Klippy
  Disconnected", depois "error" com a mensagem de inicialização, depois "idle".
- **Rationale**: o Moonraker só responde ao POST quando o Klippy já desconectou (R1), então a
  consulta imediata já pega o 503 e o botão não reaparece entre o envio e o reinício.
  SC-002 (idle em até 2 ciclos depois de o Klipper ficar pronto) depende só do ciclo de consulta.

## R5. Posição no painel (FR-009)

- **Decision**: o botão vai em `actions.primary` (é o único item dela nesses estados), com
  `urgent: false`. `Panel.qml` não muda: a linha primary divide a largura pelo número de botões
  (um → largura total), já tem separador, cursor de teclado e fica acima de "Open web UI" (003).
  Glifo `nf-md-restart` (U+F0709, presente na JetBrainsMono Nerd Font instalada).
- **Rationale**: FR-009 pede linha própria e aparência comum; a linha de emergência tem o fundo
  de alerta, e "Emergency stop" nunca aparece junto (002: não aparece em erro).
- **Alternatives considered**: campo `restart` separado no `ActionsModel` com linha própria no QML
  (mais código sem diferença visível).

## R6. Confirmação e textos (FR-003, FR-008)

- **Decision** (inglês, em `TEXT`):
  - botão: `Restart firmware`
  - confirmação: `Restart the firmware on Voron? Klipper and the printer's boards will restart.`
  - botão de confirmar: `Restart`; desistir: `Back` (selecionado ao abrir, como na 002)
  - falha: `Restart firmware failed: <motivo>` (o `TEXT.actionFailed` da 002)
- **Rationale**: nome da impressora + aviso do efeito, como a confirmação da parada de
  emergência. O `ConfirmDialog` e o fechamento automático (troca de impressora, botão sumiu) são
  os da 002.

## R7. Notificações (FR-010)

- **Decision**: nada novo: `runAction` já chama `protectStart`/`protectFinish` para qualquer
  comando. Teste puro: `observe` sobre `shutdown` → 503 → `startup` → `idle` gera 0 eventos, com e
  sem proteção.
- **Rationale**: `eventsFor` só gera falha a partir de `printing`/`paused` ou `idle` aquecendo;
  sair de `error` não gera nada. Uma falha nova depois do reinício (idle aquecendo → shutdown) é
  real e continua notificando (US2.2).
