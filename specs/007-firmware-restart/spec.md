# Feature Specification: Reiniciar o firmware pelo painel

**Feature Branch**: `main` (sem branch dedicada; nenhum hook de branch configurado)

**Created**: 2026-09-30

**Status**: Draft

**Input**: User description: "reiniciar o firmware pelo painel: botão para FIRMWARE_RESTART com confirmação, para recuperar a impressora de erro (depois de parada de emergência ou falha do MCU) sem abrir o Mainsail"

**Contexto**: depois de uma parada de emergência (acionada pelo painel na fatia
[002](../002-panel-print-actions/spec.md) ou por fora) ou de uma falha do firmware (como o
termistor da Biqu em 2026-09-29), o Klipper fica desligado até alguém reiniciar o firmware. Hoje
o painel mostra "error" com o motivo e só oferece "Open web UI" (fatia
[003](../003-open-web-ui/spec.md)); a notificação de falha (fatia
[004](../004-print-notifications/spec.md)) avisa, mas para recuperar é preciso abrir o Mainsail.
Esta fatia acrescenta ao painel um botão para reiniciar o firmware, com confirmação. É a única
ação desta fatia que envia um comando real à impressora. Textos da interface em inglês.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Recuperar a impressora depois de uma parada (Priority: P1)

A impressora está parada em erro (parada de emergência, falha do MCU). O usuário abre o painel,
aciona "Restart firmware", confirma, e a impressora volta a ficar pronta sem ele abrir a interface
web.

**Why this priority**: é o objetivo da fatia; fecha o ciclo "parada de emergência pelo painel →
recuperação pelo painel".

**Independent Test**: com a impressora ociosa, o usuário aciona a parada de emergência pelo painel
(como no teste da 002), depois "Restart firmware" pelo painel, confirma, e confere que a
impressora volta a "idle".

**Acceptance Scenarios**:

1. **Given** a impressora selecionada está com o firmware desligado (parada de emergência ou
   falha), **When** o painel é exibido, **Then** aparece o botão "Restart firmware".
2. **Given** o usuário aciona "Restart firmware", **When** a confirmação aparece (com o nome da
   impressora e um aviso de que o firmware será reiniciado) e ele confirma, **Then** o comando é
   enviado a essa impressora; desistir (botão, Escape ou clique fora) não envia nada.
3. **Given** o comando foi aceito, **When** a impressora reinicia, **Then** o painel acompanha
   ("error" com a mensagem de inicialização, depois "idle") sem ação do usuário.
4. **Given** a impressora está imprimindo, pausada, ociosa ou offline, **When** o painel é
   exibido, **Then** "Restart firmware" não aparece.

---

### User Story 2 - Saber se o reinício deu certo (Priority: P2)

Se o reinício falha (a impressora não responde, recusa, ou volta a entrar em erro por causa da
mesma falha), o usuário vê o motivo no painel, como nas outras ações.

**Why this priority**: sem retorno, o usuário não sabe se precisa ir até a máquina; mas o caso
principal já funciona sem esta história.

**Independent Test**: com o Moonraker falso recusando o comando, acionar e ver a mensagem; com a
falha persistente (o falso volta a "shutdown" depois do reinício), ver o motivo do erro de novo.

**Acceptance Scenarios**:

1. **Given** o comando falhou (sem resposta, acesso negado, recusa), **When** a resposta chega,
   **Then** o painel mostra uma mensagem curta com o motivo na área de ações
   (`Restart firmware failed: …`), como na fatia 002.
2. **Given** o comando foi aceito mas a impressora volta a entrar em erro (a causa física
   continua), **When** o painel atualiza, **Then** ele mostra de novo "error" com o motivo da
   impressora e o botão "Restart firmware" volta a aparecer.

---

### Edge Cases

- **Reinício em andamento**: enquanto o comando não responde, o botão fica indisponível e indica o
  andamento; um segundo clique não envia outro comando.
- **Klipper reiniciando** (mensagem de inicialização): o botão não aparece; a impressora já está
  voltando.
- **Serviço do Klipper desconectado do Moonraker** (a impressora responde, mas o firmware nem está
  conectado): reiniciar o firmware não resolve esse caso (é preciso reiniciar o serviço no
  computador da impressora); o botão não aparece. Fora de escopo.
- **Erro de impressão com o firmware pronto** (a impressão falhou, mas o Klipper está ok): o botão
  não aparece; não há o que reiniciar.
- **Erro de configuração do Klipper**: o firmware está em erro; o botão aparece, mas o reinício só
  resolve se a configuração tiver sido corrigida. A mensagem de erro da impressora continua
  visível para o usuário entender.
- **Notificações (fatia 004)**: reiniciar pelo painel não gera notificação de falha nem de nada;
  a proteção das ações do painel vale também para esta.
- **Troca de impressora com a confirmação aberta**: a confirmação é descartada sem enviar nada
  (como na 002).
- **Vários monitores**: o comando vale para a impressora escolhida no painel em que o usuário
  confirmou.
- **Parada de emergência e reinício**: o botão "Emergency stop" continua sem aparecer em erro
  (fatia 002); os dois nunca aparecem juntos.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O painel MUST oferecer "Restart firmware" para a impressora selecionada quando o
  firmware dela estiver desligado ou em erro (parada de emergência, falha do MCU, erro do
  firmware) e a impressora estiver respondendo.
- **FR-002**: "Restart firmware" MUST NOT aparecer com a impressora imprimindo, pausada, ociosa,
  offline, com o firmware reiniciando, com o serviço do firmware desconectado ou com apenas um
  erro de impressão (firmware pronto).
- **FR-003**: "Restart firmware" MUST pedir confirmação com o nome da impressora e um aviso de que
  o firmware será reiniciado; a confirmação MUST abrir com "Back" selecionado, como na 002;
  desistir MUST NOT enviar nada.
- **FR-004**: O comando MUST ser enviado só à impressora selecionada no momento da confirmação.
- **FR-005**: Enquanto o comando está em andamento para uma impressora, o sistema MUST impedir
  novo envio para ela e indicar o andamento no botão.
- **FR-006**: O comando MUST ter tempo limite e MUST NOT ser reenviado automaticamente.
- **FR-007**: Ao fim do comando, com sucesso ou falha, o painel MUST atualizar o estado da
  impressora imediatamente (como na 002) e continuar acompanhando o reinício nos ciclos
  seguintes.
- **FR-008**: Em caso de falha, o painel MUST mostrar `Restart firmware failed: <motivo>` na área
  de ações até a próxima ação ou a troca de impressora (como na 002).
- **FR-009**: O botão MUST ficar na área de ações do painel, em linha própria, com aparência de
  ação comum (não a cor de alerta da parada de emergência), e MUST ser acionável por mouse e
  teclado como os demais botões.
- **FR-010**: Reiniciar pelo painel MUST NOT gerar notificação (a proteção das ações do painel da
  fatia 004 vale para este comando).
- **FR-011**: O ícone da barra MUST continuar sem controles.

### Key Entities

- **Ação "Restart firmware"**: impressora alvo, exige confirmação, disponível só com o firmware
  em erro; segue o mesmo ciclo das ações da 002 (em andamento, sucesso, falha com motivo).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Depois de uma parada de emergência, o usuário recupera a impressora pelo painel com
  no máximo 3 interações (abrir o painel, acionar, confirmar), sem abrir a interface web.
- **SC-002**: Em uma impressora real, o painel volta a mostrar "idle" em até 2 ciclos depois de a
  impressora terminar de reiniciar.
- **SC-003**: Em 100% dos testes, reiniciar sem passar pela confirmação é impossível (mouse e
  teclado), e desistir não envia nada.
- **SC-004**: Em 100% dos estados fora de "firmware em erro com a impressora respondendo", o botão
  não aparece.
- **SC-005**: Reiniciar pelo painel gera 0 notificações.
- **SC-006**: Em 100% das falhas simuladas, o usuário vê o motivo no painel.

## Assumptions

- O comando é o mesmo "reiniciar o firmware" que o Mainsail oferece; a impressora faz o
  reinício sozinha (em geral alguns segundos) e volta a ficar pronta se a causa da falha não
  existir mais.
- O plugin não diagnostica a falha: mostra o motivo que a impressora informa (fatias 001/004).
- Mesmos pré-requisitos das ações da 002: o computador está autorizado na impressora.
- O teste em hardware usa a parada de emergência pelo painel com a impressora ociosa e fria, feita
  pelo usuário, como na 002; o reinício também é acionado pelo usuário.
- Fora de escopo: reiniciar o serviço do firmware ou do Moonraker no computador da impressora,
  reiniciar o computador da impressora, reinício automático, diagnóstico de falhas e reinício pela
  barra ou por atalho.
