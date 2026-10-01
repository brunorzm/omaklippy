# Feature Specification: Cadastrar impressoras pelo painel, com descoberta na rede

**Feature Branch**: `main` (sem branch dedicada; nenhum hook de branch configurado)

**Created**: 2026-10-01

**Status**: Draft

**Input**: User description: "cadastrar impressoras pelo painel (sem editar o shell.json) + descoberta automática na rede (mDNS)"

**Contexto**: hoje a lista de impressoras só muda editando a configuração do shell (ou colando o
comando que o painel vazio sugere, fatia [001](../001-printer-status-bar/spec.md)). Para quem
instala o plugin pela primeira vez (ele é público), esse é o maior obstáculo. Esta fatia permite
adicionar e remover impressoras pelo próprio painel, e ajuda a achá-las na rede.

Conferido em 2026-10-01, só com leitura: nem a Voron nem a Biqu se anunciam como Moonraker na rede
(o anúncio é opcional na configuração do Moonraker e está desligado nas duas); a Voron anuncia só o
computador, e a Biqu nada, embora responda pelo nome. Por isso a descoberta (decisão do usuário)
combina duas formas: o anúncio de Moonraker, quando existe, e, **só quando o usuário pede**, uma
verificação de cada endereço da rede local. Textos da interface em inglês.

## Clarifications

### Session 2026-10-01

- Q: Como a descoberta acha as impressoras? → A: anúncio de Moonraker na rede (mDNS) e, a pedido do
  usuário, verificação de cada endereço da rede local na porta do Moonraker, só com consultas de
  leitura.
- Q: O que o painel permite fazer com a lista? → A: adicionar (pela descoberta ou digitando
  endereço e nome) e remover com confirmação. Renomear e editar continuam pela configuração.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Adicionar uma impressora achada na rede (Priority: P1)

O usuário abre o painel, pede para procurar impressoras, vê as que foram achadas na rede (com nome
e endereço) e adiciona uma com um clique. Ela passa a aparecer no painel e na barra como as
cadastradas à mão, e continua cadastrada depois de reiniciar o shell.

**Why this priority**: é o caminho mais curto do plugin recém-instalado até a primeira impressora
no painel, sem conhecer o endereço nem editar arquivos.

**Independent Test**: com o painel vazio e a Voron e a Biqu ligadas, procurar, ver as duas na
lista, adicionar a Voron e ver o status dela no painel; reiniciar o shell e ver que continua lá.

**Acceptance Scenarios**:

1. **Given** o painel está aberto (com ou sem impressoras), **When** o usuário pede para procurar,
   **Then** o painel mostra que está procurando e, ao terminar, lista as impressoras achadas, cada
   uma com o nome que ela informa e o endereço.
2. **Given** a busca terminou, **When** uma impressora achada já está cadastrada (mesmo endereço),
   **Then** ela aparece marcada como já adicionada e não pode ser adicionada de novo.
3. **Given** uma impressora achada não cadastrada, **When** o usuário a adiciona, **Then** ela entra
   na lista com o nome informado por ela (ou o nome do computador) e o endereço, fica selecionada no
   painel, e a configuração do shell passa a contê-la.
4. **Given** a busca não achou nada, **When** termina, **Then** o painel diz que nada foi achado e
   oferece adicionar pelo endereço (US2).
5. **Given** a verificação da rede está em andamento, **When** o usuário fecha o painel ou cancela,
   **Then** a busca para e nada é adicionado.

---

### User Story 2 - Adicionar uma impressora pelo endereço (Priority: P2)

A impressora não foi achada (outra rede, VPN, nome que só o usuário conhece). O usuário digita o
endereço e um nome, o painel confere que ali responde um Moonraker e adiciona.

**Why this priority**: cobre o que a descoberta não acha; sem ele, esses casos voltam à edição da
configuração.

**Independent Test**: digitar `biqu.local` e "Biqu B1", ver a conferência e a impressora no
painel; digitar um endereço inválido ou que não responde e ver o motivo.

**Acceptance Scenarios**:

1. **Given** o usuário escolhe adicionar pelo endereço, **When** digita um endereço e um nome e
   confirma, **Then** o painel confere o endereço (responde como Moonraker?) antes de adicionar.
2. **Given** o endereço é inválido, **When** o usuário confirma, **Then** o painel mostra o motivo
   e não adiciona.
3. **Given** o endereço é válido mas não responde como Moonraker, **When** a conferência termina,
   **Then** o painel mostra o motivo e oferece adicionar mesmo assim (impressora desligada agora).
4. **Given** o nome ficou vazio, **When** o usuário confirma, **Then** o nome passa a ser o que a
   impressora informa ou, sem resposta, o próprio endereço.
5. **Given** o endereço já está cadastrado, **When** o usuário confirma, **Then** o painel avisa e
   não duplica.

---

### User Story 3 - Remover uma impressora (Priority: P3)

O usuário não usa mais uma impressora e a remove pelo painel, com confirmação.

**Why this priority**: completa o ciclo básico; é menos frequente que adicionar.

**Independent Test**: remover a Biqu pelo painel, confirmar, ver que ela some do painel, da barra e
da configuração; desistir não remove.

**Acceptance Scenarios**:

1. **Given** a impressora selecionada no painel, **When** o usuário pede para removê-la, **Then**
   uma confirmação com o nome dela aparece, com "Back" selecionado.
2. **Given** a confirmação, **When** o usuário confirma, **Then** a impressora some do painel, da
   barra e da configuração; desistir não muda nada.
3. **Given** era a última impressora, **When** ela é removida, **Then** o painel volta ao estado
   vazio, que agora oferece procurar e adicionar.

---

### Edge Cases

- **Configuração editada à mão**: renomear, `webUrl` e a ordem continuam pela configuração do shell;
  adicionar e remover pelo painel preservam esses campos das outras impressoras.
- **Gravação falha** (o shell recusa ou não responde): o painel mostra o motivo e a lista não muda.
- **Duas barras** (um monitor = uma barra) ou o widget mais de uma vez na barra: a mudança vale para
  o widget cujo painel o usuário usou; as barras que mostram o mesmo widget passam a mostrar a lista
  nova.
- **Rede grande ou várias redes**: a verificação cobre só a rede local do computador (as redes
  diretamente ligadas a ele, até 254 endereços cada), nunca VPNs; é feita com consultas de leitura,
  em paralelo limitado, e termina em até 30 s.
- **Mesma impressora por dois caminhos** (anúncio e verificação, ou nome e IP): aparece uma vez,
  preferindo o nome da rede (`voron.local`) ao IP, porque o IP pode mudar.
- **Impressora achada sem nome informado**: usa o nome do computador, ou o endereço.
- **Ferramenta de descoberta ausente** (o serviço de anúncios da rede não instalado): a busca usa só
  a verificação dos endereços e o painel avisa que os anúncios não estão disponíveis (Princípio IV).
- **Painel sem impressoras**: em vez do comando para copiar (001), oferece procurar e adicionar.
- **Endereço com porta ou `http(s)://`**: aceito nas mesmas formas da configuração (001).
- **Teclado**: busca, lista, campos de texto e botões acessíveis pelo teclado, como o resto do
  painel; digitar nos campos não dispara os atalhos do painel.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O painel MUST oferecer procurar impressoras na rede, com indicação de andamento e
  possibilidade de cancelar.
- **FR-002**: A busca MUST juntar as impressoras que se anunciam como Moonraker na rede e as achadas
  verificando cada endereço das redes locais do computador na porta do Moonraker, só com consultas
  de leitura, só quando o usuário pede, e MUST terminar em até 30 s.
- **FR-003**: Cada resultado MUST mostrar nome e endereço, sem repetir a mesma impressora, e MUST
  indicar as já cadastradas.
- **FR-004**: Adicionar um resultado MUST gravar a impressora na configuração do shell com nome e
  endereço, preservando as demais impressoras e seus campos, e MUST selecioná-la no painel.
- **FR-005**: O painel MUST permitir adicionar pelo endereço e nome digitados, conferindo antes se o
  endereço responde como Moonraker; sem resposta, MUST mostrar o motivo e oferecer adicionar mesmo
  assim; endereço inválido ou já cadastrado MUST NOT ser adicionado.
- **FR-006**: O painel MUST permitir remover a impressora selecionada, com confirmação que nomeia a
  impressora e abre com "Back" selecionado; desistir MUST NOT mudar nada.
- **FR-007**: Toda mudança MUST ser gravada pelo próprio shell na configuração dele (o plugin não
  cria nem escreve arquivos), MUST valer sem reiniciar o shell e MUST persistir depois de
  reiniciá-lo.
- **FR-008**: Falha ao gravar MUST aparecer no painel com o motivo, sem mudar a lista.
- **FR-009**: O painel vazio MUST oferecer procurar e adicionar no lugar do comando para copiar.
- **FR-010**: A busca, o formulário e a remoção MUST ser acionáveis por mouse e teclado; digitar em
  um campo MUST NOT acionar atalhos do painel.
- **FR-011**: Sem a ferramenta de anúncios da rede, a busca MUST funcionar só com a verificação de
  endereços e MUST avisar que os anúncios não estão disponíveis.
- **FR-012**: O ícone da barra MUST continuar sem controles.

### Key Entities

- **Impressora achada**: nome (informado por ela, ou do computador, ou o endereço), endereço
  preferido (nome da rede se houver, senão IP), origem (anúncio, verificação ou ambos), já
  cadastrada ou não.
- **Busca**: em andamento ou terminada, resultados, aviso de anúncios indisponíveis, cancelável.
- **Pedido de gravação**: a lista nova de impressoras, enviada ao shell; sucesso ou falha com
  motivo.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Com o plugin recém-instalado e as impressoras ligadas na mesma rede, o usuário vê a
  primeira impressora no painel em no máximo 4 interações (abrir o painel, procurar, adicionar,
  e no máximo uma de navegação), sem editar arquivos.
- **SC-002**: A busca acha 100% das impressoras Moonraker ligadas na rede local do computador
  (testado com a Voron e a Biqu, que não se anunciam) e termina em até 30 s.
- **SC-003**: Em 100% dos casos, adicionar e remover mantêm intactos os outros campos e impressoras
  da configuração.
- **SC-004**: Uma impressora adicionada continua cadastrada depois de reiniciar o shell.
- **SC-005**: Em 100% dos testes, remover sem passar pela confirmação é impossível e desistir não
  muda nada.
- **SC-006**: Nenhuma impressora é cadastrada duas vezes pelo mesmo endereço.

## Assumptions

- O shell do Omarchy aceita que um widget peça a gravação das próprias configurações (é o mesmo
  caminho que os comandos `omarchy bar set` e `omarchy plugin` usam); a configuração continua
  inline na entrada do widget (Princípio I).
- A verificação de endereços consulta só a porta padrão do Moonraker (7125) e o endpoint de
  informações dele; impressoras atrás de proxy em outra porta são adicionadas pelo endereço (US2).
- "Redes locais" são as redes IPv4 ligadas diretamente às interfaces do computador, até /24;
  interfaces de VPN (Tailscale, WireGuard) ficam de fora.
- O serviço de anúncios da rede (Avahi) é opcional; está instalado e ativo neste computador.
- Fora de escopo: renomear, editar endereço ou `webUrl`, reordenar, descobrir por IPv6, varrer redes
  maiores que /24, ligar o anúncio no Moonraker da impressora, autenticação por chave de API.
