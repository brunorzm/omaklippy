# Feature Specification: Status em tempo real pela conexão contínua com o Moonraker

**Feature Branch**: `main` (sem branch dedicada; nenhum hook de branch configurado)

**Created**: 2026-10-01

**Status**: Concluída em 2026-10-01 (Voron e Biqu B1 ao vivo pelo WebSocket, queda e volta do Moonraker e do Klipper, pausa e retomada de uma impressão real pelo painel; ver [hardware-test.md](./hardware-test.md))

**Input**: User description: "atualizar o status das impressoras em tempo real pela conexão WebSocket do Moonraker (JSON-RPC, inscrição nos objetos de status), no lugar da consulta HTTP a cada 5 s. Decisões já tomadas pelo usuário: (1) os comandos do painel (pausar, retomar, cancelar, parada de emergência, reiniciar firmware/Klipper) continuam por HTTP, para a parada de emergência nunca depender da conexão; (2) uma conexão por barra (cada instância do widget, uma por monitor, abre a sua), sem conexão compartilhada entre barras; (3) a consulta HTTP periódica continua como alternativa automática quando o WebSocket não está disponível (QtWebSockets ausente, conexão recusada ou caída, até reconectar), com reconexão automática, para o plugin nunca ficar pior do que hoje. O efeito de um comando aparece pela inscrição, sem a consulta extra de hoje."

**Contexto**: desde a fatia [001](../001-printer-status-bar/spec.md), o widget pergunta o status de
cada impressora a cada 5 s (padrão), e cada barra (uma por monitor) pergunta por conta própria: com
dois monitores e duas impressoras, são 48 consultas por minuto mesmo com tudo parado, e uma mudança
(uma pausa, o fim da impressão, um erro) leva até 5 s para aparecer. A 001 deixou a atualização em
tempo real fora de escopo, e a constituição já prevê a conexão contínua com o Moonraker quando o
componente dela estiver disponível (está instalado neste computador). Esta fatia troca a consulta
periódica por essa conexão, sem mudar o que o usuário vê, salvo a rapidez.

Decisões do usuário (2026-10-01), antes da spec:

1. Os **comandos** do painel continuam pelo caminho de hoje, independente da conexão: a parada de
   emergência nunca pode depender de a conexão estar de pé.
2. **Uma conexão por barra**: cada barra (monitor) abre a sua, como hoje cada uma faz suas
   consultas; nada é compartilhado entre barras.
3. A **consulta periódica de hoje continua como alternativa automática** sempre que a conexão
   contínua não está disponível, até ela voltar, para o plugin nunca ficar pior do que hoje.

## Clarifications

### Session 2026-10-01

- Q: Como o painel deve mostrar que o status de uma impressora está chegando ao vivo pela conexão
  contínua? → A: a linha de atualização no pé do painel diz `live` no lugar de "updated … ago"; com
  a consulta periódica, volta ao texto de hoje. O ícone da barra não muda.
- Q: Quando o componente da conexão contínua não estiver instalado, o painel deve avisar? → A: sim,
  com uma linha discreta como a das notificações (004): "Live updates unavailable: …", dizendo o que
  instalar; o resto funciona como hoje.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver mudanças da impressora na hora (Priority: P1)

Com a impressora ligada e a conexão contínua de pé, toda mudança de status (estado, progresso,
temperaturas, mensagem, camada) aparece na barra e no painel em cerca de 1 s, sem que o widget
fique perguntando a cada intervalo. O que é mostrado e como é mostrado não muda; só a rapidez.

**Why this priority**: é o objetivo da fatia: menos tráfego e processos com tudo parado, e
mudanças visíveis na hora.

**Independent Test**: com a Voron ociosa, pedir ao usuário que aqueça o bico pelo Mainsail e ver a
temperatura e o alvo mudarem no painel em cerca de 1 s; conferir que, com a impressora parada,
o widget não faz mais a consulta periódica de status.

**Acceptance Scenarios**:

1. **Given** uma impressora com a conexão contínua de pé, **When** o estado dela muda (começa,
   pausa, termina ou falha uma impressão, ou o Klipper entra em erro), **Then** a barra e o painel
   mostram o novo estado em até 2 s, com os mesmos textos e sinais de hoje.
2. **Given** a conexão contínua de pé, **When** o progresso, as temperaturas, a mensagem ou a
   camada mudam, **Then** o painel aberto mostra os valores novos em até 2 s.
3. **Given** a conexão contínua de pé e nada mudando, **When** passa um minuto, **Then** o widget
   não fez nenhuma consulta periódica de status àquela impressora.
4. **Given** uma impressão em andamento, **When** ela termina, falha, é pausada fora do painel ou a
   impressora para de responder, **Then** as notificações da fatia
   [004](../004-print-notifications/spec.md) saem como hoje, uma por evento.
5. **Given** a conexão contínua de pé, **When** o painel está aberto, **Then** a linha de
   atualização no pé do painel diz `live`, em vez de "updated … ago".

---

### User Story 2 - Nunca pior do que hoje: alternativa e reconexão automáticas (Priority: P2)

Quando a conexão contínua não é possível (componente ausente, impressora desligada ou fora da rede,
conexão recusada) ou cai, o widget volta sozinho à consulta periódica de hoje e continua mostrando
o status como antes. Em segundo plano, tenta reconectar; quando consegue, volta ao tempo real sem
o usuário fazer nada.

**Why this priority**: sem isso, a fatia pioraria o plugin para quem não tem o componente ou tem
uma rede instável; as impressoras do usuário ficam desligadas boa parte do tempo.

**Independent Test**: com a Biqu ligada, pedir ao usuário que reinicie o Moonraker dela (ou a
desligue) e ver o painel continuar mostrando o estado certo (offline, se desligada) e voltar ao
tempo real sozinho quando ela volta.

**Acceptance Scenarios**:

1. **Given** uma impressora desligada quando o shell inicia, **When** o painel é aberto, **Then**
   ela aparece como offline com o motivo, como hoje.
2. **Given** a conexão contínua de pé, **When** ela cai (impressora desligada, Moonraker
   reiniciado, rede caiu, computador voltou da suspensão), **Then** em até 10 s o widget percebe e
   passa a usar a consulta periódica, e o status mostrado segue certo (offline, se a impressora
   não responde).
3. **Given** a impressora voltou a responder, **When** a conexão contínua for possível de novo,
   **Then** o widget volta ao tempo real em até 30 s, sem ação do usuário.
4. **Given** o componente da conexão contínua não está disponível no computador, **When** o shell
   inicia, **Then** o widget funciona como hoje, só com a consulta periódica, e o painel mostra uma
   linha discreta "Live updates unavailable: …" dizendo o que instalar, sem tom de erro.
5. **Given** a impressora recusa a conexão contínua (por exemplo, este computador não autorizado),
   **When** o painel é aberto, **Then** ele mostra o mesmo motivo que a consulta de hoje mostra
   ("unauthorized — allow this computer in trusted_clients").

---

### User Story 3 - Efeito dos comandos sem consulta extra (Priority: P3)

Os comandos do painel (pausar, retomar, cancelar, parada de emergência, reiniciar firmware e
reiniciar o Klipper) continuam sendo enviados como hoje; com a conexão contínua de pé, o efeito de
cada um chega por ela, sem a consulta extra que o widget faz hoje logo depois de cada comando.

**Why this priority**: completa a fatia e simplifica, mas os comandos já funcionam e mostram o
efeito hoje (com a consulta extra).

**Independent Test**: com a Voron imprimindo, o usuário pausa e retoma pelo painel; o painel mostra
"paused" e depois "printing" em até 2 s de cada mudança na impressora, e nenhuma notificação sai.

**Acceptance Scenarios**:

1. **Given** a conexão contínua de pé e uma impressão em andamento, **When** o usuário pausa pelo
   painel, **Then** o painel mostra "paused" em até 2 s depois de a impressora pausar, sem a
   notificação de pausa (ação do próprio painel, fatia 004).
2. **Given** a conexão contínua caída no momento do comando, **When** o usuário aperta a parada de
   emergência, **Then** o comando é enviado como hoje e o efeito aparece pela consulta periódica.
3. **Given** o Klipper desconectado do Moonraker, **When** a situação dura 15 s, **Then** o painel
   oferece "Restart Klipper" como na fatia [008](../008-klipper-service-restart/spec.md); e
   "Restart firmware" aparece nos mesmos estados da fatia
   [007](../007-firmware-restart/spec.md).

---

### Edge Cases

- **Klipper reiniciando** (reinício de firmware ou do serviço): o Moonraker continua de pé, mas o
  Klipper some e volta; a conexão continua, o painel mostra os estados de hoje (startup, erro,
  desconectado) e, quando o Klipper volta, o status volta a chegar sem reconectar à mão.
- **Conexão silenciosamente morta** (suspensão do computador, roteador reiniciado): sem aviso de
  fechamento, o widget percebe pela falta de resposta em até 10 s.
- **Duas barras** (dois monitores): cada uma tem a sua conexão; as duas mostram o mesmo estado e as
  notificações não saem em dobro (líder da fatia 004).
- **Impressora adicionada ou removida** (fatia 009) com o shell rodando: a conexão dela abre ou
  fecha sem reiniciar o shell.
- **Plugin desligado, removido ou shell reiniciado**: as conexões fecham; nada fica aberto.
- **Endereço com `https://` ou caminho**: a conexão contínua usa o mesmo endereço (com a forma
  segura correspondente); se não der, fica a consulta periódica.
- **Rajadas de atualização** durante a impressão (várias por segundo): a barra e o painel ficam
  fluidos e o shell não trava.
- **Informações que hoje vêm por consultas separadas** (estimativa do fatiador uma vez por
  impressão, nome do serviço do Klipper uma vez por desconexão): continuam vindo como hoje.
- **Mudança de configuração** do intervalo ou do tempo limite (`refreshIntervalSec`,
  `timeoutSec`): continuam valendo para a consulta periódica (a alternativa).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Para cada impressora com endereço válido, cada barra MUST tentar manter uma conexão
  contínua com o Moonraker dela e receber por ela as mudanças dos mesmos dados que a consulta de
  hoje traz.
- **FR-002**: Com a conexão contínua de pé, o widget MUST NOT fazer a consulta periódica de status
  àquela impressora.
- **FR-003**: Toda mudança recebida MUST chegar à barra e ao painel em até 2 s, passando pelas
  mesmas regras de hoje (estado, motivo, progresso, tempo restante, temperaturas, mensagem,
  camada, tempo de término).
- **FR-004**: Sem conexão contínua possível (componente ausente, recusada, falhou ou caiu), o
  widget MUST usar a consulta periódica de hoje, com o mesmo intervalo, tempo limite e mensagens.
- **FR-005**: Uma conexão que cai ou para de responder MUST ser percebida em até 10 s, e a
  impressora MUST voltar à consulta periódica na hora.
- **FR-006**: O widget MUST tentar reconectar sozinho, com espera crescente entre tentativas e
  no máximo 30 s entre elas, e MUST voltar ao tempo real assim que conseguir.
- **FR-007**: Os comandos do painel MUST continuar sendo enviados pelo caminho de hoje,
  independentemente do estado da conexão contínua.
- **FR-008**: Com a conexão contínua de pé, o widget MUST NOT fazer a consulta extra depois de um
  comando; o efeito MUST aparecer pela conexão.
- **FR-009**: As notificações (fatia 004), a proteção de ações do painel, a oferta de "Restart
  firmware" (007) e de "Restart Klipper" depois de 15 s com o Klipper desconectado (008) MUST se
  comportar como hoje.
- **FR-010**: "Printer not responding" (004) MUST continuar saindo depois de 3 consultas periódicas
  sem resposta, como hoje; com a conexão contínua de pé, MAY sair até 10 s mais tarde (o tempo de
  perceber a queda, FR-005).
- **FR-011**: Com a conexão contínua de pé, a linha de atualização no pé do painel MUST dizer `live`
  no lugar de "updated … ago"; com a consulta periódica, MUST continuar mostrando "updated … ago" e
  "no response for …" como hoje. O ícone da barra MUST NOT ganhar indicação nova.
- **FR-012**: Cada barra MUST ter a sua própria conexão por impressora; nenhuma conexão é
  compartilhada entre barras.
- **FR-013**: Conexões MUST abrir e fechar junto com as impressoras da configuração, com o widget e
  com o plugin, sem deixar nada aberto.
- **FR-014**: O shell MUST NOT travar nem atrasar com rajadas de atualização.
- **FR-015**: A conexão contínua MUST só ler e se inscrever no status; nada é enviado à impressora
  por ela além disso.
- **FR-016**: Sem o componente da conexão contínua no computador, o painel MUST mostrar uma linha
  informativa discreta ("Live updates unavailable: …", com o que instalar), no mesmo estilo do aviso
  de notificações indisponíveis (004); uma impressora que só recusa ou derruba a conexão MUST NOT
  gerar esse aviso.

### Key Entities

- **Conexão contínua** (por barra e por impressora): estado (conectando, de pé, caída, indisponível),
  tentativas de reconexão, último sinal de vida.
- **Modo de atualização** (por impressora): ao vivo (pela conexão) ou periódico (alternativa).
- **Status da impressora**: o mesmo de hoje, agora alimentado por mudanças recebidas além das
  respostas da consulta.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Com a conexão contínua de pé, uma mudança de estado na impressora aparece na barra em
  até 2 s em 100% dos testes (hoje, até 5 s).
- **SC-002**: Com as duas impressoras ligadas, ociosas e conectadas, o widget faz 0 consultas
  periódicas de status por minuto (hoje, 24 por barra: 12 por impressora).
- **SC-003**: Em 100% dos testes de queda (Moonraker reiniciado, impressora desligada), o painel
  continua mostrando o estado certo, percebe a queda em até 10 s e volta ao tempo real em até 30 s
  depois de a impressora voltar, sem ação do usuário.
- **SC-004**: Sem o componente da conexão contínua, o plugin se comporta como antes da fatia em
  todos os cenários das fatias 001–009.
- **SC-005**: As notificações e as ofertas de reinício (004, 007, 008) saem nos mesmos cenários que
  hoje, uma vez por evento, com um ou dois monitores.
- **SC-006**: Depois de desligar o plugin ou reiniciar o shell, nenhuma conexão fica aberta.

## Assumptions

- O Moonraker das duas impressoras aceita a conexão contínua sem chave, pelos mesmos
  `trusted_clients` que já liberam as consultas de hoje.
- O componente da conexão contínua do Qt (QtWebSockets) é opcional (constituição, Princípio IV);
  está instalado neste computador.
- A conexão contínua se inscreve nos mesmos objetos que a consulta de hoje lê; a estimativa do
  fatiador e o nome do serviço do Klipper continuam pelas consultas pontuais de hoje.
- O intervalo `refreshIntervalSec` passa a valer só para a consulta periódica (a alternativa) e
  como base do "Printer not responding".
- Fora de escopo: comandos pela conexão contínua, conexão compartilhada entre barras, histórico de
  impressões, webcam, respostas de G-code no painel, chave de API.
