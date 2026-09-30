# Research: Quando termina

Decisões técnicas da fatia 006. A spec não tem `NEEDS CLARIFICATION` (Clarifications: camada só
quando a impressora informa; horário sempre em 24 h).

## R1. Horário de término (US1)

- **Decision**: `formatFinish(finishMs, nowMs)` pura em `Model.js`, usando o relógio local
  (`Date` com `getHours`/`getDate`…, que no motor QML e no Node seguem o fuso do computador).
  `finishMs = now + R·1000`, com `R` = `blendRemaining` da 005, arredondado ao minuto mais
  próximo. Formato:
  - mesmo dia → `16:52`
  - dia seguinte → `tomorrow 02:10`
  - até 6 dias depois → `Thu 02:10` (nome curto do dia, em inglês, de `TEXT`)
  - mais longe → `7 Oct 02:10`
  - sempre 24 h, com zero à esquerda nas horas e minutos (Clarifications)
- **No painel**: uma linha `Ends` logo abaixo de `Remaining`, só com `R` conhecido.
  Recalculada a cada atualização: o `now` do painel já é renovado a cada leitura e a cada 15 s
  com o painel aberto (001), então em pausa o horário vai ficando mais tarde (FR-004).
- **Rationale**: o locale do usuário é `en_US` (12 h), mas o relógio da barra dele é `HH:mm`;
  24 h fixo evita "4:52 PM" ao lado de "16:15" (decisão do usuário no plano). Funções puras com
  `Date` local são testáveis fixando `process.env.TZ` no teste.
- **Alternatives considered**: `Qt.formatDateTime` com o locale (não testável no Node e daria 12 h
  para este usuário); configuração de formato (fora de escopo na spec).

## R2. Tempo restante no tooltip (US2)

- **Decision**: `tooltipLine(printer, status)` nova: `summaryLine` + ` · 26m left` quando há
  impressão e `blendRemaining` é conhecido (mesmo `formatDuration` do painel, então `<1m left` no
  fim). `buildIconState` passa a usar `tooltipLine`; o menu "Printer" continua com `summaryLine`
  (FR-007).
- **Rationale**: `summaryLine` serve hoje ao tooltip e às opções do menu; separar evita mudar o
  menu. O tooltip do shell é de uma linha; o sufixo é curto.

## R3. Camada (US3)

- **Decision**: ler `print_stats.info.current_layer` e `total_layer` (já vêm na consulta: o
  objeto `print_stats` é pedido inteiro desde a 001) como inteiros `≥ 0` ou `null`. O total, se a
  impressora não informar, vem de `layer_count` dos metadados do arquivo, que a 005 já busca uma
  vez por impressão: o `estimate` ganha `layerCount`. Linha `Layer` = `atual/total` só com
  impressão, `current_layer` conhecido e algum total; atual limitado a `0..total` (FR-010).
- **Conferido**: a Voron devolve `info: { current_layer: null, total_layer: null }` (o fatiador
  não grava `SET_PRINT_STATS_INFO`), e os metadados trazem `layer_count` (62 no arquivo testado,
  13 no da fixture `metadata-ok`). Pela decisão do usuário, na Voron de hoje a linha não aparece.
- **Mudança na 005**: `acceptEstimate` ganha o parâmetro opcional `layerCount` e o `estimate`
  ganha o campo; dois testes da 005 que comparam o `estimate` inteiro mudam de propósito.
- **Alternatives considered**: estimar pela altura do bico (rejeitado nas Clarifications);
  requisição própria para o total (desnecessária: os metadados já são buscados).

## R4. Validação

- **Testes puros**: `formatFinish` com `TZ` fixo (mesmo dia, virada da meia-noite, dias da
  semana, mais de uma semana, arredondamento, zero à esquerda), `detailFor.finishText` e
  `layerText`, `tooltipLine` por estado, `buildIconState.tooltip`, opções do menu inalteradas,
  leitura de `info` e `layer_count`.
- **Moonraker falso**: fixture de impressão com `info` preenchido (e outra sem total, para o total
  vir dos metadados) e a `printing` real sem `info`.
- **Hardware (Voron)**: o usuário inicia uma impressão; conferir "Ends at" contra agora + restante
  e o tooltip (passar o mouse, captura pelo usuário ou pelo assistente) e que a linha de camada
  fica escondida. Opcional: o usuário ativa o comando de camada no OrcaSlicer para ver a US3 real.
