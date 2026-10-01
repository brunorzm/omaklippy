# Feature Specification: Chave de API do Moonraker por impressora

**Feature Branch**: `main` (sem branch dedicada; nenhum hook de branch configurado)

**Created**: 2026-10-01

**Status**: Concluída em 2026-10-01 (chave testada contra servidores falsos HTTP e WebSocket que a exigem e pelo painel; nenhuma linha de comando com a chave; impressoras reais sem chave sem regressão; ver [hardware-test.md](./hardware-test.md))

**Input**: User description: "suporte à chave de API do Moonraker, para impressoras que não liberam este computador em trusted_clients: hoje elas aparecem como \"unauthorized — allow this computer in trusted_clients\" e o plugin não consegue ler o status nem mandar comandos. Com a chave cadastrada para a impressora, o status (consulta periódica e conexão contínua da fatia 010) e os comandos do painel passam a funcionar. A chave dá acesso total à impressora, então não pode aparecer na linha de comando dos processos (visível a outros usuários) nem no painel por inteiro; fica na configuração do widget no shell.json (inline, Princípio I), que é legível por outros usuários do computador (644) — registrar esse risco. Decidir na spec/clarify onde o usuário informa a chave (só no shell.json, ou também pelo painel ao adicionar por endereço e para a impressora selecionada)."

**Contexto**: o Moonraker só atende quem ele conhece. Hoje o plugin depende de o computador estar
liberado na configuração da impressora (`trusted_clients`, fatia [001](../001-printer-status-bar/spec.md));
quando não está, a impressora aparece em erro com "unauthorized — allow this computer in
trusted_clients", e nada funciona: nem status, nem comandos, nem a conexão contínua
([010](../010-realtime-status/spec.md)). Liberar o computador exige editar a configuração da
impressora; muitas instalações (redes compartilhadas, impressoras de outra pessoa, endereço do
computador que muda) preferem a outra forma que o Moonraker oferece: uma **chave de API**, um
segredo que acompanha cada pedido. Esta fatia deixa o usuário informar essa chave por impressora.

Conferido em 2026-10-01: a configuração do shell (onde as impressoras ficam, Princípio I) é um
arquivo legível por qualquer usuário do computador. As duas impressoras do usuário liberam este
computador hoje, então nenhuma precisa de chave para funcionar.

## Clarifications

### Session 2026-10-01

- Q: Onde o usuário informa a chave pelo painel? → A: no formulário "Add by address" (fatia 009),
  quando a conferência é recusada, e também para a impressora selecionada na tela Printers…
  ("Set API key" / "Remove API key"); a configuração do shell continua valendo.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Usar uma impressora que exige chave (Priority: P1)

O usuário tem uma impressora que não libera este computador. Ele cadastra a chave de API dela; a
partir daí o painel mostra o status (ao vivo, quando possível), os comandos funcionam e o erro
"unauthorized" some.

**Why this priority**: é o motivo da fatia: hoje essa impressora é inutilizável pelo plugin.

**Independent Test**: com uma impressora (real, com o computador tirado temporariamente dos
`trusted_clients` pelo usuário, ou um servidor falso que exige chave) aparecendo como
"unauthorized", cadastrar a chave e ver o status chegar, ao vivo, e um comando funcionar.

**Acceptance Scenarios**:

1. **Given** uma impressora que recusa este computador e sem chave, **When** o painel é aberto,
   **Then** ele mostra o erro de autorização como hoje, agora sugerindo também cadastrar a chave.
2. **Given** a mesma impressora com a chave certa cadastrada, **When** o widget pergunta o status,
   **Then** o status aparece como o de qualquer outra impressora, e a conexão contínua (010) fica de
   pé.
3. **Given** a chave certa cadastrada, **When** o usuário usa um comando do painel (pausar, parada
   de emergência etc.), **Then** o comando é aceito pela impressora como hoje nas impressoras
   liberadas.
4. **Given** uma chave errada (ou trocada na impressora), **When** o widget pergunta o status,
   **Then** o painel diz que a chave foi recusada, sem mostrar a chave.
5. **Given** uma impressora que libera o computador e tem chave cadastrada, **When** o widget
   pergunta, **Then** tudo funciona como hoje (a chave não atrapalha).

---

### User Story 2 - A chave não vaza (Priority: P2)

A chave dá acesso total à impressora. Ela não aparece na lista de processos do computador, não
aparece inteira no painel e não vai a nenhum lugar além da própria impressora.

**Why this priority**: sem isso, qualquer usuário do computador poderia copiar a chave de um
processo em andamento e controlar a impressora.

**Independent Test**: com a chave cadastrada e o widget consultando, listar os processos do
computador (como outro usuário veria) e não achar a chave; abrir o painel e não vê-la por inteiro.

**Acceptance Scenarios**:

1. **Given** a chave cadastrada, **When** o widget consulta o status, manda um comando ou abre a
   conexão contínua, **Then** a chave não aparece na linha de comando de nenhum processo.
2. **Given** a chave cadastrada, **When** o painel mostra a impressora, **Then** ele no máximo
   indica que há uma chave (por exemplo, os últimos caracteres), nunca a chave inteira.
3. **Given** a chave cadastrada, **When** o widget abre a interface web da impressora (003), **Then**
   a chave não vai junto no endereço.

---

### User Story 3 - Informar a chave sem editar arquivo (Priority: P3)

O usuário informa a chave pela própria interface do plugin, sem abrir a configuração do shell.

**Why this priority**: completa a experiência da fatia 009 (cadastro pelo painel); quem só usa a
configuração já é atendido pela US1.

**Independent Test**: adicionar por endereço uma impressora que recusa o computador, informando a
chave quando o painel pedir; depois, para a impressora selecionada, trocar a chave por uma errada
(painel diz "chave recusada"), pôr a certa de novo e removê-la, conferindo a configuração a cada
gravação.

**Acceptance Scenarios**:

1. **Given** o formulário de adicionar por endereço, **When** a impressora recusa o computador na
   conferência, **Then** o painel diz que ela exige chave e permite informá-la ali, conferindo de
   novo com a chave.
2. **Given** uma chave informada pelo painel, **When** é gravada, **Then** fica na configuração do
   shell junto da impressora, preservando o resto da configuração (como na fatia 009).
3. **Given** uma impressora selecionada na tela Printers…, **When** o usuário escolhe "Set API key"
   e informa uma chave, **Then** ela é gravada para essa impressora e passa a valer sem reiniciar o
   shell; o campo não mostra a chave já gravada.
4. **Given** uma impressora com chave, **When** o usuário escolhe "Remove API key" e confirma,
   **Then** a chave sai da configuração e a impressora volta a depender de `trusted_clients`.

---

### Edge Cases

- **Chave com espaços ou quebras de linha** (colada de outro lugar): espaços nas pontas são
  ignorados; uma chave com caracteres inválidos é recusada antes de gravar.
- **Chave em impressora que não exige** (computador liberado): funciona; nada muda.
- **Chave trocada na impressora** (o Moonraker gera outra): o painel passa a dizer que a chave foi
  recusada; a conexão contínua cai para a consulta periódica, que mostra o mesmo motivo.
- **Busca na rede** (fatia 009): uma impressora que exige chave responde "unauthorized" à
  verificação; ela continua aparecendo (a resposta mostra que há um Moonraker ali) e, ao adicioná-la,
  o painel avisa que ela vai precisar da chave.
- **Duas barras** (dois monitores): as duas usam a mesma chave da configuração.
- **Mesma chave em várias impressoras**: permitido (cada impressora tem a sua entrada).
- **Configuração legível por outros usuários**: registrado como risco (Assumptions); o plugin não
  muda as permissões de arquivos do shell.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Cada impressora MUST aceitar uma chave de API opcional na configuração do shell,
  inline na entrada do widget, junto do endereço.
- **FR-002**: Com chave, todo pedido do plugin a essa impressora (status, estimativa, nome do
  serviço, comandos e a conexão contínua) MUST levar a chave; sem chave, tudo MUST seguir como hoje.
- **FR-003**: A chave MUST NOT aparecer na linha de comando de nenhum processo, nem em nenhum
  endereço aberto no navegador, nem em mensagens do painel ou de notificações.
- **FR-004**: O painel MUST NOT mostrar a chave inteira; MAY indicar que existe uma (por exemplo,
  os 4 últimos caracteres).
- **FR-005**: Sem chave e com o computador recusado, a mensagem de hoje MUST continuar e MUST
  mencionar também a opção da chave de API.
- **FR-006**: Com chave e recusa, o painel MUST dizer que a chave foi recusada (texto diferente do
  de computador não liberado).
- **FR-007**: A chave MUST ser lida das mesmas formas que o resto da configuração (lista ou texto) e
  MUST ser preservada por toda gravação feita pelo plugin (fatia 009).
- **FR-008**: Chave com espaços nas pontas MUST ser usada sem eles; chave com caracteres fora dos
  permitidos MUST ser tratada como inválida e mostrada como erro de configuração daquela impressora.
- **FR-009**: O plugin MUST NOT enviar a chave a nenhum endereço que não seja o da própria impressora.
- **FR-010**: O painel MUST permitir informar a chave no "Add by address" (quando a conferência é
  recusada por autorização, conferindo de novo com a chave) e, para a impressora selecionada na tela
  Printers…, definir/trocar ("Set API key") e remover ("Remove API key", com confirmação), gravando
  pelo mesmo caminho da fatia 009 e preservando o resto da configuração.
- **FR-011**: Os campos de chave no painel MUST esconder o texto digitado e MUST NOT mostrar a chave
  já gravada.

### Key Entities

- **Impressora (configuração)**: ganha o campo opcional chave de API (texto secreto), ao lado de
  nome, endereço e endereço web.
- **Motivo de recusa**: computador não liberado (sem chave) ou chave recusada (com chave).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Uma impressora que recusa o computador passa a mostrar status e aceitar comandos em
  100% dos testes depois de cadastrada a chave certa, sem editar a configuração da impressora.
- **SC-002**: Em 100% das verificações (listagem de processos durante consultas, comandos e conexão
  contínua; textos do painel; endereços abertos), a chave inteira não aparece.
- **SC-003**: Com chave errada, o usuário vê em até um ciclo de consulta que a chave foi recusada,
  com texto diferente do de computador não liberado.
- **SC-004**: Impressoras sem chave (as do usuário hoje) se comportam exatamente como antes em todos
  os cenários das fatias 001–010.

## Assumptions

- **Risco registrado**: a configuração do shell (`shell.json`) é legível por outros usuários do
  computador; quem tiver conta local pode ler a chave ali. É o mesmo arquivo em que o Omarchy guarda
  as demais configurações dos widgets (Princípio I); o plugin não cria arquivo próprio para segredos
  (Princípio III) nem muda permissões de arquivos do shell. O README avisa e sugere preferir
  `trusted_clients` em computadores compartilhados.
- A chave de API é a do Moonraker (uma por instalação, gerada pelo próprio Moonraker); login com
  usuário e senha e tokens temporários estão fora de escopo.
- Para o teste em hardware, as duas impressoras liberam este computador: o teste com chave exige que
  o usuário tire o computador dos `trusted_clients` de uma delas temporariamente (ou usa um servidor
  falso que exija a chave); obter a chave da impressora (o Moonraker mostra para clientes liberados)
  fica com o usuário.
- Fora de escopo: guardar a chave num cofre de senhas do sistema, criptografar a configuração,
  autenticação por usuário e senha, editar outros campos da impressora pelo painel.
