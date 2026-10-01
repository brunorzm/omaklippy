# Contract: `Model.js` (fatia 009)

Mesmas regras das fatias anteriores: funções puras, nunca lançam, mesmo objeto quando nada muda,
textos em `TEXT` (inglês). Tipos em [../data-model.md](../data-model.md); comandos em
[commands.md](./commands.md).

## Textos novos (`TEXT.setup`)

```text
printers: "Printers…"             search: "Search network"         searching: "Searching… %1 found"
cancel: "Cancel"                  back: "Back"                     add: "Add"            added: "Added"
nothingFound: "No printers found on the network."
addByAddress: "Add by address"    address: "Address"               name: "Name (optional)"
addressHint: "voron.local or 192.168.1.50"                         checking: "Checking %1…"
addAnyway: "Add anyway"           alreadyAdded: "%1 is already in the list"
noMoonraker: "No printer answers at %1: %2"
remove: "Remove %1"               removeMessage: "Remove %1 from the list? You can add it again later."
removeConfirm: "Remove"
mdnsUnavailable: "Network announcements unavailable (avahi not found): searched by address only."
scanUnavailable: "Could not read the local networks (ip not found): searched by announcements only."
notEditable: "OmaKlippy is on this bar more than once: edit the printers in shell.json."
saveFailed: "Could not save the printers: %1"
shellNoAnswer: "no answer from the shell"
```

## Redes, anúncio, verificação, nomes

| Função | Contrato |
|--------|----------|
| `buildNetsArgs()` | `["ip","-j","-4","addr","show"]` |
| `parseLocalNets(stdout, exitCode)` | lista de LocalNet; saída inválida ou exit ≠ 0 → `[]`. Caso: fixture → só `wlp7s0` `192.168.1.` com `self` `192.168.1.21` |
| `buildMdnsArgs()` | `["avahi-browse","-rtp","_moonraker._tcp"]` |
| `parseMdns(stdout)` | lista `{ name, host, ip, port }` das linhas `=` IPv4; desfaz `\DDD`; IPv6 e outras linhas ignoradas |
| `buildScanArgs(nets)` | o `curl` de commands.md, sem o `self` de cada rede; sem redes → `[]` |
| `parseScan(stdout)` | IPs com `200`, sem repetir |
| `buildReverseArgs(ip)` / `parseReverse(stdout, exitCode)` | `["avahi-resolve","-a",ip]` / `"voron.local"` ou `""` |
| `buildHostnameArgs(baseUrl, timeoutSec)` / `parseHostname(stdout, exitCode)` | consulta normal de `/printer/info` / `result.hostname` ou `""` |
| `parseMoonrakerCheck(stdout, exitCode)` | `{ ok, message }`: `ok` com 200 e `result` com `klippy_state` ou `moonraker_version`; senão o motivo da consulta (001: offline, unauthorized…) ou "not a Moonraker answer" |

## Máquina da busca

| Função | Contrato |
|--------|----------|
| `emptyDiscovery()` | `{ state: "idle", seq: 0, startedAt: null, waiting: {}, found: [], mdnsUnavailable: false, scanUnavailable: false }` |
| `startDiscovery(d, now)` | `{ discovery, requests }`: `state: running`, `seq + 1`, `found: []`, pedidos `nets` e `mdns` com `seq` |
| `acceptNets(d, seq, nets, launched)` | seq errada → mesmo; sem redes ou não iniciou → `scanUnavailable`; senão pedido `scan` |
| `acceptMdns(d, seq, list, launched, printers)` | não iniciou → `mdnsUnavailable`; candidatos novos com pedidos `reverse` e `hostname` |
| `acceptScan(d, seq, ips, printers)` | candidatos novos (ou `sources` somado) com pedidos de nome |
| `acceptReverse(d, seq, ip, host, printers)` / `acceptHostname(d, seq, ip, name, printers)` | completa o Found, recalcula `address`, `name`, `added` |
| `cancelDiscovery(d)` | `state: idle`, `found: []`; quem chamou para os processos |
| `expireDiscovery(d, now)` | passou 30 s de `startedAt` → `done` com o que tem, `waiting: {}` |
| `discoveryDone(d)` | `waiting` vazio com `state: running` → `done` |

Cada `accept*` diminui `waiting` do tipo e termina a busca quando zera (`discoveryDone`).
`found` ordenado por `name`; junção por `ip`. Casos: Voron pelo anúncio e pela verificação → um
Found com `sources ["mdns","scan"]`; `voron.local` cadastrada → `added: true` também quando achada
só pelo IP com reverso `voron.local`.

## Lista nova e gravação

| Função | Contrato |
|--------|----------|
| `rawPrinters(settings)` | a lista crua das settings (`printers` lista, ou texto JSON de lista) ou `[]` |
| `addPrinterToList(raw, address, name, printers)` | `{ list, key, error }`: endereço inválido → `error: TEXT.invalidAddress`; mesmo host:porta de uma cadastrada → `error: alreadyAdded`; senão `list` = cópia de `raw` + `{ name, address }` (nome vazio omitido), `key` = `normalizeAddress(address) + "#" + <ordem>` |
| `removePrinterFromList(raw, order)` | `list` sem o item aceito de ordem `order` (pula itens inválidos como `normalizePrinters`), resto intacto |
| `buildSaveArgs(list)` | `["omarchy-shell","shell","setBarWidget","io.github.brunorzm.omaklippy","printers"," " + JSON.stringify(list),"{}"]` |
| `parseSaveResult(stdout, exitCode, launched)` | `{ ok, message }` da tabela de commands.md |

Casos: preserva `webUrl` e campos extras das outras; a lista em texto vira lista; remover a última →
`[]`.

## Painel

- `buildSetupModel(printers, discovery, form, selectedKey, editable)` → `{ searching, foundCount,
  results[{ ip, name, address, added, ready }], notices[], nothingFound, removeLabel, editable }`.
- `buildPanelModel(...)`: sem mudança de assinatura; o painel vazio deixa de usar `setupCommand`.
- `setupCommand` sai (FR-009).

## Cobertura exigida

Cada caso acima com fixtures; "nunca lança" para cada função nova; o teste de textos em inglês
cobre `TEXT.setup`. Teste que sai de propósito: "setupCommand is the exact command shown in the
empty panel" (`tests/panel.test.js`).
