# Feature Specification: Polimento do status (mensagem, tempo restante, pausa no ícone)

**Feature Branch**: `main` (sem branch dedicada; nenhum hook de branch configurado)

**Created**: 2026-09-30

**Status**: Concluída em 2026-09-30 (teste em hardware aprovado na Voron; heat-soak validado com a fixture real da Voron, não ao vivo; ver [hardware-test.md](./hardware-test.md))

**Input**: User description: "polimento do status: mostrar a mensagem do Klipper (display_status.message) no painel; tempo restante melhor no início da impressão usando a estimativa do fatiador; marcador de pausa no ícone da barra"

**Contexto**: três melhorias anotadas nos testes em hardware das fatias anteriores, todas vistas
na Voron do usuário:

- durante o aquecimento da câmara no início da impressão (que pode levar muitos minutos), o
  painel mostra "printing" com tempo restante "—" e não diz o que está acontecendo, enquanto a
  impressora exibe uma mensagem como "Aquecendo a Camara";
- o tempo restante só aparece depois que a impressão avança, porque hoje é calculado só pelo
  progresso; o fatiador já estimou a duração da impressão (22 min 23 s no arquivo testado);
- com progresso baixo, "pausada" quase não se distingue de "imprimindo" no ícone da barra (hoje a
  diferença é só a barrinha de progresso atenuada).

Esta fatia só lê informações que a impressora já oferece; não envia comandos. Os textos da
interface são em inglês (decisão da fatia 001).

## Clarifications

### Session 2026-09-30

- Q: A mensagem da impressora aparece fora de uma impressão (ociosa)? → A: não; só com a
  impressora imprimindo ou pausada, para não mostrar mensagens velhas (a Voron continua exibindo
  "Imprimindo" depois de terminar).
- Q: Como o tempo restante evolui depois do início? → A: combinação gradual: começa 100% pela
  estimativa do fatiador (menos o tempo já impresso) e passa aos poucos para a estimativa pelo
  progresso conforme a impressão avança, sem saltos; no fim, vale só a estimativa pelo progresso.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver o que a impressora está fazendo agora (Priority: P1)

A impressora exibe mensagens de status durante a impressão ("Aquecendo a Camara", "Nivelando a
mesa", "Imprimindo"). O usuário vê essa mesma mensagem no painel, sem abrir a interface web.

**Why this priority**: resolve o caso mais confuso de hoje (minutos de "printing" sem nenhuma
pista do que está acontecendo) e é a mudança mais simples.

**Independent Test**: com uma impressão em andamento cuja macro exibe uma mensagem, abrir o painel
e conferir a mensagem; mudar a mensagem e conferir que o painel acompanha em até um ciclo.

**Acceptance Scenarios**:

1. **Given** a impressora selecionada está imprimindo ou pausada e exibe uma mensagem de status,
   **When** o painel é aberto, **Then** a mensagem aparece nos detalhes da impressão.
2. **Given** a mensagem muda na impressora, **When** o próximo ciclo de atualização ocorre,
   **Then** o painel mostra a nova mensagem.
3. **Given** a impressora não exibe mensagem (vazia), **When** o painel é aberto, **Then** nenhuma
   linha de mensagem aparece (nada de "—" ou linha vazia).
4. **Given** a impressora está ociosa, em erro ou offline, **When** ela ainda guarda a última
   mensagem de uma impressão anterior (por exemplo, "Imprimindo" depois do fim), **Then** nenhuma
   mensagem aparece no painel (FR-004).

---

### User Story 2 - Saber quanto falta desde o início da impressão (Priority: P1)

Assim que a impressão começa, o usuário já vê quanto tempo falta, com base na estimativa que o
fatiador gravou no arquivo, em vez de "—" até a impressão avançar.

**Why this priority**: é a informação que o usuário mais procura no painel; hoje ela falta
justamente nos primeiros minutos, quando ele quer decidir se espera ou sai.

**Independent Test**: iniciar uma impressão de um arquivo fatiado com estimativa, abrir o painel
durante o aquecimento e conferir que o tempo restante aparece e bate com a estimativa do fatiador;
acompanhar até o fim e conferir que o valor diminui de forma coerente.

**Acceptance Scenarios**:

1. **Given** o arquivo em impressão tem estimativa do fatiador, **When** a impressão ainda está no
   aquecimento (nada impresso), **Then** o tempo restante mostra a estimativa total do fatiador.
2. **Given** a impressão está avançando, **When** o painel é exibido, **Then** o tempo restante
   diminui conforme a impressão progride, passando gradualmente da estimativa do fatiador para a
   estimativa pelo progresso, sem saltos (FR-006).
3. **Given** o arquivo não tem estimativa do fatiador (ou ela não pôde ser obtida), **When** o
   painel é exibido, **Then** o tempo restante segue o comportamento atual (pelo progresso, "—"
   enquanto indisponível).
4. **Given** a impressão já passou da estimativa do fatiador, **When** o painel é exibido,
   **Then** o tempo restante passa a ser a estimativa pelo progresso e nunca aparece negativo nem
   zero enquanto a impressão continua (FR-008).

---

### User Story 3 - Distinguir "pausada" no ícone da barra (Priority: P2)

Com uma impressão pausada, o ícone da barra mostra um marcador de pausa bem visível, mesmo com
progresso baixo.

**Why this priority**: o ícone já mostra "pausada" de forma sutil; o marcador melhora a leitura de
relance, mas o painel e as notificações da fatia 004 já avisam.

**Independent Test**: pausar uma impressão com progresso baixo (menos de 10%) e conferir que o
ícone é reconhecido como pausado sem abrir o painel, em pelo menos dois temas.

**Acceptance Scenarios**:

1. **Given** a impressora que o ícone representa está pausada, **When** o usuário olha a barra,
   **Then** o ícone mostra um marcador de pausa, distinto do selo de erro.
2. **Given** a impressão é retomada, **When** o próximo ciclo ocorre, **Then** o marcador some.
3. **Given** a impressora está em erro, offline, ociosa ou imprimindo, **When** o usuário olha a
   barra, **Then** o marcador de pausa não aparece.

---

### Edge Cases

- Mensagem muito longa: o painel quebra a linha ou corta com reticências, sem aumentar a largura
  do painel.
- Mensagem com caracteres especiais ou acentos ("Aquecendo a Câmara"): exibida como texto, sem
  interpretação.
- Arquivo trocado entre impressões: a estimativa usada é sempre a do arquivo em impressão agora.
- Estimativa do fatiador muito errada (por exemplo, metade do tempo real): o tempo restante segue
  a regra do FR-006 e nunca fica negativo.
- Impressão iniciada a partir de um arquivo sem metadados (enviado sem fatiador conhecido): cai no
  comportamento atual.
- Obter a estimativa demora ou falha: o painel não trava e mostra o comportamento atual até a
  estimativa chegar.
- Impressora offline ou em erro: sem mensagem, sem tempo restante (como hoje), sem marcador de
  pausa.
- Vários monitores: o ícone de cada barra mostra o marcador conforme a impressora que ele
  representa.

## Requirements *(mandatory)*

### Functional Requirements

**Mensagem da impressora**

- **FR-001**: O painel MUST exibir a mensagem de status que a impressora selecionada está
  mostrando, quando houver, junto dos detalhes da impressão.
- **FR-002**: Mensagem vazia MUST NOT ocupar espaço no painel.
- **FR-003**: A mensagem MUST acompanhar a impressora em até um ciclo de atualização.
- **FR-004**: A mensagem MUST aparecer só com a impressora imprimindo ou pausada; ociosa, em
  erro ou offline, MUST NOT aparecer, mesmo que a impressora ainda guarde uma mensagem.

**Tempo restante**

- **FR-005**: Quando o arquivo em impressão tem estimativa do fatiador, o tempo restante MUST
  aparecer desde o início da impressão, inclusive durante o aquecimento, a partir dessa
  estimativa.
- **FR-006**: Com estimativa do fatiador, o tempo restante MUST combinar duas estimativas: a do
  fatiador (duração prevista menos o tempo já impresso) e a pelo progresso (a das fatias
  anteriores). No início vale só a do fatiador; conforme o progresso avança, o peso passa
  gradualmente para a estimativa pelo progresso, até valer só ela no fim. A passagem MUST ser
  contínua: de um ciclo para o outro o valor não salta por causa da troca de peso. Enquanto a
  estimativa pelo progresso não existe (progresso muito baixo), vale só a do fatiador.
- **FR-007**: Sem estimativa do fatiador, o tempo restante MUST seguir o comportamento das fatias
  anteriores.
- **FR-008**: O tempo restante MUST NOT ser negativo nem zero enquanto a impressão não terminou.
  Passada a estimativa do fatiador (a impressão já durou mais que o previsto), MUST valer a
  estimativa pelo progresso; sem nenhuma estimativa disponível, MUST aparecer como indisponível
  ("—"), como no FR-011 da 001.
- **FR-009**: Obter a estimativa do fatiador MUST NOT atrasar nem bloquear a atualização do resto
  do status; a estimativa de um arquivo MUST ser obtida no máximo uma vez por impressão.

**Ícone**

- **FR-010**: O ícone da barra MUST mostrar um marcador de pausa quando a impressora que ele
  representa está pausada, visualmente distinto do selo de erro e legível em qualquer tema.
- **FR-011**: O marcador MUST NOT aparecer em nenhum outro estado.

**Geral**

- **FR-012**: Nenhuma destas melhorias MUST enviar comandos à impressora; só leem o que ela já
  informa.
- **FR-013**: O tooltip, as ações do painel e as notificações MUST continuar como nas fatias
  anteriores.

### Key Entities

- **Mensagem de status**: texto curto que a impressora exibe; pode estar vazio; pertence à
  impressora, não à impressão.
- **Estimativa do fatiador**: duração total prevista, gravada no arquivo pelo fatiador; associada
  ao nome do arquivo; pode não existir.
- **Tempo restante**: valor exibido no painel, derivado da estimativa do fatiador, do tempo já
  impresso e do progresso, conforme o FR-006.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Durante o aquecimento inicial de uma impressão com mensagem na impressora, o painel
  mostra a mensagem em 100% das aberturas, e ela coincide com a da impressora (±1 ciclo).
- **SC-002**: Para arquivos com estimativa do fatiador, o tempo restante aparece em até 2 ciclos
  depois do início da impressão (antes: só depois de ~1% de progresso).
- **SC-003**: Nos primeiros 10% de uma impressão com estimativa do fatiador, o tempo restante
  exibido fica entre a estimativa do fatiador (menos o tempo já impresso) e a estimativa pelo
  progresso, a no máximo 10% da distância entre elas a partir da do fatiador. A precisão em
  relação ao fim real depende do fatiador e é só registrada no teste em hardware, como
  observação.
- **SC-004**: Em 100% das leituras, o tempo restante nunca aparece negativo nem zero durante uma
  impressão.
- **SC-005**: Com progresso abaixo de 10%, um observador distingue "pausada" de "imprimindo" só
  pelo ícone em 100% dos casos, em pelo menos dois temas (um claro e um escuro).
- **SC-006**: A atualização do status continua no mesmo ritmo das fatias anteriores com a
  estimativa sendo obtida (nenhum ciclo perdido por causa dela).
- **SC-007**: Depois dos primeiros 2% de progresso, entre dois ciclos seguidos o tempo restante
  exibido não muda, além do tempo que passou, mais de 10% do valor anterior (sem saltos causados
  pela troca de estimativa). Única exceção, registrada no plano: o ciclo em que a estimativa do
  fatiador se esgota (a impressão já passou do tempo previsto).

## Assumptions

- A impressora informa a mensagem de status e a estimativa do fatiador pelos mesmos meios que o
  plugin já usa para o status (leitura, sem comandos). As impressoras do usuário usam OrcaSlicer,
  que grava a estimativa.
- "No máximo uma vez por impressão" (FR-009) vale por barra: com dois monitores, cada barra busca
  a estimativa uma vez (duas consultas por impressão), como já acontece com as consultas de
  status. Uma falha (arquivo sem metadados, impressora sem resposta) também conta como a busca
  daquela impressão: não há nova tentativa até a próxima impressão.
- A mensagem vem da impressora já traduzida pelas macros do usuário (por exemplo, em português);
  o plugin não traduz.
- O rótulo "Remaining" do painel continua o mesmo; o plugin não indica de onde veio a estimativa.
- O marcador de pausa usa as cores do tema (Princípio VIII) e convive com a barra de progresso e
  com o selo de erro das fatias anteriores.
- Fora de escopo: camada atual/total, filamento usado, horário previsto de término (ETA),
  miniatura do arquivo, histórico de impressões e configuração de qual estimativa usar.
