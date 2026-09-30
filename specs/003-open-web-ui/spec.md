# Feature Specification: Abrir a interface web da impressora pelo painel

**Feature Branch**: `main` (sem branch dedicada; nenhum hook de branch configurado)

**Created**: 2026-09-29

**Status**: Implementada em 2026-09-30 (teste em hardware aprovado; remove/reinstalar pendente do push, ver [hardware-test.md](./hardware-test.md))

**Input**: User description: "abrir a interface WEB da impressora a partir do painel do plugin"

**Contexto**: continuação das fatias [001-printer-status-bar](../001-printer-status-bar/spec.md)
(ícone na barra, painel de detalhes e menu "Printer") e
[002-panel-print-actions](../002-panel-print-actions/spec.md) (Pause, Resume, Cancel e Emergency
stop no painel). A 001 reservou a área de ações do painel já pensando em "abrir interface web", e
a 002 deixou esse item explicitamente fora de escopo. Esta fatia acrescenta ao painel um botão que
abre a interface web (Mainsail, Fluidd ou equivalente) da impressora selecionada no navegador
padrão. Os textos da interface são em inglês (decisão da fatia 001).

## Clarifications

### Session 2026-09-29

- Q: Sem endereço de interface web informado, que endereço o botão abre? → A: o endereço
  cadastrado, mas sem a porta quando ela é `7125` (a padrão do Moonraker): `host:7125` →
  `http://host`; o endereço de interface web informado tem prioridade.
- Q: Em que lugar do painel fica o botão "Open web UI"? → A: em linha própria, de largura
  total, no fim da seção de ações: abaixo do Emergency stop (separado por um espaço) e acima de
  "updated … ago".

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Abrir a interface web da impressora selecionada (Priority: P1)

O usuário quer algo que o painel não oferece (ver a câmera, o console, iniciar uma impressão,
reiniciar o firmware depois de uma parada de emergência). Em vez de lembrar o endereço e digitar
no navegador, ele abre o painel e aciona "Open web UI"; o navegador padrão abre a interface web
da impressora selecionada e o painel se fecha.

**Why this priority**: é o núcleo da fatia; sozinho já entrega o atalho do desktop para tudo que
o plugin não faz. É também o caminho que o README indica para sair do erro depois de uma parada
de emergência ("restart the firmware from Mainsail/Fluidd").

**Independent Test**: com duas impressoras cadastradas, selecionar cada uma no menu "Printer",
acionar "Open web UI" e conferir que o navegador abre a interface daquela impressora e que o
painel se fecha.

**Acceptance Scenarios**:

1. **Given** há uma impressora selecionada com endereço válido, **When** o painel é exibido,
   **Then** aparece o botão "Open web UI" na área de ações.
2. **Given** o botão está visível, **When** o usuário o aciona (mouse ou teclado), **Then** o
   navegador padrão abre o endereço da interface web da impressora selecionada naquele momento e
   o painel se fecha.
3. **Given** a impressora selecionada está em erro (por exemplo, depois de uma parada de
   emergência) ou offline, **When** o painel é exibido, **Then** "Open web UI" continua
   aparecendo, mesmo sem os botões que enviam comandos à impressora.
4. **Given** a impressora selecionada não tem endereço de interface web válido (endereço
   inválido e sem endereço de interface web informado válido, FR-002), ou não há impressoras
   cadastradas,
   **When** o painel é exibido, **Then** "Open web UI" não aparece.
5. **Given** o usuário navega pelo painel com o teclado, **When** percorre as paradas do cursor,
   **Then** "Open web UI" é a última delas (depois de "Emergency stop") e Enter ou Espaço o
   aciona, como os demais botões.

---

### User Story 2 - Endereço da interface web diferente do endereço do Moonraker (Priority: P2)

Em algumas instalações a interface web não fica no endereço derivado (FR-005): por exemplo, o
Moonraker em uma porta diferente da padrão, ou a interface web em outro host ou porta. O usuário
informa, junto da impressora, o endereço da interface web, e o botão passa a abri-lo.

**Why this priority**: as instalações mais comuns (Mainsail/Fluidd na porta padrão do mesmo host,
cadastradas pelo host, como a Voron e a Biqu do usuário, ou pela porta `7125` do Moonraker)
funcionam sem configuração extra com a US1; esta história cobre as demais sem quebrar
configurações existentes.

**Independent Test**: cadastrar uma impressora com o Moonraker numa porta diferente de `7125` e um
endereço de interface web separado; acionar "Open web UI" e conferir que abre o endereço da
interface web, não o do Moonraker. Remover o endereço da interface web e conferir que o botão
volta a usar o endereço derivado.

**Acceptance Scenarios**:

1. **Given** a impressora tem um endereço de interface web informado e válido, **When** o
   usuário aciona "Open web UI", **Then** o navegador abre esse endereço.
2. **Given** a impressora não tem endereço de interface web informado, **When** o usuário aciona
   "Open web UI", **Then** o navegador abre o endereço derivado do endereço cadastrado
   (FR-005).
3. **Given** o endereço de interface web informado é inválido, **When** o painel é exibido,
   **Then** "Open web UI" não aparece para aquela impressora e o status e os comandos da
   impressora continuam funcionando normalmente.
4. **Given** uma configuração existente, sem endereço de interface web, **When** o plugin é
   atualizado para esta versão, **Then** ela continua válida sem nenhuma alteração.

---

### User Story 3 - Saber quando a interface web não pôde ser aberta (Priority: P3)

Se o desktop não consegue abrir o navegador, o usuário vê um aviso curto no painel em vez de
ficar sem saber se o clique funcionou.

**Why this priority**: é uma falha rara (desktop sem navegador padrão ou com o abridor de links
quebrado), mas sem aviso o botão pareceria simplesmente não fazer nada.

**Independent Test**: simular a falha ao abrir o navegador e conferir que o painel continua
aberto com a mensagem de falha na área de ações.

**Acceptance Scenarios**:

1. **Given** o desktop não consegue abrir o endereço, **When** o usuário aciona "Open web UI",
   **Then** o painel continua aberto e mostra uma mensagem curta com o motivo na área de ações,
   no mesmo formato das falhas de comando da fatia 002 (`Open web UI failed: …`).
2. **Given** a mensagem de falha está visível, **When** o usuário aciona outra ação ou troca de
   impressora, **Then** a mensagem some, como na fatia 002.

---

### Edge Cases

- Endereço cadastrado com a porta padrão do Moonraker (`host:7125`, `http://host:7125`) e sem
  endereço de interface web: o botão abre `http://host` (FR-005).
- Endereço cadastrado com outra porta (`host:8080`) e sem endereço de interface web: o botão
  abre o endereço como está, que pode não ter interface web; o navegador mostra o erro dele. O
  README orienta a informar o endereço da interface web nesse caso.
- A impressora está offline: o botão continua disponível; o navegador abre e mostra que o
  endereço não responde. O plugin não verifica o endereço antes de abrir.
- O usuário troca de impressora no menu e aciona o botão logo em seguida: abre o endereço da
  impressora selecionada no momento do acionamento.
- Um comando (Pause, Resume, Cancel ou Emergency stop) está em andamento: "Open web UI" continua
  disponível, porque não envia nada à impressora; o comando segue e o resultado aparece pelo
  estado real, como na 002 (painel fechado com comando em andamento).
- Uma confirmação de Cancel ou Emergency stop está aberta: o botão fica inacessível enquanto a
  confirmação está aberta, como os demais controles do painel.
- Nomes de impressora repetidos: cada uma abre o próprio endereço (a desambiguação por endereço
  da 001 continua valendo no menu).
- Acionamento duplo rápido: abre no máximo uma vez por acionamento efetivo; como o painel fecha
  após abrir, um segundo clique não chega ao botão.
- Endereço com caminho (`http://host/mainsail`) ou `https`: o caminho e o esquema são mantidos.

## Requirements *(mandatory)*

### Functional Requirements

**Botão**

- **FR-001**: O painel MUST exibir o botão "Open web UI" para a impressora selecionada sempre que
  ela tiver um endereço de interface web válido (informado ou derivado), em qualquer estado:
  imprimindo, pausada, ociosa, em erro ou offline.
- **FR-002**: O painel MUST NOT exibir "Open web UI" quando não há impressoras cadastradas ou
  quando a impressora selecionada não tem endereço de interface web válido.
- **FR-003**: "Open web UI" MUST ficar em linha própria, de largura total, no fim da área de
  ações do painel: abaixo da linha de "Emergency stop" (quando ela existe), separado dela por um
  espaço como o que separa "Cancel" de "Emergency stop", e acima da linha "updated … ago". MUST
  NOT usar a cor de alerta. A área de ações passa a aparecer sempre que o botão aparece; em
  erro e offline ela mostra só este botão (e a mensagem de falha, se houver).
- **FR-004**: "Open web UI" MUST ser acionável por mouse e por teclado, como uma parada do
  cursor do painel, seguindo a mesma navegação dos demais botões, e MUST ser a última parada,
  depois de "Emergency stop".

**Endereço**

- **FR-005**: Sem endereço de interface web informado, o endereço aberto MUST ser o endereço
  cadastrado da impressora já normalizado (mesmo esquema, host, porta e caminho usados para o
  status), com uma exceção: quando a porta é `7125` (a padrão do Moonraker), ela MUST ser
  retirada, mantendo esquema, host e caminho (`host:7125` → `http://host`,
  `https://host:7125/x` → `https://host/x`). Qualquer outra porta é mantida.
- **FR-006**: Cada impressora MAY ter um endereço de interface web informado na própria entrada
  da configuração, opcional, aceitando as mesmas formas do endereço da impressora (`host`,
  `host:porta`, `http(s)://host[:porta][/caminho]`). Quando informado e válido, MUST ser usado
  no lugar do derivado.
- **FR-007**: Um endereço de interface web inválido MUST esconder apenas o botão daquela
  impressora e MUST NOT afetar status nem comandos.
- **FR-008**: Configurações existentes, sem o novo campo, MUST continuar válidas e com o mesmo
  comportamento das fatias anteriores, mais o botão com endereço derivado.

**Abertura**

- **FR-009**: Ao ser acionado, o botão MUST abrir no navegador padrão do desktop o endereço da
  impressora selecionada no momento do acionamento.
- **FR-010**: Abrir a interface web MUST NOT enviar nenhuma requisição à impressora pelo plugin
  e MUST NOT esperar resposta dela; o desktop continua responsivo.
- **FR-011**: Depois de pedir a abertura com sucesso, o painel MUST se fechar.
- **FR-012**: Se a abertura falhar, o painel MUST continuar aberto e exibir uma mensagem curta
  com o motivo na área de ações (`Open web UI failed: …`), até a próxima ação ou a troca de
  impressora, como no FR-015 da fatia 002.

**Relação com a fatia 002**

- **FR-013**: A regra "em erro, offline ou sem impressoras, o painel não exibe botões de ação"
  (FR-005 da 002) passa a valer somente para as ações que enviam comandos à impressora (Pause,
  Resume, Cancel, Emergency stop). "Open web UI" segue o FR-001/FR-002 desta fatia.
- **FR-014**: "Open web UI" MUST continuar disponível enquanto um comando da 002 está em
  andamento, e acioná-lo MUST NOT cancelar nem alterar esse comando.
- **FR-015**: O ícone na barra MUST continuar sem controles (FR-017 da 002).

### Key Entities

- **Configuração da impressora** (da 001): ganha um campo opcional de endereço da interface web;
  os demais campos (nome, endereço) não mudam.
- **Endereço da interface web**: o endereço efetivo que o botão abre; é o informado, quando
  válido, ou o derivado do endereço da impressora; indefinido quando nenhum dos dois é válido.
- **Resultado da abertura**: sucesso (painel fecha) ou falha com motivo, exibida na área de
  ações só para a impressora selecionada, como o resultado de comando da 002.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A partir do desktop, o usuário chega à interface web da impressora selecionada com
  no máximo 2 interações (abrir o painel, acionar o botão), sem digitar endereço.
- **SC-002**: Em 100% dos casos de teste, o endereço aberto é o da impressora selecionada no
  momento do acionamento, para todas as formas de endereço aceitas (`host`, `host:porta`,
  `http://host/`, `https://host:porta`, `host:7125`, endereço com caminho) e com e sem endereço
  de interface web informado.
- **SC-003**: Em rede local, a janela do navegador com a interface web aparece em até 2 segundos
  depois do acionamento, com a impressora ligada.
- **SC-004**: Com a impressora em erro depois de uma parada de emergência, o usuário consegue
  abrir a interface web pelo painel em 100% das tentativas.
- **SC-005**: Configurações existentes das fatias 001 e 002 funcionam sem nenhuma edição depois
  da atualização (0 regressões nos testes existentes).
- **SC-006**: Em 100% das falhas simuladas ao abrir o navegador, o usuário vê o motivo no painel.

## Assumptions

- O desktop tem um navegador padrão configurado (o Omarchy traz um); qual programa abre o
  endereço é decisão do plano, respeitando a lista de binários do README (Princípio III da
  constituição).
- Nas instalações típicas (Mainsail ou Fluidd servidos na porta padrão, com o Moonraker atrás do
  mesmo servidor web ou na porta `7125` do mesmo host, como a Voron e a Biqu do usuário) a
  interface web está no host cadastrado, na porta padrão; por isso o padrão é o endereço
  derivado do FR-005 e o campo de endereço da interface web é opcional (regra confirmada nas
  Clarifications).
- O plugin não descobre nem verifica a interface web (não sonda portas nem caminhos) antes de
  abrir; a verificação fica por conta do navegador.
- Rótulo em inglês: "Open web UI"; mensagem de falha no formato da 002: `Open web UI failed: …`.
- O README ganha o novo campo na tabela de configuração e uma nota para instalações em que o
  endereço aponta direto para a porta do Moonraker.
- O teste em hardware (Princípio VII) só abre a interface web das impressoras reais no navegador;
  nenhum comando é enviado a elas.
- Fora de escopo nesta fatia: abrir a interface web pelo ícone da barra (clique do meio, menu) ou
  por atalho global, comando de IPC para abrir a interface web, embutir a interface web dentro do
  painel, escolher o navegador, descobrir impressoras ou interfaces web na rede, e reiniciar o
  firmware pelo painel.
