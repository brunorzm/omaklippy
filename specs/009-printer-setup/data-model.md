# Data Model: Cadastrar impressoras pelo painel, com descoberta na rede

Tudo em memória, por instância do widget. A configuração (lista de impressoras) continua sendo a
das `settings` do widget, gravada pelo shell (research R1).

## LocalNet (`parseLocalNets`)

| Campo | Tipo | Regras |
|-------|------|--------|
| `iface` | string | nome da interface |
| `prefix` | string | três primeiros octetos com ponto final (`"192.168.0."`) |
| `self` | string | IP do computador nessa rede (fica fora da verificação) |

Só endereços IPv4 `scope global`, prefixo de 16 a 30, interface fora de
`lo|tailscale*|wg*|tun*|tap*|docker*|br-*|veth*|virbr*|zt*`; sem repetir `prefix`.

## Found (impressora achada)

| Campo | Tipo | Regras |
|-------|------|--------|
| `ip` | string | IPv4; chave de junção |
| `address` | string | nome na rede (`voron.local`) se houver; senão o host do anúncio; senão `ip` |
| `name` | string | `hostname` do `/printer/info`; senão nome do anúncio; senão `address` sem `.local`; senão `ip` |
| `sources` | lista | `"mdns"` e/ou `"scan"` |
| `added` | bool | o host de `address` ou o `ip` é igual ao host de uma impressora cadastrada (sem diferenciar maiúsculas) |
| `pending` | inteiro | consultas de nome/endereço ainda em andamento (0 = pronto) |

## Discovery (estado da busca)

| Campo | Tipo | Regras |
|-------|------|--------|
| `state` | enum | `idle`, `running`, `done` |
| `seq` | inteiro | número da busca; resultados de outra `seq` são ignorados |
| `startedAt` | ms | para a guarda de 30 s |
| `waiting` | objeto | pedidos em andamento por tipo: `nets`, `mdns`, `scan`, `names` (contagem) |
| `found` | lista de Found | ordenada por `name` |
| `mdnsUnavailable` | bool | `avahi-browse` não iniciou |
| `scanUnavailable` | bool | `ip` não iniciou |
| `noLocalNetwork` | bool | `ip` rodou, mas não há rede local (só VPN, contêiner ou nenhuma) |

Transições:

```text
idle --startDiscovery--> running   (pedidos: ip, avahi-browse)
running: acceptNets   → pedido de verificação (se houver rede), senão scanUnavailable (ip ausente) ou noLocalNetwork
         acceptMdns   → candidatos "mdns"
         acceptScan   → candidatos "scan"
         cada candidato novo → pedidos avahi-resolve -a e /printer/info
         acceptName / acceptReverse → completa o Found
         waiting vazio → done
running --cancel/fechar painel/30 s--> done (com o que já tiver) ou idle (cancel)
done --startDiscovery--> running (seq + 1)
```

## AddForm (formulário por endereço)

| Campo | Tipo | Regras |
|-------|------|--------|
| `address`, `name` | string | digitados |
| `state` | enum | `editing`, `checking`, `unreachable` (mostra o motivo e "Add anyway"), `saving` |
| `message` | string | motivo (endereço inválido, já cadastrado, sem resposta) |

## SaveRequest (gravação)

| Campo | Tipo | Regras |
|-------|------|--------|
| `seq` | inteiro | um por vez por instância |
| `printers` | lista crua | a lista nova (R1: crua, preservando campos) |
| `selectKey` | string | chave a selecionar depois (`baseUrl#order`), ou `""` (remover) |
| `args` | lista | `["omarchy-shell","shell","setBarWidget","io.github.brunorzm.omaklippy","printers"," <json>","{}"]` |

Resultado: `ok` (stdout `ok`) ou falha com motivo (stdout de erro, processo não iniciou, guarda).

## Setup view (painel)

| Campo | Tipo | Regras |
|-------|------|--------|
| `view` | enum | `main` ou `setup`; painel vazio abre em `setup` |
| `removeConfirm` | string | chave da impressora a remover com o `ConfirmDialog` aberto, ou `""` |
| `editable` | bool | `false` quando o widget aparece mais de uma vez na mesma barra (R1) |
