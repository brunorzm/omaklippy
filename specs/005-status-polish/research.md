# Research: Polimento do status

Decisões técnicas da fatia 005. A spec não tem `NEEDS CLARIFICATION` (Clarifications: mensagem só
imprimindo/pausada; tempo restante por combinação gradual).

## R1. Mensagem da impressora (US1)

- **Decision**: ler `display_status.message` na consulta que já existe (o objeto `display_status`
  já é pedido por inteiro desde a 001). A leitura ganha `displayMessage` (texto com `trim()`), o
  status ganha `message` (limpo no caminho offline) e `detailFor` só o expõe como `messageText`
  quando `hasJob(state)` (FR-004). No painel, uma linha de texto logo abaixo do bloco de progresso,
  com quebra de linha, sem aumentar a largura.
- **Rationale**: nenhuma requisição nova. Na Voron, depois do fim da impressão, a mensagem continua
  "Imprimindo" (conferido com `GET` em 2026-09-30); por isso o filtro por estado.
- **Não confundir** com `print_stats.message`, que já é o motivo do erro de impressão (001).
- **Alternatives considered**: mostrar sempre (rejeitado nas Clarifications); limpar a mensagem
  pela impressora (exigiria enviar G-code, fora do escopo).

## R2. Estimativa do fatiador (US2, FR-005, FR-009)

- **Decision**: `GET /server/files/metadata?filename=<encodeURIComponent(filename)>` por `curl`,
  num `Process` com o mesmo esqueleto e timeout das consultas de status. Resultado:
  `result.estimated_time` finito e `> 0` → segundos; qualquer outra coisa (404 "Metadata not
  available", falha de rede, corpo inesperado) → `null`.
- **Onde fica**: no próprio status, `status.estimate = { filename, seconds, pending }`.
  `applyReading` copia `prev`, então a estimativa sobrevive às leituras sem esforço; ela é apagada
  quando a impressora deixa de ter impressão (`hasJob` falso) ou fica offline, e uma impressão nova
  (ou outro arquivo) busca de novo. Uma falha é guardada como `seconds: null` para aquele arquivo:
  não há nova tentativa na mesma impressão (FR-009, Assumptions).
- **Quando buscar**: `planEstimate(statuses, printers, timeoutMs)`, chamada junto com o
  `dispatch` de cada ciclo, pede a estimativa das impressoras com impressão (`hasJob`), `filename`
  não vazio e sem estimativa para esse arquivo (nem pendente). Uma busca por impressora por vez.
- **Fixtures reais** (Voron, Moonraker v0.11, `GET`, 2026-09-30): `metadata-ok.json`
  (`estimated_time` 1343, OrcaSlicer) e `metadata-missing.json` (404 com traceback do Moonraker).
- **Nome com espaços ou subpasta**: `encodeURIComponent` no nome inteiro (o Moonraker decodifica
  o parâmetro). A Voron não tem arquivos em subpastas hoje, então isso fica como suposição
  coberta por teste do argumento montado, não por captura real.
- **Alternatives considered**: `print_stats.info`/`virtual_sdcard.file_path` (não trazem a
  estimativa); buscar a cada ciclo (fere FR-009); compartilhar entre barras via `Shared.js`
  (desnecessário, Assumptions da spec).

## R3. Combinação das estimativas (FR-006, FR-008, SC-007)

Entradas: `E` (estimativa do fatiador, segundos), `d` (`print_duration`, só tempo imprimindo; 0
durante o heat-soak), `p` (progresso cru, 0..1) e `P` = `estimateRemaining` de hoje (existe só com
`p ≥ 0.01` e `d > 0`).

```text
S = E − d                                    (estimativa do fatiador)
sem E                    → R = P             (comportamento das fatias anteriores; null → "—")
S > 0 e P ausente        → R = S             (início e heat-soak: d = 0 → R = E)
S > 0 e P presente       → w = clamp(p, 0, 1); R = (1 − w)·S + w·P
S ≤ 0 (fatiador errou para menos) → R = P    (null → "—"; FR-008)
R ≤ 0 ou não finito      → null              ("—", FR-008; nunca "0")
```

- **Decision**: função pura nova `blendRemaining(progressRemaining, slicerTotal, printDuration,
  progress)`; `estimateRemaining` fica igual (os testes da 001 dependem dela). O status ganha
  `progress` (cru) e `printDuration` para o `detailFor` calcular.
- **Continuidade**: quando `P` aparece (p = 0,01), o salto é `0,01·|P − S|`, pequeno; a partir
  daí o peso muda no máximo o que o progresso muda em um ciclo. O único ponto descontínuo é o
  estouro (`S ≤ 0`), aceito: ali a estimativa do fatiador já não diz nada, e continuar misturando
  com `S = 0` daria `w·P`, que subestima sempre.
- **SC-007** é conferido por teste numa linha do tempo sintética (inclusive com `P` muito errado a
  2%), não a olho, medindo o salto além do tempo decorrido (`|R₂ − (R₁ − Δt)|`), e não a variação
  relativa pura, que é naturalmente grande no fim de qualquer impressão (30 s → 15 s).
- **Alternatives considered**: peso por tempo decorrido (não reflete a impressão); média simples
  (salta quando `P` aparece); `E` sozinho até 5% e depois `P` (opção B, rejeitada nas
  Clarifications).

## R4. Marcador de pausa no ícone (US3)

- **Decision**: no `iconComponent` do `BarWidget.qml`, com `iconState.mode === "paused"`, duas
  barrinhas verticais (`Rectangle`s) no canto superior direito, o mesmo canto do selo de erro
  (estados exclusivos), com `markColor`, tamanhos por `Style.space()` e borda na cor do fundo da
  barra, como o selo. A barra de progresso atenuada continua.
- **Rationale**: `buildIconState` já devolve `mode: "paused"`; nenhuma lógica nova, só desenho.
  Duas barras são o símbolo universal de pausa e têm forma diferente do ponto de erro, o que
  importa em temas com `urgent` cinza (Solitude, visto na 001).
- **SC-005**: capturas do ícone em dois temas (um claro, um escuro). Trocar o tema muda o desktop
  do usuário: passo feito **com o usuário**, voltando ao tema dele no fim.

## R5. Validação

- **Testes puros**: leitura e status (`displayMessage`/`message`, `progress`, `printDuration`,
  `estimate`), `detailFor.messageText` por estado, `buildMetadataArgs`, `parseMetadataResponse`
  com as duas fixtures reais e falhas de transporte, `planEstimate`/`acceptEstimate` (uma busca
  por arquivo por impressão, falha guardada, limpeza fora de impressão), `blendRemaining` por
  tabela e por linha do tempo (SC-004, SC-007).
- **Testes antigos que mudam**: "initialStatus is offline, waiting for the first answer"
  (`response.test.js`, campos novos). `detailFor` não tem teste de igualdade profunda hoje.
- **Moonraker falso**: fixtures com mensagem e sem mensagem, `standby` com mensagem velha,
  metadados 200 e 404 (o servidor falso passa a responder `/server/files/metadata`).
- **Hardware (Voron)**: o usuário inicia uma impressão; o assistente registra a cada ciclo a
  mensagem, o tempo restante mostrado e o fim real (SC-001 a SC-003) e o usuário pausa com menos de
  10% para as capturas do ícone (SC-005). Só `GET`.
