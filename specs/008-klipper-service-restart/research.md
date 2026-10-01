# Research: Reiniciar o serviço do Klipper pelo painel

Decisões técnicas da fatia 008. A spec não tem `NEEDS CLARIFICATION`.

## R1. Endpoint

- **Decision**: `POST {baseUrl}/machine/services/restart?service=<nome>`, sem corpo, com os
  argumentos de curl das ações da 002 (`buildActionArgs`, total de 60 s). Resposta: `{"result":"ok"}`.
- **Rationale**: é o endpoint "Restart a system service" da API do Moonraker
  (https://moonraker.readthedocs.io/en/latest/external_api/machine/), o que o Mainsail usa no menu
  de serviços. Pré-condições documentadas: `provider` diferente de `none`, serviço na lista de
  permitidos (`moonraker.asvc`) e permissão do Moonraker para gerenciar serviços. O Moonraker aceita
  os argumentos pela query string também em POST: `_default_parser` em
  `moonraker/components/application.py` lê `request.arguments` do Tornado (query e formulário, em
  qualquer método) e só depois mescla o corpo JSON; conferido no código-fonte.
- **Alternatives considered**: corpo JSON `{"service": "klipper"}` (exigiria `-H Content-Type` e
  `-d` só para esta ação; a query é equivalente); `POST /printer/restart` ou
  `/printer/firmware_restart` (precisam do Klipper conectado: é justamente o que falta);
  `POST /machine/reboot` (reinicia o computador inteiro: fora de escopo).

## R2. O que é "serviço desconectado" (FR-001, FR-003)

- **Decision**: uma leitura com HTTP **503** (o Moonraker respondeu, o Klipper não está conectado).
  `applyReading` mantém `klippyDownSince`: com 503, o valor anterior ou `now` se não havia; com
  qualquer outra resposta ou offline, `null`. `canRestartKlipper(status, now)` =
  `state === "error"` e `klippyDownSince !== null` e `now − klippyDownSince ≥ 15 000`.
- **Rationale**: as duas fixtures reais de 503 (`klippy-disconnected`, Biqu: "Klippy Host not
  connected"; `klippy-restarting`, Voron: "Klippy Disconnected") e a observação do teste da 007
  (Voron: 503 "Klippy Host not connected" por 2 s no reinício do firmware) usam esse código; o
  Moonraker não usa 503 para outra coisa nas consultas de status. Contar pelo código, e não pelo
  texto, cobre as duas mensagens e as traduções futuras do Moonraker.
- **15 s**: o reinício do firmware fica ~2 s nesse estado e a inicialização do serviço do Klipper,
  alguns segundos; 15 s (3 ou 4 consultas no intervalo padrão de 5 s) separa uma passagem de uma
  parada. O botão aparece na primeira atualização do painel depois dos 15 s (o painel recalcula a
  cada leitura e a cada 15 s), o que cumpre o SC-003.
- **Alternatives considered**: contar consultas seguidas (depende do intervalo configurado, de 1 a
  60 s); olhar o texto da mensagem (frágil).

## R3. Nome do serviço (FR-005)

- **Decision**: `GET {baseUrl}/machine/system_info`, campo `result.system_info.instance_ids.klipper`.
  `planServiceInfo` pede uma vez por impressora quando `klippyDownSince` é definido e o nome ainda
  não é conhecido nem está pendente; `acceptServiceInfo` guarda `klipperService = { name, pending,
  seq }`. Nome conhecido fica para a sessão (não muda); uma busca que falhou (`name: null`) é
  esquecida quando a desconexão acaba, para tentar de novo na próxima. No envio, nome ausente →
  `klipper`.
- **Rationale**: em instalações com várias instâncias (KIAUH) o serviço chama `klipper-1` etc. O
  Moonraker informa o nome detectado em `instance_ids` (Voron e Biqu: `klipper`, lido em
  2026-09-30 19:25). O `system_info` responde mesmo com o Klipper desconectado (é do Moonraker).
  Mesmo padrão de `planEstimate`/`acceptEstimate` da 005 (busca assíncrona, `seq`, resultado
  antigo ignorado).
- **Alternatives considered**: sempre `klipper` (erra em instalações com instâncias); buscar no
  momento da confirmação (encadeia dois processos no comando e atrasa o envio); configuração do
  usuário (mais um campo para algo que a impressora já informa).
- **`available_services`**: não usado para esconder o botão. Se o serviço não for permitido, o
  Moonraker recusa e o painel mostra o motivo (edge case da spec).

## R4. Depois do reinício (US1.4, US2.2)

- **Decision**: quando um `klipperRestart` termina com sucesso, `clearKlippyDown(statuses, key)`
  zera `klippyDownSince`; a próxima leitura 503 recomeça a contagem. Falha não zera (o botão
  continua disponível, FR-009). A consulta imediata da 002 continua valendo.
- **Rationale**: sem isso, uma desconexão que durou 60 s antes do reinício faria o botão
  reaparecer na consulta seguinte, com o serviço ainda subindo. Com o reset, ele só volta se o
  Klipper continuar desconectado por mais 15 s.
- **Sequência esperada**: 503 (serviço parado) → POST `ok` → 503 por alguns segundos → `startup` →
  `ready` (idle) ou `shutdown`/`error` (o botão "Restart firmware" da 007 assume).

## R5. Slot, confirmação, posição e textos

- **Slot `busy`**, `confirm: true`, como o `firmwareRestart` (007, R3). Nos estados em que aparece
  nenhuma outra ação de impressora está disponível.
- **Posição**: `actions.primary`, sozinho na linha, aparência comum, acima de "Open web UI". O
  `firmwareRestart` (Klipper conectado em shutdown/error) e o `klipperRestart` (503) são mutuamente
  exclusivos pelo próprio estado.
- **Glifo**: `nf-md-reload` (U+F0450, presente na JetBrainsMono Nerd Font instalada), diferente do
  `nf-md-restart` do firmware.
- **Textos** (inglês, em `TEXT`): botão `Restart Klipper`; confirmação
  `Restart the Klipper service on Voron? It will start again on the printer's computer.`; botão de
  confirmar `Restart` (o `TEXT.confirm.restart` da 007); falha `Restart Klipper failed: <motivo>`.

## R6. Notificações (FR-011)

Nada novo: `runAction` aplica a proteção a qualquer comando. Teste puro: `observe` sobre 503 →
503 → `startup` → idle gera 0 eventos.
