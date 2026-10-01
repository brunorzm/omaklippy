# Feature Specification: Reiniciar o serviço do Klipper pelo painel

**Feature Branch**: `main` (sem branch dedicada; nenhum hook de branch configurado)

**Created**: 2026-09-30

**Status**: Concluída em 2026-10-01 (serviço do Klipper parado pelo usuário e reiniciado pelo painel na Voron; ver [hardware-test.md](./hardware-test.md))

**Input**: User description: "reiniciar o serviço do Klipper pelo painel: quando o Klipper está desconectado do Moonraker (a impressora responde, mas \"Klippy Host not connected\"), oferecer no painel um botão com confirmação para reiniciar o serviço do Klipper no computador da impressora, recuperando sem abrir o Mainsail; complementa a fatia 007 (que cobre shutdown/erro com FIRMWARE_RESTART)"

**Contexto**: a fatia [007](../007-firmware-restart/spec.md) recupera a impressora quando o
firmware está desligado ou em erro. Ela deixou de fora um caso: o computador da impressora
responde, mas o serviço do Klipper não está conectado a ele (o serviço parou, travou ou não
iniciou). Nesse caso reiniciar o firmware não adianta; é preciso reiniciar o serviço do Klipper no
computador da impressora, o que hoje só se faz pela interface web. Esta fatia acrescenta ao painel
um botão para isso, com confirmação.

Uma observação do teste em hardware da 007 define o cuidado principal: durante um reinício normal
do firmware, a Voron também informou "serviço não conectado" por cerca de 2 s. O botão não pode
aparecer nessas passagens rápidas, só quando a desconexão persiste. Textos da interface em inglês.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Recuperar a impressora com o serviço do Klipper parado (Priority: P1)

A impressora responde, mas o serviço do Klipper está desconectado há algum tempo. O usuário abre
o painel, aciona "Restart Klipper", confirma, e a impressora volta a ficar pronta (ou mostra o
erro real do firmware, que a fatia 007 já sabe tratar) sem ele abrir a interface web.

**Why this priority**: é o objetivo da fatia; completa a recuperação de erros pelo painel.

**Independent Test**: com o Moonraker falso informando serviço desconectado de forma contínua,
ver o botão aparecer, acionar, confirmar e ver o painel passar pela inicialização até "idle".

**Acceptance Scenarios**:

1. **Given** a impressora selecionada responde mas informa o serviço do Klipper desconectado de
   forma contínua por pelo menos 15 s, **When** o painel é exibido, **Then** aparece o botão
   "Restart Klipper".
2. **Given** o serviço está desconectado há menos de 15 s (por exemplo, no meio de um reinício do
   firmware), **When** o painel é exibido, **Then** o botão não aparece.
3. **Given** o usuário aciona "Restart Klipper", **When** a confirmação aparece (com o nome da
   impressora e um aviso de que o serviço do Klipper será reiniciado no computador da impressora)
   e ele confirma, **Then** o comando é enviado a essa impressora; desistir (botão, Escape ou
   clique fora) não envia nada.
4. **Given** o comando foi aceito, **When** o serviço reinicia, **Then** o painel acompanha
   (inicialização, depois "idle", ou "error" com o motivo do firmware) sem ação do usuário.
5. **Given** a impressora está imprimindo, pausada, ociosa, offline, com o firmware desligado ou
   em erro (caso da 007), ou reiniciando, **When** o painel é exibido, **Then** "Restart Klipper"
   não aparece.

---

### User Story 2 - Saber se o reinício do serviço deu certo (Priority: P2)

Se o comando falha (sem resposta, acesso negado, a impressora não permite reiniciar esse serviço)
ou o serviço continua desconectado depois do reinício, o usuário vê o motivo no painel.

**Why this priority**: sem retorno o usuário não sabe se precisa ir até a máquina; o caso
principal já funciona sem esta história.

**Independent Test**: com o Moonraker falso recusando o comando, ver a mensagem; com o falso
continuando desconectado depois do reinício, ver o botão voltar depois de 15 s.

**Acceptance Scenarios**:

1. **Given** o comando falhou, **When** a resposta chega, **Then** o painel mostra
   `Restart Klipper failed: <motivo>` na área de ações, como nas fatias 002 e 007.
2. **Given** o comando foi aceito mas o serviço continua desconectado, **When** a desconexão volta
   a durar 15 s, **Then** o botão "Restart Klipper" aparece de novo.

---

### Edge Cases

- **Passagens rápidas**: reinício do firmware (007), reinício do Klipper por outro meio e
  reinício do próprio serviço por este botão passam por "serviço desconectado" por alguns
  segundos; a contagem dos 15 s recomeça a cada vez que a impressora volta a informar o Klipper
  conectado, e o botão não aparece nessas passagens.
- **Impressora offline** (nem o computador da impressora responde): o botão não aparece; reiniciar
  o serviço exige que ele responda.
- **Serviço de firmware com outro nome** (instalações com mais de uma instância do Klipper): o
  comando vale para o serviço do Klipper que essa impressora informa como seu.
- **Impressora que não permite reiniciar o serviço** (lista de serviços permitidos da
  impressora): o comando falha e o painel mostra o motivo; o botão continua disponível.
- **Reinício em andamento**: enquanto o comando não responde, o botão fica indisponível e indica o
  andamento; um segundo clique não envia outro comando.
- **Painel aberto ou fechado**: o tempo de desconexão conta desde a primeira consulta que a
  informou, independentemente de o painel estar aberto; abrir o painel depois de 15 s já mostra o
  botão.
- **Troca de impressora com a confirmação aberta**: a confirmação é descartada sem enviar nada
  (como na 002 e na 007).
- **Notificações (fatia 004)**: reiniciar o serviço pelo painel não gera notificação; a proteção
  das ações do painel vale também para esta.
- **Depois do reinício, firmware em erro**: se o Klipper volta em "shutdown" ou "error", o painel
  passa a oferecer "Restart firmware" (007); os dois botões nunca aparecem juntos.
- **Vários monitores**: o comando vale para a impressora escolhida no painel em que o usuário
  confirmou; cada barra conta o tempo de desconexão pelas próprias consultas.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O painel MUST oferecer "Restart Klipper" para a impressora selecionada quando ela
  estiver respondendo mas informando o serviço do Klipper desconectado de forma contínua há pelo
  menos 15 s.
- **FR-002**: "Restart Klipper" MUST NOT aparecer com a desconexão mais curta que 15 s, nem com a
  impressora imprimindo, pausada, ociosa, offline, reiniciando, com o firmware desligado ou em
  erro, ou com apenas um erro de impressão.
- **FR-003**: Qualquer consulta em que a impressora não informe o serviço desconectado MUST
  recomeçar a contagem dos 15 s.
- **FR-004**: "Restart Klipper" MUST pedir confirmação com o nome da impressora e um aviso de que o
  serviço do Klipper será reiniciado no computador da impressora; a confirmação MUST abrir com
  "Back" selecionado; desistir MUST NOT enviar nada.
- **FR-005**: O comando MUST ser enviado só à impressora selecionada no momento da confirmação e
  MUST reiniciar o serviço do Klipper que essa impressora informa como seu.
- **FR-006**: Enquanto o comando está em andamento para uma impressora, o sistema MUST impedir novo
  envio para ela e indicar o andamento no botão.
- **FR-007**: O comando MUST ter tempo limite e MUST NOT ser reenviado automaticamente.
- **FR-008**: Ao fim do comando, com sucesso ou falha, o painel MUST atualizar o estado da
  impressora imediatamente e continuar acompanhando o reinício nos ciclos seguintes.
- **FR-009**: Em caso de falha, o painel MUST mostrar `Restart Klipper failed: <motivo>` na área de
  ações até a próxima ação ou a troca de impressora.
- **FR-010**: O botão MUST ficar na área de ações, em linha própria, com aparência de ação comum,
  acionável por mouse e teclado como os demais.
- **FR-011**: Reiniciar pelo painel MUST NOT gerar notificação.
- **FR-012**: O ícone da barra MUST continuar sem controles.
- **FR-013**: Um mesmo comando para a mesma impressora MUST NOT sair duas vezes em 5 s, mesmo a
  partir de barras diferentes (um monitor = uma barra); depois de uma falha, o usuário pode tentar
  de novo na hora. Acrescentado na implementação (2026-10-01): na primeira validação com o
  Moonraker falso saíram dois reinícios de uma confirmação, sem repetição em duas tentativas
  seguintes; a única origem possível é uma segunda barra.

### Key Entities

- **Ação "Restart Klipper"**: impressora alvo, exige confirmação, disponível só com o serviço do
  Klipper desconectado há pelo menos 15 s; mesmo ciclo das ações da 002 e da 007.
- **Tempo de desconexão**: por impressora, o instante da primeira consulta seguida que informou o
  serviço desconectado; zerado por qualquer consulta que não o informe.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Com o serviço do Klipper parado, o usuário recupera a impressora pelo painel com no
  máximo 3 interações (abrir o painel, acionar, confirmar), sem abrir a interface web.
- **SC-002**: Em 100% dos reinícios de firmware e de serviço observados, o botão não aparece nas
  passagens de desconexão de até 15 s.
- **SC-003**: O botão aparece em até 1 ciclo de atualização depois de a desconexão completar 15 s.
- **SC-004**: Em 100% dos testes, reiniciar sem passar pela confirmação é impossível (mouse e
  teclado), e desistir não envia nada.
- **SC-005**: Reiniciar pelo painel gera 0 notificações.
- **SC-006**: Em 100% das falhas simuladas, o usuário vê o motivo no painel.

## Assumptions

- O computador da impressora sabe reiniciar o serviço do Klipper por conta própria (é o que a
  interface web usa) e informa qual é o serviço do Klipper dessa impressora; a Voron e a Biqu
  permitem reiniciar o serviço `klipper` (conferido em 2026-09-30).
- 15 s é o limite para "desconexão persistente": na Voron, o reinício do firmware ficou 2 s nesse
  estado; com o intervalo de atualização padrão (5 s), são 3 ou 4 consultas seguidas.
- Mesmos pré-requisitos das ações da 002: o computador está autorizado na impressora.
- O teste em hardware depende de o usuário parar o serviço do Klipper na impressora (pela
  interface web ou pelo terminal dela) e depois reiniciá-lo pelo painel; o assistente só observa.
- Fora de escopo: reiniciar o Moonraker, outros serviços ou o computador da impressora; parar ou
  iniciar serviços; reinício automático; diagnóstico da causa da desconexão; reinício pela barra
  ou por atalho.
