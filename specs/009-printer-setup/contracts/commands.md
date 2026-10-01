# Contract: comandos externos (fatia 009)

Todos como `Process` assíncrono com guarda; nenhum por shell (`sh -c`). Decisões em
[../research.md](../research.md).

## Redes locais

```text
ip -j -4 addr show            guarda 3 s
```

Saída: lista JSON de interfaces com `ifname` e `addr_info[{local, prefixlen, scope}]`.

## Anúncio

```text
avahi-browse -rtp _moonraker._tcp      guarda 6 s
```

Linhas `=;<iface>;IPv4;<nome escapado>;_moonraker._tcp;local;<host.local>;<ip>;<porta>;<txt>`.
Nomes vêm com escapes decimais do avahi (`\032` = espaço). Linhas `+`, `-` e IPv6 são ignoradas.

## Verificação

```text
curl -s --parallel --parallel-max 64 --connect-timeout 1 --max-time 2
     -w "%{url} %{http_code}\n"
     -o /dev/null http://<prefix>1:7125/server/info  …  -o /dev/null http://<prefix>254:7125/server/info
guarda 20 s
```

Sem o IP do próprio computador. Saída: uma linha por endereço, `200` = candidato.

## Nome e endereço de um candidato

```text
avahi-resolve -a <ip>                                    guarda 3 s   → "<ip>\t<host.local>"
curl (consulta normal) http://<ip>:7125/printer/info      guarda timeoutSec + 1 → result.hostname
```

## Conferência do endereço digitado

```text
curl (consulta normal) <baseUrl>/server/info              → 200 com result.klippy_state ou result.moonraker_version
curl (consulta normal) <baseUrl>/printer/info             → result.hostname (só com nome vazio)
```

## Gravação

```text
omarchy-shell shell setBarWidget io.github.brunorzm.omaklippy printers " <json da lista>" "{}"
guarda 5 s
```

| Saída | Resultado |
|-------|-----------|
| stdout `ok` (sem espaços) | sucesso |
| stdout com outro texto (ex. `could not find widget …`, `Too many arguments provided …`) | falha com esse texto |
| stderr `omarchy-shell is not running` / `not responding`, ou processo não iniciou | falha com o motivo |
| guarda | falha "no answer from the shell" |

## Fixtures

| Fixture | Origem |
|---------|--------|
| `ip-addr.synthetic` | formato do `ip -j` deste computador, com IPs trocados por exemplos (192.168.1.21/24 em `wlp7s0`, `tailscale0` /32, `docker0` 172.17.0.1/16, `lo`) |
| `avahi-moonraker.synthetic` | formato real do `avahi-browse -rtp` (conferido com `_spotify-connect._tcp`), com duas impressoras, uma com `\032` no nome e uma linha IPv6 |
| `scan.synthetic` | formato real da verificação (medido), 2 × `200`, resto `000` |
| `printer-info-voron` | resposta real de `/printer/info` da Voron reduzida a `hostname`, `state`, `software_version` (o resto tem caminhos com o usuário da impressora) |
| `server-info-voron` | resposta real de `/server/info` reduzida a `klippy_state`, `moonraker_version` |
| `set-widget-ok`, `set-widget-error.synthetic` | stdout `ok`; stdout `could not find widget io.github.brunorzm.omaklippy` |
