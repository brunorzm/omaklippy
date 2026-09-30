# Quickstart: validar a fatia "Abrir a interface web pelo painel"

Roteiro para provar a fatia de ponta a ponta e cumprir os gates dos Princípios VI e VII. O
comportamento esperado está em [display.md](./contracts/display.md),
[model-api.md](./contracts/model-api.md) e [data-model.md](./data-model.md). A preparação é a
da [fatia 001](../001-printer-status-bar/quickstart.md); o Moonraker falso é o da
[fatia 002](../002-panel-print-actions/quickstart.md#2-moonraker-falso-falhas-e-cliques-sem-risco).

> **Segurança**: esta fatia não envia nada às impressoras; o botão só abre o navegador. Mesmo
> assim, durante os testes o assistente não aciona Pause/Resume/Cancel/Emergency stop em
> impressoras reais.

```bash
PLUGIN_ID=io.github.brunorzm.omaklippy
PLUGIN_DIR=~/.config/omarchy/plugins/$PLUGIN_ID
```

## 1. Gates de toda tarefa

```bash
node --test "$PLUGIN_DIR/tests/"
omarchy plugin validate "$PLUGIN_DIR"
qmllint -I "$OMARCHY_PATH/shell" "$PLUGIN_DIR/BarWidget.qml" "$PLUGIN_DIR/Panel.qml"
```

Esperado: tudo sem erro. Depois de mudar código, `omarchy-restart-shell`.

## 2. Configuração de teste

Com backup do `shell.json`, cadastre (editando o arquivo) impressoras que cubram os casos:

| Nome | `address` | `webUrl` | Abre |
|------|-----------|----------|------|
| Fake | `127.0.0.1:<porta do falso>` | — | `http://127.0.0.1:<porta>` |
| Fake7125 | `127.0.0.1:7125` (falso na 7125) | — | `http://127.0.0.1` |
| FakeWeb | `127.0.0.1:<porta>` | `http://127.0.0.1:<porta>/web` | `http://127.0.0.1:<porta>/web` |
| BadWeb | `127.0.0.1:<porta>` | `a b` | botão ausente, status normal |
| BadAddr | `a b` | `http://127.0.0.1:<porta>` | offline "invalid address", botão presente |

Restaure o `shell.json` ao final.

## 3. Cenários

**US1: botão e abertura**

1. Fixture `printing`: a área mostra Pause/Cancel, e-stop e, embaixo, Open web UI em linha
   própria, sem cor de alerta, separado do e-stop.
2. Fixture `standby`: e-stop e Open web UI. Fixture `shutdown` e servidor parado (offline): só
   Open web UI.
3. Clique em Open web UI: o navegador padrão abre a URL da tabela §2 da impressora selecionada e
   o painel fecha. Conferir a URL na barra de endereço do navegador.
4. Teclado: `j` até a última parada (Open web UI), Enter → mesmo resultado.
5. Trocar de impressora no dropdown e acionar logo em seguida → abre a URL da nova.
6. Sem impressoras (`printers: []`): nenhuma área de ações.

**US2: endereço informado e derivado (SC-002)**

1. Percorrer as linhas da tabela §2 e conferir a URL aberta em cada uma.
2. Os testes de `deriveWebUrl`/`normalizePrinters` cobrem as demais formas (`https`, caminho).

**US3: falha (SC-006)** — passo aprovado e executado com o usuário

> **Não funciona (2026-09-30)**: no `PATH` do shell, `/usr/share/omarchy/bin` vem antes de
> `~/.local/bin`, então o launcher falso é ignorado. Mantido só como registro; ver
> [hardware-test.md](./hardware-test.md#falha-ao-vivo-t021-não-foi-possível).

1. Criar `~/.local/bin/omarchy-launch-browser` temporário com `#!/bin/sh` + `exit 1`
   (`chmod +x`). No `PATH` do shell, `~/.local/bin` vem antes de `/usr/share/omarchy/bin`.
2. Acionar Open web UI → o painel continua aberto com
   `Open web UI failed: browser launcher exited with code 1`.
3. Trocar de impressora → a mensagem some.
4. **Remover o arquivo temporário** e conferir que `command -v omarchy-launch-browser` volta a
   `/usr/share/omarchy/bin/omarchy-launch-browser`.

**Relação com a 002 (FR-014)**

1. Com o falso respondendo `POST` com atraso de 10 s, acionar Pause e, com o spinner rodando,
   Open web UI → o navegador abre, o painel fecha e o Pause termina normalmente (log do falso).

## 4. Ciclo de vida (Princípio VI)

Checklist da 001/002: clique, Escape, `omarchy-shell shell summon|hide $PLUGIN_ID`, disable,
enable (recadastrar as impressoras), `omarchy-restart-shell` com o navegador aberto (o navegador
continua aberto: roda na própria unidade systemd), remove só depois do push (ver memória do
projeto).

## 5. Teste em hardware (Princípio VII)

Com a Voron (`voron.local`) e a Biqu (`biqu.local`) cadastradas como hoje, sem `webUrl`:

1. Selecionar cada uma e acionar Open web UI → o Mainsail/Fluidd de cada uma abre no navegador,
   e o painel fecha.
2. SC-003: observador `hyprctl clients -j` em laço (100 ms) registrando quando a janela ou aba do
   navegador aparece/ganha foco; tempo do acionamento até lá ≤ 2 s.
3. SC-004: se a impressora estiver em erro por outro motivo durante o teste, abrir a interface
   por ali. Não provocar erro de propósito.

Registrar em `specs/003-open-web-ui/hardware-test.md`:

```text
Data:
Impressoras: Voron (Klipper …, Moonraker …), Biqu B1 (Klipper …, Moonraker …)
Navegador padrão:
URL aberta por impressora:
Tempo até o navegador (SC-003):
Falha simulada (US3):
Ciclo de vida:
Observações:
```
