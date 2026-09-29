# Feature Specification: Status das impressoras 3D na barra

**Feature Branch**: `main` (sem branch dedicada; nenhum hook de branch configurado)

**Created**: 2026-09-29

**Status**: Draft

**Input**: User description: "Monitoramento de impressoras 3D na barra do desktop. Tenho uma ou mais
impressoras 3D com Klipper e Moonraker na minha rede Wi-Fi e quero ver de relance, na barra do
Omarchy, se uma impressão está indo bem, sem abrir o navegador."

**Revisão de UI (2026-09-29)**: a barra mostra apenas o ícone do plugin, com um indicador
gráfico de estado e progresso e sem texto. As informações de cada impressora ficam num painel
pequeno que abre ao clicar no ícone, no estilo do painel de Wi-Fi do Omarchy, com um seletor
para trocar a impressora exibida. Os botões de ação desse painel ficam para a próxima fatia.

## Clarifications

### Session 2026-09-29

- Q: Como o ícone na barra se comporta? → A: só o ícone, sem texto, com um indicador de progresso
  desenhado com as cores do tema e mudança de aparência em erro e em offline.
- Q: Os botões de ação entram nesta fatia? → A: não; vão para a próxima fatia (002).
- Q: Quais ações o painel terá (fatia 002)? → A: pausar/retomar, cancelar impressão, parada de
  emergência e abrir a interface web da impressora.
- Q: Qual impressora aparece selecionada ao abrir o painel? → A: a mais relevante pela
  prioridade de estado; a escolha manual vale enquanto o shell estiver rodando e não é gravada.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver de relance na barra se a impressão vai bem (Priority: P1)

Com uma impressora cadastrada, o usuário olha o ícone do plugin na barra e percebe, sem ler
texto, se há impressão em andamento e quanto falta (indicador de progresso), e se a impressora
está com problema (erro) ou inacessível (offline).

**Why this priority**: é o motivo de existir do plugin: acompanhar sem abrir o navegador nem o
painel.

**Independent Test**: cadastrar uma impressora real, iniciar uma impressão e verificar que o
indicador avança; pausar e verificar a mudança; ao terminar, verificar que o indicador some.

**Acceptance Scenarios**:

1. **Given** uma impressora imprimindo com 42% concluído, **When** o usuário olha a barra,
   **Then** vê o ícone com um indicador de progresso preenchido proporcionalmente, sem texto.
2. **Given** uma impressão em andamento, **When** ela é pausada, **Then** o indicador passa a
   representar "pausada" de forma distinguível de "imprimindo" dentro de um intervalo de
   atualização.
3. **Given** uma impressora ociosa, **When** o usuário olha a barra, **Then** vê só o ícone,
   sem indicador de progresso.
4. **Given** uma impressora em erro, **When** o usuário olha a barra, **Then** o ícone aparece
   com a cor de alerta do tema.
5. **Given** o usuário para o mouse sobre o ícone, **When** o tooltip aparece, **Then** ele
   mostra uma única linha com o nome, o estado e o progresso da impressora representada.

---

### User Story 2 - Saber quando a impressora está inacessível (Priority: P1)

O usuário precisa ter certeza de que o que vê é atual. Se a impressora não responde, o ícone e o
painel indicam "offline" em vez de continuar exibindo os últimos dados conhecidos.

**Why this priority**: dados velhos exibidos como atuais são piores do que nenhum dado.

**Independent Test**: com uma impressora exibindo estado normal, desligá-la (ou desconectar o
computador da rede) e verificar que o ícone fica esmaecido e o painel mostra "offline" dentro do
tempo limite; religar e verificar que o estado real volta a aparecer.

**Acceptance Scenarios**:

1. **Given** uma impressora imprimindo, **When** ela deixa de responder por mais que o tempo
   limite configurado, **Then** o ícone fica esmaecido e sem indicador de progresso, e o painel
   mostra "offline" sem porcentagem, temperaturas ou tempo restante.
2. **Given** uma impressora cadastrada com endereço errado ou inexistente, **When** o plugin
   tenta consultá-la, **Then** ela aparece como "offline".
3. **Given** a impressora responde mas informa que o firmware está desconectado, em
   inicialização ou em erro, **When** o usuário abre o painel, **Then** vê "erro" e o motivo
   informado.
4. **Given** o computador perdeu a conexão de rede, **When** o tempo limite expira, **Then**
   todas as impressoras aparecem como "offline"; quando a rede volta, os estados reais reaparecem
   no ciclo seguinte sem ação do usuário.
5. **Given** uma impressora offline, **When** o usuário abre o painel, **Then** vê há quanto
   tempo ela não responde.

---

### User Story 3 - Ver os detalhes de uma impressora no painel (Priority: P1)

Ao clicar no ícone, abre-se um painel pequeno ancorado na barra (como o de Wi-Fi) com os
detalhes da impressora selecionada: nome, estado, progresso, nome do arquivo, tempo restante
estimado e temperatura do bico e da mesa (atual e alvo).

**Why this priority**: sem texto na barra, o painel é a única forma de ver os detalhes.

**Independent Test**: durante uma impressão real, clicar no ícone e comparar os valores do
painel com os da interface web da impressora; fechar com Escape, com um clique fora do painel e
com um novo clique no ícone.

**Acceptance Scenarios**:

1. **Given** uma impressora imprimindo, **When** o usuário clica no ícone, **Then** o painel
   abre com nome, estado "imprimindo", progresso em porcentagem inteira, arquivo, tempo restante
   e bico/mesa atual/alvo.
2. **Given** uma impressora ociosa, **When** o painel está aberto, **Then** mostra estado e
   temperaturas e omite arquivo, progresso e tempo restante.
3. **Given** o tempo restante ainda não pode ser estimado, **When** o painel está aberto,
   **Then** o campo aparece como indisponível ("—").
4. **Given** o painel aberto, **When** os dados mudam no ciclo seguinte, **Then** o painel se
   atualiza sem precisar ser reaberto.
5. **Given** o painel aberto, **When** o usuário pressiona Escape, clica fora dele ou clica de
   novo no ícone, **Then** o painel fecha.

---

### User Story 4 - Alternar entre impressoras no painel (Priority: P2)

Com várias impressoras cadastradas, o painel mostra uma lista compacta de todas, com nome,
estado e progresso, e o usuário escolhe qual exibir em detalhe.

**Why this priority**: necessário para quem tem mais de uma impressora; com uma só, a lista não
aparece.

**Independent Test**: cadastrar duas impressoras, abrir o painel, selecionar a outra e verificar
que os detalhes trocam; testar com mouse e com teclado.

**Acceptance Scenarios**:

1. **Given** várias impressoras cadastradas, **When** o painel abre, **Then** a selecionada é a
   mais relevante pela prioridade erro > imprimindo > pausada > offline > ociosa (empate: ordem
   de cadastro).
2. **Given** o painel aberto com várias impressoras, **When** o usuário escolhe outra na lista
   (clique, ou teclas de navegação e Enter), **Then** os detalhes passam a ser dessa impressora.
3. **Given** o usuário escolheu uma impressora manualmente, **When** fecha e reabre o painel
   durante a mesma sessão, **Then** a escolha é mantida; se essa impressora for removida do
   cadastro, volta a valer a mais relevante.
4. **Given** duas impressoras com o mesmo nome, **When** aparecem na lista, **Then** são
   distinguíveis pelo endereço exibido junto ao nome.
5. **Given** uma única impressora cadastrada, **When** o painel abre, **Then** a lista não
   aparece.

---

### User Story 5 - Cadastrar impressoras nas configurações do widget (Priority: P2)

O usuário cadastra uma ou mais impressoras informando nome e endereço nas configurações do
widget, e ajusta o intervalo de atualização e o tempo limite.

**Why this priority**: necessário para uso real, mas uma primeira versão pode ser testada com
uma impressora configurada diretamente.

**Independent Test**: adicionar duas impressoras, verificar que ambas são monitoradas; remover
uma e verificar que ela some do painel.

**Acceptance Scenarios**:

1. **Given** nenhuma impressora cadastrada, **When** o usuário olha a barra, **Then** vê apenas
   o ícone, sem indicador, e o painel informa que nenhuma impressora está configurada e como
   cadastrar.
2. **Given** o usuário adiciona uma impressora com nome e endereço, **When** salva a
   configuração, **Then** a impressora passa a ser monitorada sem reiniciar o desktop.
3. **Given** uma impressora é removida do cadastro, **When** a configuração é aplicada, **Then**
   ela some do ícone e do painel em até um ciclo.

---

### Edge Cases

- Impressora desligada, fora da rede ou com endereço errado: aparece como "offline" após o tempo
  limite (US2).
- Serviço da impressora respondendo mas firmware desconectado, em inicialização ou em erro:
  aparece como "erro" com o motivo no painel (US2).
- Impressora que recusa o acesso por falta de autorização: aparece como "erro" com o motivo
  "acesso não autorizado" e a orientação de liberar este computador na impressora.
- Duas impressoras com o mesmo nome: ambas são monitoradas e diferenciadas pelo endereço (US4).
- Perda de conexão de rede do computador: todas ficam "offline" e voltam sozinhas quando a rede
  retorna (US2).
- Impressão concluída ou cancelada: a impressora volta a "ociosa".
- Resposta lenta que chega depois do tempo limite: é descartada; não sobrescreve o estado
  "offline" nem um estado mais recente.
- Endereço com formato inválido: a impressora aparece como "offline" com o motivo "endereço
  inválido".
- Tempo limite maior que o intervalo de atualização: não se dispara uma nova consulta para a
  mesma impressora enquanto a anterior está pendente.
- Impressora selecionada no painel removida enquanto o painel está aberto: a seleção passa para a
  mais relevante.
- Várias impressoras em estados diferentes: o ícone representa só a mais relevante; as demais são
  vistas no painel.

## Requirements *(mandatory)*

### Functional Requirements

**Barra**

- **FR-001**: A barra MUST exibir apenas o ícone do plugin, sem texto, em qualquer estado.
- **FR-002**: O ícone MUST representar a impressora mais relevante pela prioridade erro >
  imprimindo > pausada > offline > ociosa (empate: ordem de cadastro).
- **FR-003**: Em "imprimindo" e "pausada", o ícone MUST exibir um indicador gráfico de progresso
  proporcional à porcentagem concluída; "pausada" MUST ser distinguível de "imprimindo".
- **FR-004**: Em "erro", o ícone MUST usar a cor de alerta do tema; em "offline", MUST aparecer
  esmaecido; em "ociosa" ou sem impressoras, MUST aparecer sem indicador.
- **FR-005**: O tooltip do ícone MUST ter uma única linha com nome, estado e, quando houver,
  progresso da impressora representada (ou "nenhuma impressora configurada").

**Estados e dados**

- **FR-006**: Cada impressora MUST estar em exatamente um de cinco estados: imprimindo, pausada,
  ociosa, erro, offline.
- **FR-007**: O progresso MUST ser exibido no painel como porcentagem inteira, arredondada para
  baixo (99,9% → 99%; 100% só ao concluir).
- **FR-008**: Uma impressora que não responder dentro do tempo limite configurado MUST ficar
  "offline".
- **FR-009**: Ao ficar "offline", o sistema MUST deixar de exibir progresso, temperaturas,
  arquivo e tempo restante daquela impressora.
- **FR-010**: Quando o serviço da impressora responder mas o firmware estiver desconectado, em
  inicialização ou em erro, ou quando recusar o acesso por falta de autorização, o sistema MUST
  classificá-la como "erro" e exibir o motivo no painel.
- **FR-011**: Quando o tempo restante não puder ser estimado, o sistema MUST exibi-lo como
  indisponível, nunca como zero.
- **FR-012**: Respostas que chegarem depois do tempo limite ou fora de ordem MUST ser
  descartadas.
- **FR-013**: O monitoramento MUST continuar para as demais impressoras quando uma delas falhar.
- **FR-014**: Mudanças de estado de uma impressora acessível MUST aparecer no ícone e no painel
  aberto em no máximo um intervalo de atualização.

**Painel**

- **FR-015**: Clicar no ícone MUST abrir e fechar um painel ancorado na barra, no mesmo padrão
  visual e de interação dos painéis nativos do Omarchy (fecha com Escape, clique fora ou novo
  clique no ícone; pode ser aberto e fechado pelo shell).
- **FR-016**: O painel MUST exibir, para a impressora selecionada: nome, estado, motivo (em erro
  ou offline), há quanto tempo não responde (em offline), progresso, nome do arquivo, tempo
  restante estimado e temperaturas atual e alvo do bico e da mesa, quando aplicáveis.
- **FR-017**: Com mais de uma impressora, o painel MUST listar todas com nome, estado e progresso
  (quando houver) e permitir selecionar qualquer uma por mouse e por teclado.
- **FR-018**: Ao abrir, o painel MUST selecionar a impressora mais relevante (FR-002), a menos
  que o usuário tenha escolhido outra na mesma sessão do shell e ela ainda esteja cadastrada. A
  escolha não é persistida.
- **FR-019**: Impressoras com o mesmo nome MUST ser exibidas de forma distinguível (nome +
  endereço).
- **FR-020**: Sem impressoras cadastradas, o painel MUST informar que nenhuma está configurada e
  como cadastrar.
- **FR-021**: O painel desta fatia MUST NOT exibir botões de ação sobre a impressora.

**Configuração**

- **FR-022**: O usuário MUST poder cadastrar, editar e remover impressoras informando nome e
  endereço nas configurações do widget.
- **FR-023**: O usuário MUST poder configurar o intervalo de atualização e o tempo limite; ambos
  têm valores padrão.
- **FR-024**: Alterações nas configurações MUST ter efeito sem reiniciar o desktop.

### Key Entities

- **Impressora cadastrada**: configuração informada pelo usuário; nome (texto livre, não
  necessariamente único), endereço na rede local (host ou IP, porta opcional), ordem de cadastro.
- **Leitura de estado**: o que a impressora informou numa consulta: estado, progresso,
  temperaturas atual/alvo do bico e da mesa, nome do arquivo, duração, mensagem de erro, instante
  da leitura.
- **Estado exibido**: um dos cinco valores, derivado da última leitura válida ou da ausência de
  resposta dentro do tempo limite.
- **Seleção do painel**: impressora exibida em detalhe; automática (mais relevante) ou escolhida
  pelo usuário na sessão.
- **Configuração do widget**: lista de impressoras, intervalo de atualização, tempo limite.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Olhando só a barra, o usuário distingue em menos de 2 segundos se há impressão em
  andamento (e aproximadamente quanto falta), se há erro ou se a impressora está offline.
- **SC-002**: O usuário chega aos detalhes completos de qualquer impressora cadastrada com no
  máximo 2 interações (abrir o painel e selecionar), sem abrir o navegador.
- **SC-003**: Com os valores padrão, uma impressora que para de responder aparece como "offline"
  em até 8 segundos (intervalo + tempo limite).
- **SC-004**: Com os valores padrão, mudanças de estado de uma impressora acessível aparecem em
  até 5 segundos.
- **SC-005**: Em 100% dos casos de impressora inacessível, nenhum dado anterior (progresso,
  temperatura) continua visível como se fosse atual.
- **SC-006**: Os valores do painel coincidem com os da interface web da impressora no mesmo
  instante (tolerância de um ciclo de atualização).
- **SC-007**: Com 5 impressoras cadastradas, metade offline, o desktop continua responsivo e o
  painel abre sem atraso perceptível.
- **SC-008**: O usuário cadastra uma nova impressora e a vê monitorada em menos de 1 minuto.

## Assumptions

- As impressoras estão na mesma rede local que o computador e não exigem autenticação para
  leitura de estado; impressoras que exigem chave de acesso ficam fora desta fatia.
- Nesta fatia não há formulário gráfico de configurações: o cadastro é feito na entrada de
  configuração do widget mantida pelo shell (por comando ou edição do arquivo de configuração),
  e as mudanças são aplicadas sem reiniciar. Um formulário fica para uma fatia futura.
- Valores padrão: intervalo de atualização de 5 segundos e tempo limite de 3 segundos.
- As consultas continuam com o painel fechado, porque o ícone reflete o estado.
- Impressão concluída ou cancelada é exibida como "ociosa".
- Firmware em inicialização (ainda não pronto) é exibido como "erro" com o motivo.
- O tempo restante é estimado a partir do progresso e do tempo de impressão informados pela
  impressora.
- Temperaturas em graus Celsius, sem casas decimais.
- A atualização é por consulta periódica; atualização em tempo real está fora de escopo.
- Fora de escopo nesta fatia: ações de controle, notificações, descoberta automática e
  atualização em tempo real.
- Próxima fatia (002, ações no painel): pausar/retomar, cancelar impressão (com confirmação),
  parada de emergência (com confirmação) e abrir a interface web da impressora.
