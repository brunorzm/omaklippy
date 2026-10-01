# Research: Cadastrar impressoras pelo painel, com descoberta na rede

Decisões técnicas da fatia 009. As decisões de escopo da spec (descoberta por anúncio + verificação
a pedido; adicionar e remover) foram tomadas pelo usuário antes da spec.

## R1. Gravar a lista de impressoras (FR-004, FR-006, FR-007)

> **Substituída em 2026-10-01 (pós-submissão ao marketplace, ver
> [011 hardware-test](../011-moonraker-api-key/hardware-test.md#correção-pós-submissão-a-gravação-sem-linha-de-comando)):**
> a gravação passou a usar `bar.shell.updateEntryInline` dentro do processo do shell. O caminho
> abaixo pelo `omarchy-shell` punha a lista inteira — com as chaves de API da 011 — na linha de
> comando de um processo filho, visível a outros usuários.

- **Decision**: o widget roda, como processo, `omarchy-shell shell setBarWidget
  io.github.brunorzm.omaklippy printers "<espaço><JSON da lista>" "{}"`. O shell grava a entrada do
  widget no `shell.json` dele (`PluginRegistry.setBarWidget` → `shellConfigMutator`), avisa os
  widgets (`pluginsChanged`) e a lista nova chega a todas as barras pelas `settings`, sem
  reiniciar. Resposta em stdout: `ok`, ou o motivo (o `omarchy-shell` sai com 0 também em erro de
  IPC, então a decisão é pelo texto). Guarda de 5 s (o `omarchy-shell` já limita a IPC a 2 s).
- **O espaço na frente do JSON**: o `qs ipc call` (Quickshell 0.3.1) trata um argumento que começa
  com `[` como lista e o separa em vários argumentos ("Too many arguments provided (4 required but
  5 were provided.)", testado em 2026-10-01 com a lista atual); com um espaço na frente ele passa
  como texto e o `JSON.parse` do shell ignora o espaço. Testado: `ok`, `shell.json` igual ao de
  antes (mesma lista regravada), com o nome "Biqu B1" (espaço dentro) preservado. É o mesmo
  problema que a nota da fatia 001 registrou no `setupCommand`.
- **Rationale**: é o caminho que o próprio Omarchy usa (`omarchy bar set` chama esse método); o
  plugin não escreve arquivo nenhum (Princípio III) e a configuração continua inline na entrada do
  widget (Princípio I). O `PluginBarApi` (a interface do shell para widgets de terceiros) não tem
  método para gravar configurações; acessar o registro do shell por dentro seria interface não
  pública.
- **Seletor `{}`**: o shell grava a primeira entrada do OmaKlippy na barra. Com o widget mais de uma
  vez na mesma barra (`bar.moduleWidgets(id).length > 1`), não há como saber qual entrada é a deste
  painel; nesse caso adicionar e remover ficam indisponíveis com um aviso (raro; ver nota na spec).
- **A lista gravada** é a lista crua das `settings` (não a normalizada), para preservar `webUrl`,
  nomes e qualquer campo extra das outras impressoras (SC-003). Se `printers` estava como texto
  (o caminho do `setupCommand` da 001 grava assim), é lida como lista e gravada de volta como lista.
- **Alternatives considered**: `omarchy bar set ... --json` (mesmo problema de separação, e mais um
  processo); escrever o `shell.json` direto (proibido pelo Princípio III e brigaria com o shell, que
  também escreve nele).

## R2. Redes locais (FR-002, edge case "várias redes")

- **Decision**: `ip -j -4 addr show` (iproute2). `parseLocalNets` mantém endereços com
  `scope: global`, prefixo de 16 a 30, em interfaces que não são de VPN, contêiner ou ponte
  (`lo`, `tailscale*`, `wg*`, `tun*`, `tap*`, `docker*`, `br-*`, `veth*`, `virbr*`, `zt*`), e para
  cada um a /24 que contém o endereço (no máximo 254 hosts por rede, sem o próprio computador).
- **Neste computador**: `wlp7s0 192.168.0.21/24` (usada); `tailscale0 100.83.79.15/32` e `lo`
  (ignoradas).
- **Rationale**: o `ip -j` dá JSON estável; ler `/proc/net` exigiria interpretar formatos antigos.
  Uma rede maior que /24 continua coberta só na vizinhança do computador (spec: fora de escopo).

## R3. Verificação dos endereços (FR-002, SC-002)

- **Decision**: um único `curl -s --parallel --parallel-max 64 --connect-timeout 1 --max-time 2
  -w "%{url} %{http_code}\n"` com `-o /dev/null http://<ip>:7125/server/info` para cada endereço.
  Um endereço é candidato com HTTP 200. Guarda de 20 s.
- **Medido em 2026-10-01** na rede do usuário: 254 endereços em 4,0 s; 200 em 192.168.0.100
  (Biqu) e 192.168.0.110 (Voron), `000` nos outros 252. Pior caso teórico: 254/64 × 2 s ≈ 8 s.
- **Rationale**: um processo em vez de 254 (Princípio II: o shell só vê um `Process`); só GET de
  leitura num endpoint de informação do Moonraker, só quando o usuário pede (decisão da spec).
- **Alternatives considered**: um processo por endereço (254 processos); `nmap` (dependência nova e
  mais agressiva).

## R4. Anúncio de Moonraker (FR-002, FR-011)

- **Decision**: `avahi-browse -rtp _moonraker._tcp` (termina depois do cache, resolve, saída
  parseável), guarda de 6 s, em paralelo com a verificação. Linhas `=` dão
  `;iface;IPv4;<nome>;_moonraker._tcp;local;<host.local>;<ip>;<porta>;<txt>`; só IPv4.
  Sem `avahi-browse` (processo não inicia) → `mdnsUnavailable = true`: a busca segue só com a
  verificação e o painel avisa.
- **Medido**: nenhuma das impressoras anuncia (`[zeroconf]` ausente nos dois `moonraker.conf`); o
  formato foi conferido com outro serviço da rede (`_spotify-connect._tcp`). Fixture sintética.

## R5. Nome e endereço de cada impressora achada (FR-003, edge case "mesma impressora")

- **Decision**: para cada IP candidato (verificação ou anúncio), em paralelo:
  - `avahi-resolve -a <ip>` → nome na rede (`voron.local`), guarda de 3 s;
  - `GET http://<ip>:7125/printer/info` → `result.hostname` (`voron`), guarda de 3 s (falha com o
    Klipper desconectado; aí o nome cai para o da rede).
  - Endereço preferido: nome na rede, senão o do anúncio, senão o IP. Nome: `hostname`, senão o nome
    do anúncio, senão o nome na rede sem `.local`, senão o IP. Porta 7125 omitida (padrão).
  - Junta por IP (a mesma impressora pelo anúncio e pela verificação vira uma).
- **Já cadastrada**: compara o host do endereço preferido e o IP com o host de cada impressora da
  configuração (`hostOf(baseUrl)`, sem diferenciar maiúsculas); qualquer igualdade marca.
- **Medido**: `avahi-resolve -a 192.168.0.100` → `biqu.local`; `.110` → `voron.local`;
  `/printer/info` → `biqu` / `voron`.

## R6. Adicionar pelo endereço (US2, FR-005)

- **Decision**: o endereço digitado passa por `normalizeAddress` (001); inválido → motivo e nada
  mais. Válido → `GET <baseUrl>/server/info` (consulta normal, `timeoutSec`): 200 com JSON de
  Moonraker → adiciona; senão o painel mostra o motivo (mesmos textos da consulta, 001) e um botão
  "Add anyway". Nome vazio → `GET /printer/info` `hostname`, senão o host do endereço. Duplicado
  (mesmo host e porta que uma cadastrada) → aviso, sem gravar.
- **Formulário**: dois `TextField` do `qs.Ui` (Address, Name), no padrão do painel de rede do
  Omarchy (`plugins/panels/network/Panel.qml`): foco no campo ao aparecer, Enter avança/confirma,
  Escape cancela e devolve o foco ao `PanelKeyCatcher`. Enquanto um campo tem o foco, as teclas não
  chegam ao `PanelKeyCatcher` (FR-010).

## R7. Painel (FR-009, FR-010, FR-012)

- **Decision**: uma tela de cadastro dentro do mesmo painel (`view: "main" | "setup"`), aberta por
  um botão "Printers…" no fim da área de ações (e direto no painel vazio, no lugar do comando para
  copiar). A tela tem: "Search network" (com andamento e Cancel), a lista de resultados (cada um com
  "Add" ou "Added"), "Add by address" (o formulário), "Remove <nome>" para a impressora selecionada
  (com `ConfirmDialog`, "Back" selecionado) e "Back" para voltar. Tudo com `Button` e tokens do
  `qs.Ui`/`qs.Commons`.
- **Depois de adicionar**: o painel volta à tela principal com a impressora nova selecionada
  (chave `baseUrl#order` da 001, conhecida antes de gravar); a seleção é aplicada quando a lista nova
  chega pelas `settings`.
- **Rationale**: o painel principal continua igual para quem já tem impressoras; o cadastro fica a
  um clique. O `setupCommand` da 001 deixa de aparecer (FR-009); a função sai do `Model.js` e o teste
  dela é removido de propósito.

## R8. Ciclo da busca e processos

- **Decision**: máquina de estados pura em `Model.js` (`Discovery`): `startDiscovery` pede `ip` e
  `avahi-browse`; `acceptNets` pede a verificação; `acceptScan`/`acceptMdns` registram candidatos e
  pedem nome e endereço de cada um; quando não há mais pedidos pendentes, `done` com a lista final.
  Cada pedido leva `seq` da busca; resultado de busca antiga ou cancelada é ignorado. Cancelar
  (botão, Escape ou fechar o painel) para os processos da busca. Guarda geral de 30 s.
- **Rationale**: mesmo padrão das consultas, metadados e comandos (Princípios II e V).

## R9. Binários externos (Princípio III)

| Binário | Pacote | Obrigatório | Uso | Ausente |
|---------|--------|-------------|-----|---------|
| `omarchy-shell` | omarchy | sim, para adicionar/remover | grava a lista (R1) | adicionar/remover falham com o motivo |
| `ip` | iproute2 | sim, para a verificação | redes locais (R2) | a busca usa só o anúncio e avisa |
| `avahi-browse`, `avahi-resolve` | avahi | não | anúncio e nome na rede (R4, R5) | busca só por verificação; endereço fica o IP; aviso |
| `curl` | curl | sim (já era) | verificação, `/printer/info`, `/server/info` | como na 001 |
