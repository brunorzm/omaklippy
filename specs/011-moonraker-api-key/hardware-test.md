# Teste em hardware: Chave de API do Moonraker por impressora

Roteiro: [quickstart](./quickstart.md). As duas impressoras do usuário confiam neste computador, então
o caminho com chave foi testado contra servidores falsos no scratchpad que exigem a chave, e as
impressoras reais serviram para conferir que nada mudou sem chave. O assistente não leu a chave de
nenhuma impressora; as chaves dos testes são de exemplo.

```text
Data:        2026-10-01
Versões:     omarchy 4.0.4-1, quickshell 0.3.1-1, qt6-websockets 6.11.2-1, curl 8.22.0
Impressoras: Voron (Moonraker v0.11.0-1-g1cfb0c4), Biqu B1 (Moonraker v0.10.0-31-gd5ee171), sem chave
Falsos:      HTTP em Python (127.0.0.1:7198) que exige X-Api-Key; WebSocketServer do qml
             (127.0.0.1:7197) que exige server.connection.identify com api_key antes da inscrição
```

## Chave na configuração (US1, T009)

`shell.json` só com a impressora falsa (backup antes, restaurado idêntico depois):

| Cenário | No servidor falso | No painel |
|---------|-------------------|-----------|
| HTTP sem chave | pedidos sem `X-Api-Key` (401) | `unauthorized — allow this computer in trusted_clients or set an API key` |
| HTTP com a chave certa | pedidos com a chave certa (200) | `IDLE`, temperaturas |
| HTTP com chave errada | pedidos com a chave errada (401) | `API key rejected` |
| WebSocket com a chave certa | `identify` aceito, **depois** a inscrição | `IDLE`, pela conexão |
| WebSocket com chave errada | `identify` recusado, nenhuma inscrição | (consulta periódica) |

## A chave não vaza (US2, T012)

Varredura das linhas de comando do processo do shell e dos que ele cria (`/proc/<pid>/cmdline`, a
cada 50 ms), com o servidor falso segurando cada resposta 1 s para os `curl` durarem: **7 processos
`curl` do shell vistos levando a chave, 0 ocorrências da chave** em qualquer linha de comando. (Uma
primeira varredura de todos os processos achou a chave nos processos do próprio roteiro de teste, que
a recebiam por argumento; corrigido no roteiro: chave por ambiente/arquivo e varredura só do shell.)

Testes puros: nenhum `args` de nenhum pedido, nem o modelo do painel, do ícone, das ações, das
confirmações, do tooltip e das notificações, contém a chave (só `…cdef`).

## Pelo painel (US3, T016)

O usuário, com a impressora falsa HTTP em `127.0.0.1:7198` (chave de teste `omaklippy-test`) e as
duas reais na lista; sequência no log do servidor falso:

```text
17:13:51  /server/info sem chave            ← Add by address: "127.0.0.1:7198 needs an API key"
17:14:24  /server/info com a chave certa    ← Check again; adicionada, painel na principal, idle
17:15:13  consultas com a chave errada      ← Set API key "wrong-key": "API key rejected"
          consultas com a chave certa       ← Set API key de novo
          consultas sem chave               ← Remove API key (Back antes, depois Remove)
17:16:27  últimas consultas                 ← Remove KeyHttp
```

Depois: `shell.json` com Voron e Biqu B1 como antes (só a ordem das chaves `address`/`name` mudou,
reescrita pelo shell, como na 009); nenhum erro no log.

## Sem regressão (T020)

Depois do reinício do shell, com dois monitores: 4 conexões contínuas (2 barras × 2 impressoras), 0
consultas de status em 20 s, como na 010. O teste com chave numa impressora real (tirar o computador
dos `trusted_clients`) ficou opcional e não foi feito.

## Ciclo de vida

Clique pelo usuário em todo o teste da US3; Escape dentro do campo da chave devolveu o foco ao painel
sem fechá-lo, e fora do campo fechou o painel. `summon` (`ok`, painel nos dois monitores) e `hide`;
`disable`: entrada fora do `shell.json`, conexões de 4 para **0**, nenhum `curl` sobrando; `enable`:
entrada sem impressoras, nenhuma conexão; `shell.json` restaurado do backup (idêntico): 4 conexões de
volta sem reiniciar; `omarchy-restart-shell`: 4 conexões, nenhum erro no log.

Remover (2026-10-01, depois do push de `3be11ac`, com cópia da pasta no scratchpad): `omarchy plugin
remove --yes` (rodado pelo usuário) apagou a pasta e a entrada no `shell.json`; 0 conexões e nenhum
`curl` sobrando. Reinstalado do GitHub (`3be11ac`, conteúdo igual ao da cópia), `.specify/feature.json`
restaurado, `shell.json` restaurado do backup, shell reiniciado: 4 conexões (dois monitores), nenhum
erro no log.

## Correção pós-submissão: a gravação sem linha de comando

Achado da revisão do marketplace do Omarchy (2026-10-01, em `7a9b276`): a gravação das impressoras
(fatia 009) rodava `omarchy-shell shell setBarWidget … printers " <json>"`, com a lista inteira —
e, desde a 011, as chaves de API de todas as impressoras — na linha de comando de um processo filho,
visível a outros usuários do computador. A varredura da T012 só olhava os processos `curl` e não
pegou esse caso.

Correção (0.11.1): a gravação usa `bar.shell.updateEntryInline(moduleName, entry)`, a fachada de
configuração que o shell dá a plugins de terceiros (a mesma que o relógio nativo usa), dentro do
processo do shell; nenhum processo filho. `entry` é a entrada inteira do widget com a lista nova
(`buildSaveEntry`: o shell substitui a entrada, então as outras configurações vão junto); uma
gravação sem mudança não chama o shell (`entryChanged`), porque a resposta `false` dele não separa
"nada mudou" de "recusado". O caminho antigo (`buildSaveArgs`, `parseSaveResult`, o processo
`omarchy-shell`, as fixtures `set-widget-*`) foi removido, sem ficar como alternativa. Diferença de
comportamento: o shell regrava todas as entradas do widget com esse id, não só a primeira; o aviso
"OmaKlippy is on this bar more than once" continua impedindo a edição nesse caso.

Conferido ao vivo: observador de todos os processos filhos do shell a cada 10 ms, procurando
`omarchy-shell`, `setBarWidget` e a chave de teste; o usuário pôs `omaklippy-test-key` na Voron pelo
painel (Set API key) e tirou (Remove API key):

```text
18:49:07  shell.json: Voron com "apiKey": "omaklippy-test-key"   (gravado pelo shell)
18:49:18  shell.json: Voron sem apiKey
          nenhum processo filho do shell com omarchy-shell, setBarWidget ou a chave
          shell.json inteiro com o mesmo conteúdo de antes; nenhum erro no log
```

Testes puros: `buildSaveArgs`/`parseSaveResult` não existem mais; `buildSaveEntry` preserva as outras
configurações e não leva `id`; `entryChanged`; nenhum argv construído pelo modelo para uma impressora
com chave (consultas, estimativa, comando, navegador, notificação) contém a chave.

Remover e reinstalar (depois do push de `bb23864`, com cópia da pasta no scratchpad): `omarchy plugin
remove --yes` (rodado pelo usuário) apagou a pasta e a entrada no `shell.json`; 0 conexões e nenhum
`curl` sobrando. Reinstalado do GitHub (`bb23864`): a instalação limpa trouxe só os arquivos do
plugin e a constituição, sem `.claude/` nem o resto do `.specify/` (o ferramental de desenvolvimento
não vai para quem instala); essas pastas foram restauradas da cópia (pasta idêntica a ela),
`shell.json` restaurado do backup, shell reiniciado: 4 conexões (dois monitores), nenhum erro no log.
