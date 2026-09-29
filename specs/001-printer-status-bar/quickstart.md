# Quickstart: validar a fatia "Status das impressoras 3D na barra"

Roteiro para provar que a fatia funciona de ponta a ponta. Ele cobre os gates dos Princípios VI
e VII da constituição. O comportamento esperado de cada passo está nos contratos:
[display.md](./contracts/display.md), [settings.md](./contracts/settings.md),
[moonraker.md](./contracts/moonraker.md).

## Pré-requisitos

- Omarchy Quattro com `omarchy-shell` rodando e `OMARCHY_PATH` definido.
- `curl` instalado (dependência de runtime) e `node` (só para os testes).
- Pelo menos uma impressora Klipper + Moonraker na rede local, com este computador em
  `[authorization] trusted_clients` do `moonraker.conf`.
- Plugin em `~/.config/omarchy/plugins/io.github.brunorzm.omaklippy/`.

```bash
PLUGIN_ID=io.github.brunorzm.omaklippy
PLUGIN_DIR=~/.config/omarchy/plugins/$PLUGIN_ID
PRINTER=192.168.1.50            # ajuste
```

## 1. Gates de toda tarefa

```bash
node --test "$PLUGIN_DIR/tests/"
omarchy plugin validate "$PLUGIN_DIR"
qmllint -I "$OMARCHY_PATH/shell" "$PLUGIN_DIR/BarWidget.qml" "$PLUGIN_DIR/Panel.qml"
```

Esperado: os três terminam sem erro.

## 2. Conferir a impressora fora do shell

```bash
curl -sS --max-time 3 -w '\n%{http_code}\n' \
  "http://$PRINTER/printer/objects/query?webhooks&print_stats&virtual_sdcard&extruder=temperature,target&heater_bed=temperature,target"
```

Esperado: JSON com `result.status` e código `200`. Um `401` indica que falta liberar o IP em
`trusted_clients`. Esse é o mesmo comando usado para capturar as fixtures.

## 3. Instalar e configurar

```bash
omarchy-shell shell rescanPlugins
omarchy plugin enable $PLUGIN_ID
omarchy bar set $PLUGIN_ID printers "[{\"name\":\"Voron\",\"address\":\"$PRINTER\"}]" --json
```

Diagnóstico a qualquer momento: `qs log -p "$OMARCHY_PATH/shell" --tail 100`.

## 4. Cenários por história de usuário (impressora real)

Durante todos os cenários, a barra mostra **só o ícone**, nunca texto.

**US5, cadastro**

1. Antes do `bar set`, com `printers` vazio: ícone sem indicador; o tooltip diz "nenhuma
   impressora configurada"; o painel mostra o estado vazio com o comando de cadastro.
2. Depois do `bar set`: a impressora aparece em até 5 s, sem reiniciar o shell.
3. Remova a entrada: ela some do ícone e do painel em até um ciclo.

**US1, de relance na barra**

1. Ociosa: só o glifo; o tooltip é `Voron — ociosa`.
2. Inicie uma impressão: a barra fina sob o glifo avança; o tooltip é `Voron — imprimindo N%`.
3. `PAUSE`: o preenchimento fica atenuado (distinguível) em até 5 s. `RESUME`: volta ao normal.
4. Fim ou `CANCEL_PRINT`: o indicador some.
5. Troque o tema do Omarchy: o ícone e a barra acompanham as cores novas.

**US3, painel de detalhes**

1. Clique no ícone: o painel abre ancorado no ícone, com nome, "imprimindo · N%", barra de
   progresso, arquivo, restante e bico/mesa atual/alvo, iguais aos da interface web (±1 ciclo).
2. Com o painel aberto, os valores se atualizam sozinhos.
3. Nos primeiros segundos da impressão (progresso < 1%): restante "—".
4. Com a impressora ociosa: sem bloco de impressão, só temperaturas.
5. O painel fecha com Escape, com clique fora e com novo clique no ícone.

**US2, inacessível e erro**

1. Desligue a impressora ou o Pi: o ícone fica esmaecido em até 8 s; o painel mostra "offline",
   o motivo e "sem resposta há X min", sem temperaturas.
2. Desligue o Wi-Fi do computador: tudo fica offline. Religue: volta sozinho.
3. Endereço errado (`10.255.255.1`): offline por tempo limite. Endereço inválido (`"a b"`):
   offline com o motivo "endereço inválido".
4. `M112`: o ícone fica na cor de alerta do tema; o painel mostra "erro" e a mensagem do Klipper.
   `FIRMWARE_RESTART`: volta a ociosa.
5. `sudo systemctl stop klipper` **no Pi**: erro "Klippy Host not connected". Depois, `start`.
6. Tire temporariamente o IP de `trusted_clients` e reinicie o Moonraker: erro "acesso não
   autorizado". Restaure a configuração.

**US4, várias impressoras** (se houver mais de uma; senão, cadastre uma segunda com endereço
inexistente para simular)

1. O ícone representa a mais relevante (erro > imprimindo > pausada > offline > ociosa).
2. O painel abre com essa selecionada e a lista "Impressoras" mostra todas.
3. Selecione outra com clique; depois com j/k + Enter: o detalhe troca.
4. Feche e reabra o painel: a escolha é mantida. Reinicie o shell: volta à mais relevante.
5. Duas entradas com o mesmo nome: a lista mostra `Nome (host)` para as duas.
6. Com uma impressora só, a lista não aparece.

**IPC e botões**: `omarchy-shell $PLUGIN_ID refresh` atualiza na hora, sem
erro no log. Não há botões de ação no painel.

## 5. Checklist de ciclo de vida (Princípio VI)

| Passo | Comando / ação | Esperado |
|-------|----------------|----------|
| Clique | clique esquerdo no ícone, duas vezes | abre e depois fecha o painel |
| Escape | abrir e pressionar Escape | o painel fecha e o foco volta ao desktop |
| Summon | `omarchy-shell shell summon $PLUGIN_ID '{}'` | o painel abre no monitor do bar ativo |
| Hide | `omarchy-shell shell hide $PLUGIN_ID` | o painel fecha |
| Troca de painel | com o painel aberto, clicar no ícone de Wi-Fi | o nosso fecha e o outro abre, sem os dois ficarem abertos |
| Desabilitar | `omarchy plugin disable $PLUGIN_ID` (com o painel aberto) | ícone e painel somem; nenhum `curl` restante (`pgrep -af 'curl.*printer/objects'` vazio) |
| Reabilitar | `omarchy plugin enable $PLUGIN_ID` | o widget volta à barra **sem** as configurações (o `disable` do Omarchy remove a entrada do layout; recadastre as impressoras) |
| Reiniciar shell | `omarchy-restart-shell` | o ícone volta, as consultas recomeçam e a seleção volta a automática |
| Remover | `omarchy plugin remove $PLUGIN_ID` | tudo some; nenhum arquivo do plugin fora da pasta |

Confira também `omarchy plugin list --json | jq --arg id $PLUGIN_ID '.[] | select(.id == $id)'`
e o log (`qs log -p "$OMARCHY_PATH/shell" --tail 100`) sem avisos do plugin.

## 6. Registro do teste em hardware (Princípio VII)

Copie para a descrição da fatia ou do commit final:

```text
Data:
Impressora(s) / placa:
Versão do Klipper:           (Mainsail → Machine → Update Manager, ou `git describe` no Pi)
Versão do Moonraker:         (GET /server/info → moonraker_version)
US1 ícone:    [ ] ociosa [ ] imprimindo [ ] pausada [ ] fim/cancelado [ ] troca de tema
US2 falhas:   [ ] desligada [ ] Wi-Fi [ ] endereço errado [ ] M112 [ ] klipper parado [ ] 401
US3 painel:   [ ] detalhes corretos [ ] atualiza aberto [ ] restante "—" [ ] fecha (Esc/fora/ícone)
US4 seletor:  [ ] n/a [ ] mais relevante [ ] troca mouse/teclado [ ] seleção mantida [ ] nomes repetidos
US5 cadastro: [ ] vazio [ ] cadastro ao vivo [ ] remoção
Checklist de ciclo de vida: [ ] completo
Observações:
```
