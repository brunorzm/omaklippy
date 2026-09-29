# OmaKlippy

Plugin do [Omarchy](https://omarchy.org) Quattro (`io.github.brunorzm.omaklippy`) que mostra na
barra o estado das impressoras 3D com Klipper, consultando a API do Moonraker na rede local.

- **Na barra**: só o ícone da impressora. Com impressão em andamento aparece uma barra fina de
  progresso sob o ícone (atenuada quando pausada). Em erro, o ícone ganha um selo na cor de
  alerta do tema; offline, fica esmaecido. Ao passar o mouse, uma linha: `Voron — imprimindo 42%`.
- **No painel** (clique no ícone): estado, progresso, arquivo, tempo restante, temperaturas de
  bico e mesa e há quanto tempo veio a última resposta. Com mais de uma impressora, uma lista
  para escolher qual ver (mouse, ou `j`/`k` e Enter).
- O ícone sempre representa a impressora mais relevante: erro > imprimindo > pausada > offline
  > ociosa (empate: ordem de cadastro).

Ações de controle (pausar/retomar, cancelar, parada de emergência, abrir a interface web) ainda
não existem; ficam para a próxima versão.

## Instalação

```bash
omarchy plugin add https://github.com/brunorzm/omaklippy.git --enable
```

Ou copie a pasta para `~/.config/omarchy/plugins/io.github.brunorzm.omaklippy/` e rode
`omarchy plugin enable io.github.brunorzm.omaklippy`.

## Configuração

As configurações ficam na entrada do widget em `~/.config/omarchy/shell.json` e valem na hora,
sem reiniciar.

| Chave | Padrão | Descrição |
|-------|--------|-----------|
| `printers` | `[]` | Lista de `{ "name": "...", "address": "..." }`. O endereço aceita `host`, `host:porta` ou `http(s)://host[:porta]`. Nomes podem se repetir; o painel mostra o endereço junto. |
| `refreshIntervalSec` | `5` | Intervalo entre consultas, de 2 a 3600 s. |
| `timeoutSec` | `3` | Tempo limite de cada consulta, de 1 a 30 s. Sem resposta dentro dele, a impressora aparece como offline. |

```bash
# Cadastrar (a lista vai SEM --json)
omarchy bar set io.github.brunorzm.omaklippy printers \
  '[{"name":"Voron","address":"voron.local"},{"name":"Ender","address":"192.168.1.51:7125"}]'

# Ajustes numéricos (com --json)
omarchy bar set io.github.brunorzm.omaklippy refreshIntervalSec 10 --json
omarchy bar set io.github.brunorzm.omaklippy timeoutSec 5 --json
```

> **Por que `printers` vai sem `--json`?** No Omarchy 4.0.4, o `omarchy bar set --json` passa o
> valor pelo `quickshell ipc call`, que divide listas JSON em vários argumentos: uma lista de um
> item vira o objeto solto, e uma de dois itens falha com "Too many arguments". Sem `--json`, a
> lista é gravada como texto e o plugin a lê normalmente. Editar o `shell.json` à mão também
> funciona.
>
> **Se a mudança não aparecer:** no Omarchy 4.0.4, só o primeiro `omarchy bar set` num widget
> chega ao widget em execução; os seguintes ficam gravados no `shell.json`, mas o shell não os
> repassa até reiniciar (`omarchy-restart-shell`). Editar o `shell.json` diretamente é sempre
> aplicado na hora.

#> **Atenção:** `omarchy plugin disable` remove a entrada do widget do `shell.json`, junto com
> as impressoras cadastradas. Ao reabilitar, cadastre-as de novo.

## Moonraker

O plugin consulta `GET /printer/objects/query` sem autenticação. O computador precisa estar
liberado em `moonraker.conf`:

```ini
[authorization]
trusted_clients:
    192.168.0.0/16
```

Sem isso, a impressora aparece como "erro: acesso não autorizado".

## Dependências

| Binário | Quando | Para quê |
|---------|--------|----------|
| `curl` | obrigatório, em tempo de execução | Consultar o Moonraker de cada impressora, sempre com tempo limite (`--connect-timeout`/`--max-time`). Sem ele, cada impressora aparece como "erro: curl não encontrado". |
| `node` | só no desenvolvimento | Rodar os testes da lógica pura (`node --test tests/`). |

Nenhum outro binário externo é executado.

## Privilégios

- Roda dentro do `omarchy-shell`, sem sandbox, com as permissões do seu usuário.
- Não usa `sudo`, não executa scripts de instalação, não inicia daemons nem serviços.
- Não cria arquivos fora da própria pasta. As configurações ficam na entrada do widget em
  `~/.config/omarchy/shell.json`, gravada pelo próprio shell.
- Faz apenas leituras (`GET`) no Moonraker das impressoras cadastradas.

## IPC

```bash
omarchy-shell io.github.brunorzm.omaklippy refresh        # consulta todas agora
omarchy-shell shell summon io.github.brunorzm.omaklippy '{}'  # abre o painel
omarchy-shell shell hide io.github.brunorzm.omaklippy         # fecha o painel
```

## Desenvolvimento

- Toda a lógica (configuração, parse das respostas, estados, textos) fica em `Model.js`, em
  funções puras. `BarWidget.qml` e `Panel.qml` só cuidam de processos, timers e interface.
- Testes: `node --test tests/`. As respostas de exemplo ficam em `tests/fixtures/` (veja o README
  de lá para capturar novas de uma impressora real).
- Validação: `omarchy plugin validate .` e
  `qmllint -I "$OMARCHY_PATH/shell" BarWidget.qml Panel.qml`.
- O hot reload do shell não recarrega de forma confiável um plugin de terceiros (inclusive
  arquivos criados depois do primeiro carregamento). Depois de mudar o código, rode
  `omarchy-restart-shell`. Mudanças de configuração não precisam disso.

## Licença

MIT
