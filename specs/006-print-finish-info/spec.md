# Feature Specification: Quando termina (horário de término, camada e tempo no tooltip)

**Feature Branch**: `main` (sem branch dedicada; nenhum hook de branch configurado)

**Created**: 2026-09-30

**Status**: Concluída em 2026-09-30 (teste em hardware aprovado na Voron depois da correção do aquecimento, FR-013; camada real só com o Moonraker falso, a Voron não a informa; ver [hardware-test.md](./hardware-test.md))

**Input**: User description: "quando termina: horário previsto de término e camada atual/total no painel; tempo restante no tooltip do ícone da barra"

**Contexto**: continuação da fatia [005](../005-status-polish/spec.md), que passou a mostrar o tempo
restante desde o início da impressão (estimativa do fatiador combinada com o progresso). No teste
em hardware da 005, com quase 30 minutos de aquecimento antes de imprimir, a pergunta prática era
"a que horas termina?", e o painel só dava a duração. Esta fatia mostra o horário previsto de
término e a camada atual, e leva o tempo restante para o tooltip do ícone, para responder sem abrir
o painel. Só lê o que a impressora já informa; não envia comandos. Textos da interface em inglês.

## Clarifications

### Session 2026-09-30

- Q: De onde vem a camada atual quando a impressora não a informa? → A: não vem; a camada só
  aparece quando a própria impressora informa a camada atual. O plugin não estima pela altura do
  bico. Na Voron de hoje a linha não aparece até o fatiador passar a informar as camadas.
- Q: Que formato de hora usar no horário de término? → A: sempre 24 h ("16:52"), igual ao relógio
  da barra do usuário; o locale do sistema dele é 12 h (en_US), o que daria "4:52 PM" ao lado de
  um relógio "16:15" (decidido no plano).
- Q: (teste em hardware, apontado pelo usuário) Durante o aquecimento, "Ends 17:07" é falso: os
  6 min do fatiador só começam quando a impressão começa de fato. O que mostrar? → A: marcar o
  aquecimento: enquanto nada foi extrudado, o painel mostra "Remaining 6m + warm-up" e nenhum
  horário de término, e o tooltip mostra "· warming up"; ao começar a imprimir, tudo volta ao
  normal. Corrige também a fatia 005, que mostrava "6m" durante o aquecimento como se fosse o
  tempo até o fim.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Saber a que horas a impressão termina (Priority: P1)

O usuário abre o painel e vê, junto do tempo restante, o horário previsto de término (por
exemplo, uma linha "Ends" com o valor "16:52"), para planejar quando voltar à impressora.

**Why this priority**: é a pergunta que motivou a fatia; converter duração em horário de cabeça é
exatamente o que o usuário não quer fazer.

**Independent Test**: com uma impressão em andamento e tempo restante conhecido, abrir o painel e
conferir que o horário mostrado é o horário atual mais o tempo restante (±1 minuto).

**Acceptance Scenarios**:

1. **Given** a impressora selecionada está imprimindo e o tempo restante é conhecido, **When** o
   painel é aberto, **Then** aparece o horário previsto de término, igual a "agora + tempo
   restante" (±1 minuto).
2. **Given** o término cai em outro dia (por exemplo, depois da meia-noite), **When** o painel é
   aberto, **Then** o horário indica que é em outro dia (por exemplo, "tomorrow 02:10").
3. **Given** a impressão está pausada, **When** o tempo passa, **Then** o horário de término é
   recalculado a cada ciclo e vai ficando mais tarde, porque a impressão não avança.
4. **Given** o tempo restante é desconhecido ("—"), **When** o painel é aberto, **Then** o
   horário de término não aparece (nada de horário inventado).
5. **Given** a impressora está aquecendo antes de imprimir (nada extrudado ainda), **When** o
   painel é aberto, **Then** aparece "Remaining 6m + warm-up" e nenhum horário de término
   (FR-013); o tooltip mostra "warming up".

---

### User Story 2 - Ver o tempo restante sem abrir o painel (Priority: P1)

Passando o mouse sobre o ícone da barra, o tooltip de uma linha mostra também quanto falta (por
exemplo, "Voron — printing 42% · 26m left").

**Why this priority**: é o jeito mais rápido de responder "quanto falta?", sem clicar.

**Independent Test**: com uma impressão em andamento, passar o mouse sobre o ícone e conferir o
tempo restante no tooltip, igual ao do painel.

**Acceptance Scenarios**:

1. **Given** a impressora que o ícone representa está imprimindo ou pausada com tempo restante
   conhecido, **When** o usuário passa o mouse sobre o ícone, **Then** o tooltip mostra o tempo
   restante, igual ao do painel, na mesma linha.
2. **Given** o tempo restante é desconhecido, ou a impressora está ociosa, em erro ou offline,
   **When** o usuário passa o mouse, **Then** o tooltip é o mesmo das fatias anteriores.
3. **Given** a lista de impressoras do menu "Printer" do painel, **When** ela é exibida, **Then**
   as linhas continuam como hoje (o tempo restante vai só no tooltip do ícone).

---

### User Story 3 - Saber em que camada a impressão está (Priority: P2)

O painel mostra a camada atual e o total (por exemplo, "Layer 12/62"), para o usuário ter uma
noção física do avanço, que a porcentagem nem sempre dá.

**Why this priority**: complementa o progresso, mas não é essencial para decidir quando voltar.

**Independent Test**: com uma impressão em andamento, conferir no painel a camada e o total
contra a interface web da impressora.

**Acceptance Scenarios**:

1. **Given** a impressora está imprimindo e a camada pode ser determinada, **When** o painel é
   aberto, **Then** aparece "camada atual / total", igual à da interface web (±1 camada).
2. **Given** a camada não pode ser determinada, **When** o painel é aberto, **Then** a linha de
   camada não aparece.
3. **Given** a impressora está no aquecimento, antes da primeira camada, **When** o painel é
   aberto, **Then** a camada não aparece ou aparece como "0/total", nunca um número sem sentido.
4. **Given** a impressora não informa a camada atual (como a Voron hoje), **When** a impressão
   avança, **Then** a linha de camada não aparece, mesmo que o arquivo traga o total (FR-009).

---

### Edge Cases

- Tempo restante muito grande (impressões de mais de 24 h): o horário indica o dia (por exemplo,
  nome do dia da semana).
- Fuso ou relógio do computador errados: o horário de término segue o relógio do computador; o
  plugin não corrige.
- Mudança do horário de verão durante a impressão: o horário segue o relógio do computador.
- Tooltip com nome de impressora longo: a linha continua uma só (o shell corta se preciso).
- A impressora informa uma camada atual maior que o total (por exemplo, total vindo de um arquivo
  diferente): a camada mostrada é limitada ao total (FR-010).
- Arquivo sem informação de camadas: sem linha de camada.
- Vários monitores: cada tooltip e cada painel mostram o mesmo tempo e horário, com diferença de
  no máximo 1 minuto (cada barra consulta a impressora no próprio ritmo).

## Requirements *(mandatory)*

### Functional Requirements

**Horário de término**

- **FR-001**: Com o tempo restante conhecido, o painel MUST mostrar o horário previsto de término
  = horário atual + tempo restante, arredondado ao minuto.
- **FR-002**: O horário MUST usar o formato de 24 h ("16:52") e, quando o término não for hoje,
  MUST indicar o dia ("tomorrow" ou o dia da semana).
- **FR-003**: Sem tempo restante conhecido, o horário de término MUST NOT aparecer.
- **FR-004**: O horário MUST ser recalculado a cada atualização do status (inclusive em pausa).
- **FR-013**: Enquanto a impressão ainda não extrudou nada (aquecimento, homing, nivelamento), o
  horário de término MUST NOT aparecer, o tempo restante MUST aparecer como "<tempo do fatiador> +
  warm-up" (ou "—" sem estimativa) e o tooltip MUST mostrar "warming up" no lugar do tempo
  restante. A duração do aquecimento é desconhecida, então nenhum horário pode ser prometido.

**Tooltip**

- **FR-005**: Com a impressora representada imprimindo ou pausada e tempo restante conhecido, o
  tooltip do ícone MUST acrescentar o tempo restante à linha atual, no mesmo formato do painel.
- **FR-006**: Em qualquer outro caso, o tooltip MUST continuar igual ao das fatias anteriores.
- **FR-007**: As linhas do menu "Printer" do painel MUST continuar como estão.

**Camada**

- **FR-008**: Com a camada atual e o total conhecidos, o painel MUST mostrar "camada atual/total"
  durante a impressão (imprimindo ou pausada).
- **FR-009**: A camada atual MUST vir só da própria impressora; sem ela, a linha de camada MUST
  NOT aparecer. O total MUST vir da impressora e, se ela não o informar, dos dados do arquivo
  gravados pelo fatiador.
- **FR-010**: A camada mostrada MUST ficar entre 0 e o total; sem camada determinável, a linha MUST
  NOT aparecer.

**Geral**

- **FR-011**: Nenhuma destas melhorias MUST enviar comandos à impressora.
- **FR-012**: O tempo restante continua o da fatia 005 (mesma regra, mesmo valor no painel e no
  tooltip).

### Key Entities

- **Horário de término**: horário atual mais o tempo restante; derivado, recalculado a cada ciclo.
- **Camada**: número da camada atual e total de camadas da impressão; pode não ser conhecido.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 100% das leituras com tempo restante conhecido, o horário de término difere de
  "agora + tempo restante" em no máximo 1 minuto.
- **SC-002**: O usuário descobre quanto falta passando o mouse no ícone, sem clicar, em 100% dos
  casos com tempo restante conhecido.
- **SC-003**: Com uma impressora que informa a camada, a camada mostrada coincide com a da
  interface web em pelo menos 95% das leituras (±1 camada) e nunca passa do total; com uma que não
  informa, a linha nunca aparece.
- **SC-004**: Nenhuma leitura mostra horário de término sem tempo restante conhecido, nem camada
  fora de 0..total.

## Assumptions

- No painel, o horário aparece como uma linha "Ends" com o valor ("16:52", "tomorrow 02:10"),
  no mesmo estilo das linhas "File" e "Remaining".
- O relógio (hora e fuso) vem do computador do usuário; o formato é sempre 24 h
  (Clarifications). Textos em inglês ("Ends", "tomorrow", nomes curtos dos dias, "Layer", "left").
- O tempo restante é o da fatia 005; esta fatia não muda o cálculo.
- A camada atual só é conhecida quando a impressora a informa, o que depende de o fatiador gravar
  essa informação no arquivo (no OrcaSlicer, um comando de "layer change" na configuração da
  impressora). A Voron não informa hoje (conferido em 2026-09-30); ver a camada nela exige mudar a
  configuração do fatiador, o que fica com o usuário e fora desta fatia. O total, quando a
  impressora não informa, vem dos dados do arquivo (a Voron: 62 camadas no arquivo testado).
- Fora de escopo: notificação "falta pouco", horário de início, filamento, miniatura, histórico e
  configuração do formato do horário.
