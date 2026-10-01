# Teste em hardware: Cadastrar impressoras pelo painel, com descoberta na rede

Roteiro: [quickstart §2, §3 e §5](./quickstart.md). O usuário clicou e digitou; o assistente
preparou observadores (processos da busca a cada 0,5 s, prints, cada gravação do `shell.json`) e
conferiu. Nas impressoras, só `GET` (os da própria busca e as duas fixtures). `shell.json` com
backup antes da primeira gravação, comparado no fim.

```text
Data:        2026-10-01
Versões:     omarchy 4.0.4-1, quickshell 0.3.1-1, curl 8.22.0-1, avahi 0.9rc5-1, iproute2 7.2.0-1
Impressoras: Voron (voron.local, 192.168.0.110) e Biqu B1 (biqu.local, 192.168.0.100); nenhuma
             anuncia _moonraker._tcp ([zeroconf] ausente), então só a verificação as acha
Rede:        wlp7s0 192.168.0.21/24 (verificada); tailscale0 e lo ignoradas
Monitores:   dois (eDP-1 e DP-3), uma barra por monitor, o widget uma vez em cada
```

## Busca (US1, quickstart §2)

Processos observados durante uma busca (segundos desde a abertura do painel):

```text
 4.1 avahi-browse -rtp _moonraker._tcp           ← Search network
 4.7 curl -s --parallel --parallel-max 64 …      ← verificação da /24 (253 endereços)
 8.2 avahi-resolve -a 192.168.0.100 | … .110     ← nomes na rede
 8.9 avahi-resolve -a 192.168.0.110
     (o ip -j e o /printer/info terminam entre duas amostras)
```

- Busca completa em **~5 s** (verificação ~3,5 s); resultado: `biqu` (`biqu.local`) e `voron`
  (`voron.local`), as duas **Added**. Nomes do `/printer/info`, endereços do `avahi-resolve`.
- **Cancel**, **Escape** com a busca rodando (cancelou sem fechar o painel) e **clique fora** no
  meio da busca: o `curl` e o `avahi-browse` sumiram em menos de 1 s; nada sobrando 5 s depois.

## Gravações (US1–US3, quickstart §3)

Entrada do OmaKlippy no `shell.json` a cada gravação:

```text
antes  {"printers": [{"name": "Voron", "address": "voron.local"}, {"name": "Biqu B1", "address": "biqu.local"}]}
11:50  {"printers": [{"address": "voron.local", "name": "Voron"}]}                         ← Remove Biqu B1 (Back antes: nada)
11:51  {"printers": [{"address": "voron.local", "name": "Voron"}, {"name": "biqu", "address": "biqu.local:7125"}]}   ← Add da busca
11:55  {"printers": [{"address": "voron.local", "name": "Voron"}]}                         ← Remove biqu
11:55  {"printers": [{"address": "voron.local", "name": "Voron"}, {"name": "Biqu B1", "address": "biqu.local"}]}     ← Add by address
depois idêntica ao backup (inclusive a ordem das chaves); o resto do shell.json idêntico
```

- **Toda gravação chegou ao widget ao vivo**, sem reiniciar o shell (o problema da 001 com o
  `omarchy bar set` repetido não aparece por `setBarWidget` direto). A lista nova chega pelas
  `settings` **antes** da resposta `ok` do `omarchy-shell`.
- A Biqu achada pela busca foi gravada como `biqu.local:7125` e respondeu normalmente (IDLE).
- Add by address: `biqu.local` já cadastrada → "biqu.local is already in the list"; `a b` →
  "invalid address"; `192.168.0.99` → "Checking…", depois o motivo e **Add anyway** (Back sem
  gravar); `biqu.local` + "Biqu B1" → gravada, painel de volta à tela principal com ela selecionada.
- Teclado nos campos: Enter no Address passa ao Name, Enter no Name adiciona, Escape no campo só
  devolve o foco ao painel.
- `omarchy-restart-shell` depois das gravações: `shell.json` igual ao backup (SC-004).

## Bugs achados e corrigidos durante o teste

1. "OmaKlippy is on this bar more than once" com o widget uma vez por barra: `bar.moduleWidgets()`
   lista uma instância por monitor. Agora conta só as da mesma janela de barra.
2. Depois de adicionar pela busca, o painel não voltava à tela principal: a seleção pendente era
   aplicada (e zerada) quando a lista chegava, antes da resposta; o sinal saía com chave vazia.
3. `biqu.local` digitado era aceito com `biqu.local:7125` já cadastrada (duplicata por host:porta).
   Agora duplicata é o mesmo host, como o "Added" da busca.

## Ciclo de vida

Clique e Escape (fora e dentro dos campos de texto) pelo usuário; `summon` (`ok`, painel aberto nos
dois monitores) e `hide` (painel fechado); `disable` apagou a entrada do `shell.json`, sem `curl`,
`avahi-browse` ou `avahi-resolve` sobrando; `enable` recriou a entrada sem as impressoras
(`{"id": "io.github.brunorzm.omaklippy"}`), restauradas copiando o backup (arquivo idêntico); shell
reiniciado sem erros no log e sem processos sobrando, `shell.json` ainda idêntico ao backup.
`remove`/reinstalar: pendente, depois do push.
