# Feature Specification: Ações de impressão no painel

**Feature Branch**: `main` (sem branch dedicada; nenhum hook de branch configurado)

**Created**: 2026-09-29

**Status**: Concluída em 2026-09-29 (teste em hardware aprovado; ver [hardware-test.md](./hardware-test.md))

**Input**: User description: "ações no painel: pausar, retomar, cancelar, parada de emergência"

**Contexto**: continuação da fatia [001-printer-status-bar](../001-printer-status-bar/spec.md), que
entregou o ícone na barra e o painel de detalhes somente leitura, com um menu "Printer" para
escolher a impressora. Esta fatia acrescenta ao painel os botões de controle da impressora
selecionada. Os textos da interface são em inglês (decisão da fatia 001).

## Clarifications

### Session 2026-09-29

- Q: A parada de emergência pede confirmação ou é enviada no primeiro clique? → A: pede
  confirmação simples, igual à do cancelamento (padrão do Mainsail/Fluidd).
- Q: Com Pause/Resume/Cancel em andamento (macros podem levar dezenas de segundos), a parada de
  emergência fica bloqueada? → A: não. "Emergency stop" continua disponível (com confirmação)
  enquanto outro comando está em andamento; só os demais botões ficam bloqueados. O endpoint de
  parada do Moonraker não passa pela fila de G-code.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pausar e retomar uma impressão (Priority: P1)

Com uma impressão em andamento, o usuário abre o painel e pausa a impressora selecionada sem abrir
o navegador; depois, retoma pelo mesmo painel.

**Why this priority**: é a ação mais frequente e a de menor risco; resolve o caso "preciso parar
um instante para olhar a peça ou trocar o filamento".

**Independent Test**: iniciar uma impressão, abrir o painel, pausar, conferir que a impressora e o
painel mostram "paused"; retomar e conferir que volta a "printing".

**Acceptance Scenarios**:

1. **Given** a impressora selecionada está imprimindo, **When** o usuário aciona "Pause",
   **Then** a impressora pausa e o painel passa a mostrar "paused" em até um ciclo de
   atualização depois da confirmação da impressora.
2. **Given** a impressora selecionada está pausada, **When** o usuário aciona "Resume",
   **Then** a impressão continua e o painel volta a mostrar "printing".
3. **Given** a impressora está imprimindo, **When** o painel é exibido, **Then** aparece "Pause" e
   não aparece "Resume"; pausada, aparece "Resume" e não "Pause".
4. **Given** um comando foi enviado, **When** a impressora ainda não respondeu, **Then** o botão
   acionado fica indisponível e indica que o comando está em andamento, impedindo envio repetido.

---

### User Story 2 - Cancelar uma impressão com confirmação (Priority: P1)

O usuário cancela a impressão da impressora selecionada. Como cancelar não tem volta, o painel
pede confirmação mostrando qual impressora e qual arquivo serão afetados.

**Why this priority**: cancelar pelo desktop evita correr ao navegador quando a peça claramente
falhou; o risco de perda exige confirmação.

**Independent Test**: com uma impressão em andamento ou pausada, acionar "Cancel", conferir a
confirmação com o nome da impressora e do arquivo, desistir (nada acontece) e depois confirmar
(a impressora cancela e o painel volta a "idle").

**Acceptance Scenarios**:

1. **Given** a impressora selecionada está imprimindo ou pausada, **When** o usuário aciona
   "Cancel", **Then** aparece uma confirmação com o nome da impressora e o nome do arquivo.
2. **Given** a confirmação de cancelamento está aberta, **When** o usuário desiste (botão de
   desistir, Escape ou clique fora), **Then** nenhum comando é enviado.
3. **Given** a confirmação está aberta, **When** o usuário confirma, **Then** o cancelamento é
   enviado e o painel mostra a impressora como "idle" quando ela confirmar.
4. **Given** a impressora está ociosa, em erro ou offline, **When** o painel é exibido, **Then**
   "Cancel" não aparece.

---

### User Story 3 - Parada de emergência (Priority: P1)

Diante de algo errado (colisão, fumaça, peça solta), o usuário aciona a parada de emergência da
impressora selecionada pelo painel. O botão é visualmente distinto dos demais.

**Why this priority**: é a ação de segurança; precisa estar a poucos cliques do desktop.

**Independent Test**: com a impressora ligada e sem impressão importante, acionar "Emergency
stop", conferir a confirmação e que, ao confirmar, a impressora entra em parada
(o painel passa a mostrar "error" com a mensagem do Klipper, como na fatia 001).

**Acceptance Scenarios**:

1. **Given** a impressora selecionada está acessível e com o firmware pronto (imprimindo,
   pausada ou ociosa), **When** o painel é exibido, **Then** o botão "Emergency stop" aparece,
   destacado com a cor de alerta do tema.
2. **Given** o usuário aciona "Emergency stop", **When** a confirmação aparece (com o nome da
   impressora) e o usuário confirma, **Then** o comando de parada é enviado à impressora
   selecionada; desistir não envia nada.
3. **Given** a parada foi executada, **When** o próximo ciclo de atualização ocorre, **Then** o
   painel e o ícone mostram "error" com a mensagem do Klipper.
4. **Given** a impressora está em erro, offline ou já parada, **When** o painel é exibido,
   **Then** "Emergency stop" não aparece.

---

### User Story 4 - Saber se o comando funcionou (Priority: P2)

Depois de acionar qualquer ação, o usuário vê se ela foi aceita ou falhou, e por quê, sem
precisar conferir no navegador.

**Why this priority**: sem retorno, o usuário não sabe se precisa agir de outro jeito; mas as
ações já funcionam sem esta história.

**Independent Test**: acionar uma ação com a impressora acessível (sucesso) e com o computador
fora de `trusted_clients` ou a impressora desligada (falha), conferindo as mensagens.

**Acceptance Scenarios**:

1. **Given** um comando foi aceito pela impressora, **When** a resposta chega, **Then** o painel
   atualiza o estado imediatamente, sem esperar o próximo ciclo.
2. **Given** um comando falhou (sem resposta dentro do tempo limite, acesso não autorizado, ou a
   impressora recusou), **When** a resposta chega, **Then** o painel mostra uma mensagem curta com
   o motivo na área de ações do painel (mesmo que os botões não apareçam mais, por exemplo com a
   impressora offline), até o usuário acionar outra ação ou trocar de impressora.
3. **Given** um comando falhou por falta de resposta, **When** a mensagem é exibida, **Then** o
   comando não é reenviado automaticamente.

---

### Edge Cases

- A impressão termina ou é cancelada por outro meio (Mainsail, tela da impressora) entre a
  exibição do botão e o clique: o comando pode ser recusado pela impressora; o painel mostra a
  falha e, no ciclo seguinte, os botões condizentes com o novo estado.
- O usuário troca de impressora no menu "Printer" com uma confirmação aberta: a confirmação é
  descartada, sem enviar comando.
- O usuário troca de impressora com um comando em andamento: o resultado continua valendo para a
  impressora que recebeu o comando, e a mensagem não aparece na impressora recém-selecionada.
- A impressora fica offline enquanto o painel está aberto: os botões somem no ciclo seguinte.
- Pausar e retomar demoram (a impressora executa macros de estacionamento e aquecimento): o botão
  permanece "em andamento" até a resposta, respeitando o tempo limite dos comandos.
- Duas instâncias do painel (um por monitor) enviando comandos para a mesma impressora: cada uma
  mostra o próprio resultado; o estado real vem sempre da impressora.
- Clique duplo rápido no mesmo botão: só um comando é enviado.
- Painel fechado com um comando em andamento: o comando continua e o resultado aparece no ícone
  pelo estado real no ciclo seguinte.

## Requirements *(mandatory)*

### Functional Requirements

**Botões**

- **FR-001**: O painel MUST exibir os botões de ação da impressora selecionada, abaixo dos
  detalhes, somente quando ela estiver acessível e com o firmware pronto.
- **FR-002**: Imprimindo, o painel MUST oferecer "Pause", "Cancel" e "Emergency stop".
- **FR-003**: Pausada, o painel MUST oferecer "Resume", "Cancel" e "Emergency stop".
- **FR-004**: Ociosa, o painel MUST oferecer apenas "Emergency stop".
- **FR-005**: Em erro, offline ou sem impressoras, o painel MUST NOT exibir botões de ação.
- **FR-006**: "Emergency stop" MUST ser visualmente distinto dos demais botões, usando a cor de
  alerta do tema, e MUST ficar separado de "Cancel" o suficiente para evitar clique acidental.
- **FR-007**: Todos os botões MUST ser acionáveis por mouse e por teclado, seguindo a navegação
  do painel (a mesma do menu "Printer").

**Confirmação**

- **FR-008**: "Cancel" MUST pedir confirmação mostrando o nome da impressora e o nome do arquivo;
  desistir (botão, Escape ou clique fora) MUST NOT enviar comando.
- **FR-009**: "Emergency stop" MUST pedir confirmação simples com o nome da impressora, como o
  cancelamento; desistir MUST NOT enviar comando.
- **FR-010**: "Pause" e "Resume" MUST ser enviados sem confirmação.

**Envio e retorno**

- **FR-011**: Cada ação MUST ser enviada somente à impressora selecionada no painel no momento do
  acionamento.
- **FR-012**: Enquanto um comando está em andamento para uma impressora, o sistema MUST impedir
  novo envio para essa impressora e indicar o andamento no botão acionado. Exceção: "Emergency
  stop" MUST continuar disponível enquanto Pause, Resume ou Cancel está em andamento; com a
  própria parada em andamento, nada mais é enviado.
- **FR-013**: Todo comando MUST ter tempo limite próprio, maior que o da consulta de estado, e
  MUST NOT ser reenviado automaticamente em caso de falha.
- **FR-014**: Ao fim de um comando, com sucesso ou falha, o sistema MUST disparar uma atualização
  imediata do estado daquela impressora.
- **FR-015**: Em caso de falha, o painel MUST exibir uma mensagem curta com o motivo (sem
  resposta, acesso não autorizado, recusa da impressora com a mensagem dela), na área de ações do
  painel, mesmo quando os botões não aparecem (por exemplo, impressora offline depois da falha),
  até a próxima ação ou a troca de impressora.
- **FR-016**: Trocar de impressora no menu MUST descartar uma confirmação aberta sem enviar
  comando.
- **FR-017**: O ícone na barra MUST continuar sem botões; as ações existem só no painel.

### Key Entities

- **Ação**: tipo (pause, resume, cancel, emergency stop), impressora alvo, se exige confirmação,
  estados em que está disponível.
- **Comando em andamento**: impressora alvo, ação, instante de envio; no máximo um por
  impressora por painel, mais uma parada de emergência (exceção do FR-012).
- **Resultado do comando**: sucesso ou falha com motivo; associado à impressora alvo e exibido
  somente quando ela está selecionada.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A partir do desktop, o usuário pausa, retoma ou cancela uma impressão com no máximo
  3 interações (abrir o painel, acionar, confirmar quando houver), sem abrir o navegador.
- **SC-002**: Em rede local, com a impressora respondendo normalmente, a mudança de estado causada
  por uma ação aparece no painel em até 2 segundos depois de a impressora confirmar o comando.
  Com a impressora lenta, o limite é de duas consultas (2 × o tempo limite da consulta).
- **SC-003**: Em testes com cliques repetidos rápidos, 100% das vezes só um comando é enviado.
- **SC-004**: Cancelar uma impressão ou disparar a parada de emergência sem passar pela
  confirmação é impossível (0 ocorrências em teste, por mouse e teclado).
- **SC-005**: Em 100% das falhas simuladas (impressora desligada, acesso negado), o usuário vê o
  motivo da falha no painel.
- **SC-006**: O desktop continua responsivo enquanto um comando lento (pausa com macros longas)
  está em andamento.

## Assumptions

- Mesmo pré-requisito da fatia 001: o computador está em `trusted_clients` do Moonraker; sem isso
  os comandos falham com "unauthorized", como as consultas.
- Os comandos usam as macros padrão da impressora (pausar, retomar e cancelar do Klipper/
  Mainsail); o que cada macro faz (estacionar, resfriar, etc.) é configuração da impressora.
- Depois de uma parada de emergência a impressora fica em erro até alguém reiniciar o firmware;
  reiniciar o firmware pelo painel fica fora desta fatia.
- Rótulos em inglês: "Pause", "Resume", "Cancel", "Emergency stop"; confirmação de cancelamento
  com o nome da impressora e do arquivo.
- Tempo limite dos comandos maior que o da consulta, porque pausar e retomar podem executar
  macros demoradas.
- Fora de escopo nesta fatia: abrir a interface web da impressora (listado na 001 como candidato,
  não pedido agora), reiniciar firmware, ajustar temperaturas ou velocidade, iniciar impressões,
  ações pela barra ou por atalho global, e notificações.
