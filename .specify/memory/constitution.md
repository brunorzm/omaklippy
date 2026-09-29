# Constituição do OmaKlippy

OmaKlippy (`io.github.brunorzm.omaklippy`) é um plugin do Omarchy Quattro que monitora e controla
impressoras 3D com firmware Klipper por meio da API do Moonraker na rede local.

## Core Principles

### I. Conformidade com o runtime do Omarchy Quattro

- O plugin roda dentro do processo `omarchy-shell` (Quickshell) e MUST seguir o guia oficial
  (https://plugins.omarchy.org/develop.html) e a referência do shell
  (https://github.com/omacom/omarchy/blob/quattro/shell/README.md).
- O plugin MUST NOT iniciar um segundo processo Quickshell, daemon próprio ou serviço systemd.
- O `manifest.json` MUST ficar na raiz da pasta do plugin e declarar `kinds` e `entryPoints`
  válidos segundo o guia.
- O ID `io.github.brunorzm.omaklippy` é definitivo e MUST ser idêntico no `manifest.json`, no nome
  da pasta e no `moduleName` de todos os arquivos QML. O prefixo `omarchy.*` MUST NOT ser usado.
- A pasta do plugin MUST NOT conter symlinks.
- Configurações do usuário MUST ficar inline na entrada do widget em `shell.json`; o plugin não
  mantém arquivo de configuração próprio.

**Justificativa**: o plugin é carregado pelo shell do desktop; qualquer desvio do contrato do
runtime quebra carregamento, validação ou isolamento entre plugins.

### II. O shell nunca bloqueia

- Plugins compartilham o processo do desktop. Toda operação de rede, de processo externo ou de
  espera MUST ser assíncrona e MUST ter timeout explícito.
- Chamadas síncronas (XHR síncrono, laços de espera, leitura bloqueante de processo) são
  proibidas.

**Justificativa**: um travamento no plugin congela barra, painéis e todo o desktop; uma
impressora desligada ou lenta não pode afetar o usuário.

### III. Segurança por mínimo privilégio

- O plugin roda sem sandbox; por isso MUST NOT usar `sudo`, MUST NOT executar scripts de
  instalação e MUST invocar apenas binários externos listados e justificados no README.
- O plugin MUST NOT criar arquivos fora da própria pasta.

**Justificativa**: código sem sandbox no processo do desktop tem os mesmos privilégios do
usuário; a superfície de ataque e de efeitos colaterais deve ser mínima e auditável.

### IV. Degradação graciosa

- A ausência de uma dependência opcional (por exemplo avahi, libnotify, QtWebSockets) MUST
  desativar apenas o recurso correspondente e MUST exibir um aviso visível ao usuário.
- O restante do plugin MUST continuar funcional; nenhuma dependência opcional pode impedir o
  carregamento do widget.
- Falhas de rede ou impressora inacessível MUST resultar em estado explícito na interface, nunca
  em erro silencioso ou widget quebrado.

**Justificativa**: instalações do Omarchy variam; o usuário precisa saber o que está faltando
sem perder o que funciona.

### V. Lógica testável separada da interface

- Parse de respostas do Moonraker, cálculo de estados e formatação MUST ficar em funções
  JavaScript puras, sem dependência de objetos do Quickshell, testáveis fora do shell.
- Arquivos QML MUST cuidar apenas de interface e ciclo de vida (bindings, timers, conexões,
  chamadas às funções puras).
- Toda função pura nova ou alterada MUST ter teste automatizado executável sem o shell.

**Justificativa**: o shell não é um ambiente de teste prático; lógica pura permite verificar
comportamento rapidamente e com dados reais capturados da API.

### VI. Validação obrigatória

- Toda tarefa MUST terminar com `omarchy plugin validate` e
  `qmllint -I "$OMARCHY_PATH/shell"` sem erros.
- Toda fatia MUST terminar com o checklist de ciclo de vida do guia: clique, Escape, summon e
  hide pelo shell, desabilitar, reabilitar, reiniciar o shell e remover.

**Justificativa**: validação estática pega erros de contrato cedo; o checklist de ciclo de vida
pega vazamentos de recursos e estados inconsistentes que só aparecem em uso real.

### VII. Testado em hardware real

- Nenhuma fatia é considerada concluída sem teste com uma impressora Klipper real acessível
  via Moonraker na rede local.
- O resultado do teste (modelo/versão do Klipper e Moonraker, cenários exercitados) MUST ser
  registrado na fatia.

**Justificativa**: respostas reais do Moonraker variam por versão e configuração; mocks não
substituem a validação contra o equipamento.

### VIII. Visual nativo

- A interface MUST usar componentes e tokens de `qs.Ui` e `qs.Commons`.
- Cores, fontes, tamanhos de fonte e espaçamentos fixos no código MUST NOT ser usados; valores
  visuais vêm dos tokens do shell.

**Justificativa**: o plugin deve acompanhar temas e preferências do Omarchy sem ajustes manuais.

## Restrições Técnicas

- **Runtime**: Quickshell dentro do `omarchy-shell` (Omarchy Quattro); QML + JavaScript.
- **Integração**: API HTTP do Moonraker (e WebSocket quando QtWebSockets estiver disponível,
  conforme Princípio IV), restrita à rede local.
- **Identidade**: `io.github.brunorzm.omaklippy` (Princípio I).
- **Dependências externas**: somente as documentadas no README, cada uma marcada como
  obrigatória ou opcional e com o recurso que desativa quando ausente.

## Fluxo de Desenvolvimento e Critérios de Conclusão

- O trabalho é organizado em fatias verticais (spec → plan → tasks → implement) via Spec Kit.
- Cada plano MUST incluir um "Constitution Check" verificando os Princípios I–VIII; violações
  exigem justificativa registrada na seção de complexidade do plano.
- Critérios de conclusão de uma tarefa: gates do Princípio VI (validate + qmllint) sem erros e
  testes das funções puras passando.
- Critérios de conclusão de uma fatia: todos os critérios de tarefa, checklist de ciclo de vida
  completo (Princípio VI) e teste em hardware real registrado (Princípio VII).

## Governance

- Esta constituição prevalece sobre specs, planos, tarefas e qualquer outra prática do projeto.
  Em caso de conflito, a constituição vence e o artefato conflitante deve ser corrigido.
- Alterações MUST registrar o motivo da mudança e incrementar a versão segundo versionamento
  semântico:
  - MAJOR: remoção ou redefinição incompatível de princípio ou regra de governança.
  - MINOR: princípio ou seção nova, ou ampliação material de orientação.
  - PATCH: esclarecimentos, redação e correções sem mudança semântica.
- Toda revisão de spec, plano e implementação MUST verificar conformidade com esta constituição.

**Version**: 1.0.0 | **Ratified**: 2026-09-29 | **Last Amended**: 2026-09-29
