# Feature Specification: Notificações de impressão no desktop

**Feature Branch**: `main` (sem branch dedicada; nenhum hook de branch configurado)

**Created**: 2026-09-30

**Status**: Concluída em 2026-09-30 (teste em hardware aprovado na Voron; falha e contato perdido validados só com o Moonraker falso, por segurança; ver [hardware-test.md](./hardware-test.md))

**Input**: User description: "notificações no desktop: avisar quando a impressão termina, falha ou pausa sozinha (ex.: fim de filamento)"

**Contexto**: continuação das fatias [001](../001-printer-status-bar/spec.md) (status na barra e
painel), [002](../002-panel-print-actions/spec.md) (Pause/Resume/Cancel/Emergency stop) e
[003](../003-open-web-ui/spec.md) (abrir a interface web). Hoje o usuário só percebe que uma
impressão acabou ou deu problema olhando para o ícone da barra. Esta fatia avisa por notificação
do desktop quando algo importante acontece com uma impressão, sem que ele precise olhar. Os
textos da interface são em inglês (decisão da fatia 001).

## Clarifications

### Session 2026-09-30

- Q: Pausas acionadas pelo usuário fora do plugin (Mainsail, tela da impressora) também
  notificam? → A: sim; toda pausa que não veio do "Pause" do painel do plugin notifica, porque o
  Klipper não informa a causa e perder um fim de filamento é pior que um aviso a mais.
- Q: Notificar quando uma impressora que estava imprimindo ou pausada para de responder? → A:
  sim, uma vez, depois de 3 leituras seguidas sem resposta (cerca de 15 s no padrão), para pegar
  queda de energia sem avisar a cada falha curta de rede.
- Q: Uma impressora sem impressão que entra em erro deve notificar? → A: sim, quando na última
  leitura antes do erro algum aquecedor estava ligado (temperatura alvo acima de zero), mesmo sem
  impressão; ociosa e fria, não.
- Q: Quais notificações ficam na tela até serem fechadas? → A: falha e contato perdido ficam até
  o usuário fechar; conclusão e pausa somem no tempo padrão do desktop.
- Q: Por quanto tempo uma ação do painel impede a notificação do efeito dela? → A: enquanto o
  comando está em andamento e até a primeira leitura da impressora depois da resposta; depois
  disso, qualquer mudança notifica.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Saber que a impressão terminou (Priority: P1)

O usuário deixa uma impressão longa rodando e vai trabalhar em outra coisa. Quando ela termina,
aparece uma notificação do desktop dizendo qual impressora terminou e qual arquivo, para ele
retirar a peça.

**Why this priority**: é o aviso mais frequente e o que mais economiza atenção: impressões duram
horas, e hoje é preciso ficar conferindo o ícone.

**Independent Test**: com uma impressão curta em andamento, esperar o fim e conferir que aparece
uma única notificação com o nome da impressora e do arquivo.

**Acceptance Scenarios**:

1. **Given** uma impressora está imprimindo (ou pausada), **When** a impressão termina com
   sucesso, **Then** aparece uma notificação "impressão concluída" com o nome da impressora e o
   nome do arquivo.
2. **Given** a notificação de conclusão foi mostrada, **When** os ciclos seguintes continuam
   vendo a impressora como concluída/ociosa, **Then** nenhuma notificação nova aparece.
3. **Given** o usuário cancelou a impressão (pelo painel, pelo Mainsail ou pela tela da
   impressora), **When** a impressora volta a ociosa, **Then** nenhuma notificação de conclusão
   aparece.

---

### User Story 2 - Saber que a impressão falhou (Priority: P1)

Durante uma impressão, algo dá errado (erro de impressão, desligamento do Klipper por falha de
sensor, parada de emergência). O usuário recebe uma notificação destacada com a impressora e o
motivo, para ir ver a máquina.

**Why this priority**: é o aviso mais importante para segurança e para não perder horas de
impressão; uma falha ignorada pode significar filamento derretido ou peça perdida.

**Independent Test**: provocar um erro numa impressora de teste com uma impressão em andamento e
conferir a notificação destacada com o motivo informado pelo Klipper.

**Acceptance Scenarios**:

1. **Given** uma impressora está imprimindo ou pausada, **When** ela passa para erro (erro da
   impressão ou do Klipper), **Then** aparece uma notificação "impressão falhou" com o nome da
   impressora e o motivo, com destaque de urgência maior que o da conclusão.
2. **Given** a impressora já está em erro, **When** os ciclos seguintes continuam em erro,
   **Then** nenhuma notificação nova aparece.
3. **Given** a impressora está ociosa (sem impressão) com os aquecedores desligados, **When** ela
   passa para erro, **Then** nenhuma notificação aparece.
4. **Given** uma impressora está imprimindo ou pausada, **When** ela deixa de responder por 3
   leituras seguidas, **Then** aparece uma única notificação "contato perdido" com o nome da
   impressora e do arquivo; **When** ela volta a responder, nenhuma notificação aparece por isso.
5. **Given** uma impressora imprimindo deixa de responder por 1 ou 2 leituras e volta, **When**
   ela responde de novo, **Then** nenhuma notificação aparece.
6. **Given** a impressora está ociosa, sem impressão, mas com um aquecedor ligado (por exemplo,
   preaquecendo o bico), **When** ela passa para erro, **Then** aparece a notificação de falha
   com o nome da impressora e o motivo (sem arquivo).

---

### User Story 3 - Saber que a impressão pausou sozinha (Priority: P2)

A impressora pausa por conta própria, por exemplo por fim de filamento ou entupimento detectado
por uma macro. O usuário recebe uma notificação para trocar o filamento e retomar.

**Why this priority**: evita que a impressão fique parada por horas esperando alguém; mas é menos
frequente que conclusão e falha.

**Independent Test**: com uma impressão em andamento, disparar uma pausa por fora do painel do
plugin (simulando fim de filamento, ou pelo Mainsail) e conferir a notificação; depois pausar pelo
próprio painel e conferir que nenhuma notificação aparece.

**Acceptance Scenarios**:

1. **Given** uma impressora está imprimindo, **When** ela passa para pausada sem que o usuário
   tenha acionado "Pause" no painel do plugin, **Then** aparece uma notificação "impressão
   pausada" com o nome da impressora e do arquivo.
2. **Given** o usuário acionou "Pause" no painel do plugin, **When** a impressora pausa, **Then**
   nenhuma notificação aparece.
3. **Given** a impressora está pausada, **When** ela continua pausada nos ciclos seguintes,
   **Then** nenhuma notificação nova aparece.

---

### User Story 4 - Escolher o que notificar (Priority: P3)

O usuário que não quer notificações (ou só quer algumas) consegue desligá-las pela configuração
do widget, como as demais configurações do plugin.

**Why this priority**: o padrão atende a maioria; ajustar é conveniência.

**Independent Test**: desligar as notificações na configuração, repetir um cenário de conclusão e
conferir que nada aparece; religar e conferir que volta.

**Acceptance Scenarios**:

1. **Given** as notificações estão desligadas na configuração, **When** uma impressão termina,
   falha ou pausa sozinha, **Then** nenhuma notificação aparece e o resto do plugin funciona
   igual.
2. **Given** uma configuração existente, sem as novas opções, **When** o plugin é atualizado,
   **Then** as notificações ficam ligadas por padrão, sem editar nada.

---

### Edge Cases

- **Vários monitores**: o plugin tem uma barra por monitor; cada evento gera **uma** notificação,
  não uma por monitor.
- **Início do shell ou mudança de configuração**: o primeiro estado lido de uma impressora não é
  comparado com nada; uma impressora que já está concluída, pausada ou em erro quando o shell
  inicia não gera notificação.
- **Impressão que termina entre dois ciclos**: se a impressora passa de imprimindo para ociosa sem
  que o estado "concluída" seja visto, a conclusão não é inferida (pode ter sido cancelamento);
  nenhuma notificação aparece.
- **Cancelamento na Voron**: a macro de cancelamento dela vai de pausada direto para ociosa, sem
  passar por "cancelada"; isso não pode virar notificação de conclusão nem de pausa.
- **Pause do painel que falha**: o usuário aciona Pause, o comando falha e a impressora continua
  imprimindo; a proteção termina na leitura seguinte, e uma pausa por fim de filamento minutos
  depois notifica.
- **Pausa seguida de cancelamento**: o usuário pausa e cancela pelo Mainsail; a pausa gera a
  notificação da US3 (não foi pelo painel), o cancelamento não gera nada.
- **Impressora que fica sem resposta durante uma impressão**: notifica uma vez depois de 3
  leituras seguidas sem resposta (FR-014); falhas mais curtas não notificam. Se ela voltar e
  depois concluir, falhar ou pausar, os eventos normais valem a partir da nova leitura.
- **Contato perdido e depois concluída**: a impressora cai, volta com a impressão concluída ou em
  erro; a comparação é com o último estado com resposta (imprimindo), então a conclusão ou a falha
  notificam normalmente.
- **Duas impressoras** terminando ao mesmo tempo: uma notificação para cada.
- **Desktop sem serviço de notificações**: o resto do plugin continua funcionando e o usuário é
  avisado de que as notificações não estão disponíveis (Princípio IV da constituição).
- **Parada de emergência pelo próprio painel** durante uma impressão: o usuário acabou de
  acioná-la, então não gera a notificação de falha (FR-005). Uma parada de emergência vinda de
  fora (Mainsail, botão físico) gera.

## Requirements *(mandatory)*

### Functional Requirements

**Eventos**

- **FR-001**: O sistema MUST notificar "impressão concluída" quando uma impressora que estava
  imprimindo ou pausada passa a reportar a impressão como concluída.
- **FR-002**: O sistema MUST notificar "impressão falhou" quando uma impressora que estava
  imprimindo ou pausada passa para erro (erro da impressão ou do Klipper), incluindo o motivo
  informado pela impressora. O Klipper reiniciando (estado "startup", por exemplo depois de um
  FIRMWARE_RESTART pedido pelo usuário) MUST NOT contar como falha. Também MUST notificar a falha, sem arquivo, quando uma impressora
  sem impressão passa para erro e na leitura anterior algum aquecedor (bico ou mesa) tinha
  temperatura alvo acima de zero. Ociosa com os aquecedores desligados, a passagem para erro MUST
  NOT notificar.
- **FR-003**: O sistema MUST notificar "impressão pausada" quando uma impressora que estava
  imprimindo passa para pausada, exceto quando a pausa veio de "Pause" acionado no painel do
  plugin. Pausas acionadas fora do plugin (Mainsail, tela da impressora, macros como fim de
  filamento) notificam todas, porque o plugin não distingue a causa.
- **FR-004**: Cancelamentos (por qualquer meio) MUST NOT gerar notificação.
- **FR-005**: Ações acionadas no painel do plugin (Pause, Resume, Cancel, Emergency stop) MUST NOT gerar
  notificação do resultado que elas mesmas causam. A proteção vale enquanto o comando está em
  andamento e até a primeira leitura da impressora depois da resposta, com sucesso ou falha;
  depois disso, qualquer mudança de estado notifica normalmente. A proteção vale para a
  impressora que recebeu o comando, qualquer que seja o monitor em que o painel estava.
- **FR-006**: Cada notificação MUST identificar a impressora pelo nome exibido no plugin e, quando
  houver, o nome do arquivo.
- **FR-007**: As notificações de falha e de contato perdido MUST ter urgência maior que as de
  conclusão e de pausa, de forma que o desktop as destaque. (Emenda do plano, 2026-09-30: o
  serviço de notificações do Omarchy só mantém na tela as de urgência máxima, então o FR-007a
  exige a mesma urgência para falha e contato perdido.)
- **FR-007a**: As notificações de falha e de contato perdido MUST ficar na tela até o usuário
  fechá-las; as de conclusão e de pausa MUST seguir o tempo padrão do desktop.

**Quando não notificar**

- **FR-008**: O sistema MUST notificar só em mudança de estado observada entre duas leituras da
  mesma impressora; o primeiro estado lido (início do shell, impressora nova, mudança de
  configuração) MUST NOT gerar notificação.
- **FR-009**: Cada evento MUST gerar no máximo uma notificação, qualquer que seja o número de
  monitores ou de barras com o widget.
- **FR-010**: Um estado que se repete nos ciclos seguintes MUST NOT gerar nova notificação.

**Configuração e degradação**

- **FR-011**: A configuração do widget MUST permitir ligar ou desligar cada tipo de notificação
  (concluída, falhou, pausada, contato perdido); todos ligados por padrão. Configurações existentes, sem as novas
  opções, MUST continuar válidas.
- **FR-012**: Se o desktop não puder mostrar notificações, o plugin MUST continuar funcionando e
  MUST mostrar um aviso visível no painel dizendo que as notificações estão indisponíveis.
- **FR-013**: O ícone na barra e o painel MUST continuar como nas fatias anteriores; as
  notificações são um canal a mais, não substituem o estado visível.

**Contato perdido**

- **FR-014**: O sistema MUST notificar "contato perdido" uma única vez quando uma impressora cujo
  último estado com resposta era imprimindo ou pausada fica sem responder por 3 leituras
  seguidas. A volta da resposta MUST NOT notificar, e uma nova perda só notifica depois de a
  impressora ter respondido de novo com uma impressão em andamento.

### Key Entities

- **Evento de impressão**: tipo (concluída, falhou, pausada, contato perdido), impressora, arquivo, motivo (falha)
  e instante; derivado da comparação entre a leitura anterior e a atual de uma impressora.
- **Última leitura observada por impressora**: o último estado com resposta (incluindo se algum
  aquecedor estava ligado), usado na comparação, e quantas leituras seguidas ficaram sem resposta; não existe no início, para
  impedir notificações de estados antigos.
- **Preferências de notificação**: um liga/desliga por tipo de evento, na configuração do widget.
- **Ação recente do painel**: a ação que o próprio plugin acionou numa impressora (pausa, retoma,
  cancela, parada), usada para não notificar o efeito dela.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 100% dos testes, a notificação de conclusão, falha ou pausa automática aparece em
  até um ciclo de atualização depois de a impressora reportar a mudança (5 s no padrão).
- **SC-002**: Com dois monitores, 100% dos eventos geram exatamente uma notificação.
- **SC-003**: Reiniciar o shell com impressoras concluídas, pausadas ou em erro gera 0
  notificações.
- **SC-004**: Cancelar uma impressão (pelo painel ou pelo Mainsail) gera 0 notificações, inclusive
  na Voron, cujo cancelamento vai de pausada direto para ociosa.
- **SC-005**: Pausar pelo painel do plugin gera 0 notificações; pausar pelo Mainsail gera 1; uma
  pausa externa logo depois de um Pause do painel que falhou gera 1.
- **SC-006**: Com as notificações indisponíveis no desktop, o usuário vê o aviso no painel e todas
  as funções das fatias 001–003 continuam funcionando.
- **SC-007**: Com uma impressão em andamento, cortar o acesso à impressora por mais de 3 ciclos
  gera exatamente 1 notificação de contato perdido (em até 4 ciclos, cerca de 20 s no padrão);
  cortar por 1 ou 2 ciclos gera 0.
- **SC-008**: Uma impressora ociosa que entra em erro gera 1 notificação se tinha um aquecedor
  ligado na leitura anterior e 0 se estava fria.
- **SC-009**: Em 100% dos testes, as notificações de falha e de contato perdido continuam na tela
  depois de 1 minuto sem interação; as de conclusão e de pausa somem sozinhas.

## Assumptions

- As notificações usam o serviço de notificações do próprio desktop (o Omarchy traz um); o plugin
  não desenha janelas próprias. Com o "Não perturbe" ligado, o desktop guarda as notificações no
  histórico em vez de mostrá-las, inclusive as de falha; o plugin não contorna isso.
- A detecção é pela mesma consulta periódica das fatias anteriores; não há atualização em tempo
  real nesta fatia, então o aviso pode chegar até um ciclo depois do evento.
- O Klipper reporta a conclusão como um estado próprio ("complete"); impressões que o Klipper
  termina sem esse estado (macros que resetam direto para ocioso) não geram notificação de
  conclusão, pela mesma regra do cancelamento.
- A "pausa sozinha" é reconhecida pela transição imprimindo → pausada; o Klipper não informa a
  causa da pausa, por isso toda pausa que não veio do painel do plugin notifica (Clarifications).
- O limite de 3 leituras sem resposta é fixo nesta fatia (cerca de 15 s com o intervalo padrão de
  5 s; proporcional ao intervalo configurado).
- Clicar na notificação não faz nada além do comportamento padrão do desktop (fechá-la); ações na
  notificação (abrir o painel, abrir a interface web) ficam fora desta fatia.
- Rótulos em inglês, por exemplo: "Print complete", "Print failed", "Print paused",
  "Printer not responding".
- Fora de escopo nesta fatia: som próprio, notificação de progresso (por exemplo, a cada 25%),
  aviso de primeira camada, notificações por e-mail ou celular, histórico de notificações no
  painel e atualização em tempo real.
