# Research: Status das impressoras 3D na barra

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Date**: 2026-09-29

Fontes: guia oficial (https://plugins.omarchy.org/develop.html), referência do shell
(`$OMARCHY_PATH/shell/README.md`, omarchy 4.0.4-1 instalado), código dos plugins first-party em
`/usr/share/omarchy/shell`, documentação do Moonraker
(https://moonraker.readthedocs.io/en/latest/external_api/) e Klipper Status Reference.

## R1. Como fazer requisições HTTP sem bloquear o shell

- **Decision**: um `Process` do Quickshell por impressora executando
  `curl -sS --connect-timeout <t> --max-time <t> -w '\n%{http_code}' <url>`, com
  `StdioCollector { waitForEnd: true }` e um `Timer` de guarda (timeout + 1 s) que mata o
  processo se o curl não terminar.
- **Rationale**: é o padrão dos plugins first-party (weather/Panel.qml usa `curl --max-time`);
  `Process` é assíncrono (Princípio II) e o timeout é imposto em dois níveis. O `-w` anexa o código
  HTTP ao corpo, o que permite distinguir "Moonraker respondeu com erro" (503/401) de "não
  respondeu" sem usar `-f` (que descarta o corpo).
- **Alternatives considered**:
  - `XMLHttpRequest` do QML: sem binário externo, mas nenhum plugin do shell o usa, não tem
    timeout nativo confiável e exigiria `abort()` manual; risco de comportamento diferente no
    runtime. Rejeitado por falta de precedente no Quickshell.
  - QtWebSockets / atualização em tempo real: fora de escopo nesta fatia.
- **Dependência**: `curl` passa a ser binário externo documentado no README (Princípio III).
  Se não existir (curl sai com erro de execução/127), a impressora aparece como "erro" com motivo
  "curl não encontrado" (Princípio IV: aviso visível, resto do plugin continua funcionando).

## R2. Quais endpoints do Moonraker consultar

- **Decision**: uma única requisição por impressora por ciclo:
  `GET /printer/objects/query?webhooks&print_stats&virtual_sdcard&display_status&extruder=temperature,target&heater_bed=temperature,target`.
- **Rationale**: traz estado do Klipper (`webhooks.state`, `state_message`), estado da impressão,
  progresso e temperaturas numa só chamada. Quando o Klipper não está conectado, o Moonraker
  responde `503 {"error":{"message":"Klippy Host not connected"}}`, suficiente para o estado
  "erro" sem uma segunda chamada a `/server/info`.
- **Alternatives considered**: `/server/info` + `/printer/objects/query` (duas chamadas por
  ciclo, dobra o tráfego sem ganho para os cinco estados); `/printer/info` (só estado geral).

## R3. Mapeamento para os cinco estados

- **Decision** (função pura `deriveState`), avaliada nesta ordem:
  1. Sem resposta dentro do timeout, erro de conexão/DNS, endereço inválido → **offline**.
  2. HTTP 401/403 → **erro** ("acesso não autorizado; adicione este computador em
     `trusted_clients`").
  3. HTTP 5xx ou corpo `{"error":...}` → **erro** com `error.message`.
  4. Corpo não-JSON ou sem `result.status` → **erro** ("resposta inesperada").
  5. `webhooks.state` ≠ `ready` (`startup`, `shutdown`, `error`) → **erro** com `state_message`.
  6. `print_stats.state`: `printing` → **imprimindo**; `paused` → **pausada**; `error` →
     **erro** (`print_stats.message`); `standby`, `complete`, `cancelled` → **ociosa**.
- **Rationale**: segue a spec (FR-006, FR-008, FR-010) e as recomendações do Moonraker
  (mostrar `state_message` em error/shutdown). `startup` como erro está nas Assumptions da spec.
- **Nota**: a autenticação padrão do Moonraker responde 401 a clientes fora de
  `trusted_clients`. A spec deixa impressoras com chave de API fora de escopo, mas o caso precisa
  de mensagem clara; isso foi acrescentado aos Edge Cases e ao FR-010 da spec.

## R4. Progresso e tempo restante

- **Decision**: progresso = `virtual_sdcard.progress` (0–1), com fallback para
  `display_status.progress`; exibido como `Math.floor(p * 100)`, limitado a 99 enquanto o estado
  for imprimindo/pausada (FR-007). Tempo restante =
  `print_duration / progress - print_duration`, só quando `progress ≥ 0.01` e
  `print_duration > 0`; senão indisponível ("—", FR-011).
- **Rationale**: `virtual_sdcard.progress` existe sempre que há impressão pelo Moonraker;
  `display_status` depende de `[display_status]` no Klipper. A estimativa por progresso é a que a
  spec assume e dispensa a chamada `/server/files/metadata`.
- **Alternatives considered**: estimativa do fatiador (`estimated_time` via metadata), mais
  precisa no início da impressão; fica como melhoria futura, porque exige uma segunda requisição
  e cache por arquivo.

## R5. Onde e como o usuário cadastra impressoras

- **Decision**: configurações inline na entrada do widget em `shell.json` (Princípio I):
  `printers` (array de `{ "name", "address" }`), `refreshIntervalSec` (inteiro, padrão 5),
  `timeoutSec` (inteiro, padrão 3). O manifest declara `defaults` e `schema` para os inteiros;
  `printers` não tem tipo de schema equivalente.
- **Rationale**: o shell repassa qualquer valor JSON da entrada em `settings` (BarModel.js
  `entrySettings`) e reaplica `settings` no widget vivo quando o `shell.json` muda (Bar.qml
  `applySettingsDelta`), o que atende FR-024 sem reiniciar. `defaults` não é mesclado em
  runtime, então o widget usa `setting(nome, padrão)`.
- **Limitação encontrada**: a versão instalada do shell (4.0.4-1) não traz o formulário de
  configurações que renderiza `schema`, e não existe tipo lista/objeto em nenhum manifest. Nesta
  fatia, "configurações do widget" significa editar a entrada em `shell.json` (documentado no
  README e no quickstart). Um formulário próprio fica para uma fatia futura, quando o painel de
  configurações do shell existir. Caminho suportado sem editar JSON à mão:
  `omarchy bar set io.github.brunorzm.omaklippy printers '[{"name":"Voron","address":"192.168.1.50"}]' --json`.
  O shell observa o `shell.json` (`FileView { watchChanges: true }`, shell.qml:137), então
  editar o arquivo também é aplicado ao vivo.
- **Alternatives considered**: campo `string` "Nome=endereço; Nome2=endereço2" (cabe no schema,
  mas é frágil com nomes contendo `=`/`;`); arquivo de configuração próprio (viola o Princípio I).

- **Achados na implementação (2026-09-29)**: o `omarchy bar set --json` não grava listas
  (o parser do `quickshell ipc call` divide o argumento), e o QML entrega listas do `shell.json`
  como sequências do Qt, não como `Array`. O `readSettings` aceita as três formas
  ([contracts/settings.md](./contracts/settings.md#como-o-usuário-cadastra-documentado-no-readme)).
  Além disso, o hot reload do shell não recarrega de forma confiável o `BarWidget.qml`/`Model.js`
  de um plugin de terceiros, então é preciso rodar `omarchy-restart-shell` depois de cada mudança
  durante o desenvolvimento. Um terceiro bug: widgets recriados na reconexão de um monitor
  recebem as configurações da última montagem completa da barra, não as atualizadas ao vivo
  (detalhes em [hardware-test.md](./hardware-test.md), item 10).

## R6. Normalização de endereço

- **Decision**: função pura `normalizeAddress`: aceita `host`, `host:porta`, `http://host[:porta]`
  e `https://…`; sem esquema → `http://`; sem porta → a porta padrão do esquema (Moonraker atrás de
  nginx atende em 80); remove `/` final. Espaços, esquema diferente de http/https ou host vazio →
  inválido, e a impressora é exibida como offline com motivo "endereço inválido".
- **Rationale**: é como o usuário normalmente digita o endereço do Mainsail/Fluidd.

## R7. Ícone na barra com indicador de progresso

- **Decision**: `BarIconButton` (qs.Ui) com `iconComponent` próprio: o glifo de impressora 3D da
  fonte do bar e, abaixo dele, uma barra fina de progresso (trilho + preenchimento) desenhada com
  `Rectangle`s dentro do `Style.bar.iconCanvas`. Cores: preenchimento em `bar.barForeground`,
  trilho em `Util.alpha(barForeground, …)`. "Pausada" usa o preenchimento com opacidade reduzida,
  distinguível de "imprimindo". Erro: glifo e barra em `urgent`. Offline: `dimmed`. Ociosa ou sem
  impressoras: só o glifo. Tooltip de uma linha via `tooltipText`.
- **Rationale**: é o mesmo mecanismo do ícone do Tailscale (`iconComponent` com selo em
  `urgent`, tailscale/Panel.qml:380-401) e do `BarIconButton` de todos os painéis nativos.
  Tudo vem de tokens e da fonte do bar (Princípio VIII), e as dimensões vêm de
  `Style.bar.*`/`Style.space()`.
- **Alternatives considered**: anel de progresso com `Canvas`/`Shape` (mais trabalho e
  renderização custosa para um glifo de 16 px); texto de porcentagem (rejeitado pelo usuário:
  "apenas o ícone").

## R8. Painel ao clicar (padrão do painel de Wi-Fi)

- **Decision**: seguir o padrão do guia oficial para widget com painel. O `BarWidget.qml` contém
  o `BarIconButton`, carrega `Panel.qml` num `Loader`, repassa `opened`, `open()`, `close()`,
  `toggle()`, `closeForPopoutSwitch()` e `popoutSwitchClosing`, e injeta `bar`, `settings`,
  `anchorItem` e `hostWidget`. O `Panel.qml` é um `Panel` (qs.Ui) com `manageIpc: false`, contendo
  `KeyboardPanel` (ancorado no botão) → `PanelKeyCatcher` (Escape, j/k/setas, Enter, Tab entre
  painéis) → `Flickable` → `Column`, com:
  1. `PanelHero`: glifo, nome da impressora selecionada, estado e progresso (`meta`), motivo em
     erro/offline (`detail`);
  2. seção de impressão (só em imprimindo/pausada): barra de progresso com porcentagem, arquivo,
     tempo restante;
  3. seção de temperaturas: bico e mesa, atual/alvo;
  4. linha "atualizado há …" / "sem resposta há …";
  5. `PanelSectionHeader` "Impressoras" + lista de linhas (nome, estado, %) quando houver mais de
     uma; clique ou cursor + Enter seleciona;
  6. estado vazio: "nenhuma impressora configurada" + o comando de cadastro.
  Largura via `panel.fittedContentWidth(Style.space(360))`, como os painéis nativos.
- **Rationale**: é exatamente a forma do painel de Wi-Fi/Tailscale (BarIconButton + KeyboardPanel
  + PanelHero + PanelSectionHeader + lista com cursor), o que dá o visual e o comportamento
  nativos (Princípios I e VIII). O `Panel.qml` atual (cópia acidental do `BarWidget.qml` do
  relógio) é **reescrito**, e o `IpcHandler` `omarchy.clock` herdado é removido.
- **Estado compartilhado**: o `BarWidget.qml` é o dono do polling e do estado. O painel recebe o
  `hostWidget` e lê o modelo pronto (`Model.buildPanelModel`), sem fazer requisições próprias.
- **Seleção**: `selectedKey` fica no `BarWidget` (sobrevive a abrir e fechar o painel, e se perde
  ao reiniciar o shell). Vazio → `pickHighlighted`. A chave deixa de existir → volta a vazio
  (`Model.resolveSelection`).
- **Seletor (revisão de 2026-09-29)**: a lista de impressoras virou o `Dropdown` de `qs.Ui`,
  com `PanelKeyCatcher.blocked` ligado a `popupOpen` para o menu assumir o teclado enquanto está
  aberto, como o componente documenta.
- **Ações**: nenhum botão nesta fatia (FR-021). O layout deixa o fim do painel livre para a linha
  de ações da fatia 002 (pausar/retomar, cancelar, parada de emergência, abrir interface web).
- **Checklist do Princípio VI**: com painel real, clique, Escape e summon/hide passam a ser
  verificados integralmente (`omarchy-shell shell summon/hide io.github.brunorzm.omaklippy`
  alcança o painel pelo contrato `opened/open/close` do widget).
- **IPC próprio**: target `io.github.brunorzm.omaklippy` só com `refresh()`. Abrir e fechar fica com
  o `summon`/`hide` do shell, que escolhe a instância; um `open()` com `broadcast` abriria o
  painel em todos os monitores.

## R9. Testes da lógica pura

- **Decision**: `Model.js` sem `.pragma library`, com o rodapé
  `if (typeof module !== "undefined") module.exports = {...}` (convenção de 26 modelos
  first-party), testado com `node --test tests/` (Node 26 disponível via mise). Fixtures JSON
  com respostas reais capturadas de uma impressora ficam em `tests/fixtures/`.
- **Rationale**: atende ao Princípio V sem dependências npm. Os testes ficam dentro da pasta do
  plugin (Princípio III).

## R10. Várias instâncias e vários monitores

- **Finding**: o shell cria uma instância do widget por barra (uma por monitor), e
  `allowMultiple: true` permite várias entradas. Cada instância faz a própria consulta.
- **Decision**: aceitar nesta fatia. Com 2 monitores e 5 impressoras são 10 requisições leves a
  cada 5 s, com no máximo uma requisição em voo por impressora por instância. Compartilhar o
  estado via um `service` (kind separado) fica registrado como otimização futura.

## R11. Estado do repositório encontrado

- `BarWidget.qml` importa `Model.js`, que não existe: o plugin não carrega hoje.
- `Panel.qml` é idêntico ao `BarWidget.qml` e seria carregado por ele mesmo (ver R8).
- `manifest.json` tem "Pinter" na descrição e não tem `defaults`/`schema`.
- Esses três arquivos são reescritos nesta fatia.
