# Quickstart: validar "Restart firmware"

Comportamento esperado em [data-model.md](./data-model.md) e [contracts/](./contracts/).

> **Segurança**: só `GET` nas impressoras reais. A parada de emergência e o reinício na Voron são
> feitos **pelo usuário**; o assistente prepara o observador (GET + capturas) e confere.

## 1. Gates de toda tarefa

```bash
node --test tests/
omarchy plugin validate .
qmllint -I "$OMARCHY_PATH/shell" BarWidget.qml Panel.qml   # e o lint com qs/ em scratch
```

Depois de mudar código, `omarchy-restart-shell` (esperar ~12 s antes do `summon`).

## 2. Moonraker falso

O servidor da 002 (`fake/server.py`, num scratchpad de sessão anterior) serve GET a partir do
arquivo `state`, POST com o código do arquivo `code` e troca o `state` pelo conteúdo de `next`
quando recebe um POST. Para esta fatia, recriá-lo no scratchpad desta sessão, com uma **sequência**
de estados depois do POST (por exemplo o arquivo `next` com várias linhas, uma por consulta:
`klippy-restarting`, `klippy-restarting`, `startup`, `startup`, `standby.synthetic`), e registrar
cada POST em `posts.log`. Em `shell.json`, só impressoras falsas (backup e restauração).

| # | Estado / POST | Passos | Esperado |
|---|---------------|--------|----------|
| 1 | `shutdown` | abrir o painel | `Restart firmware` na linha própria, sem fundo de alerta, acima de Open web UI; sem Emergency stop |
| 2 | `klippy-error.synthetic` | abrir o painel | botão aparece; motivo visível |
| 3 | `startup`, `klippy-restarting`, `print-error.synthetic`, `standby.synthetic`, `printing.synthetic`, `hang` (offline) | abrir o painel em cada um | sem o botão |
| 4 | `shutdown` | acionar, Back / Escape / clique fora | nada em `posts.log` |
| 5 | `shutdown`, POST 200 + sequência | acionar e confirmar (mouse e teclado) | 1 POST `/printer/firmware_restart`; spinner; depois "Klippy Disconnected", mensagem de inicialização, "idle" sem ação do usuário |
| 6 | `shutdown`, POST com `delay` 5 | confirmar e clicar de novo | 1 POST; botão desabilitado com spinner |
| 7 | `shutdown`, POST 503 / 400 / `down` | confirmar | `Restart firmware failed: …` com o motivo |
| 8 | `shutdown`, POST 200, `next` = `shutdown` | confirmar | volta a "error" com o motivo e o botão (US2.2) |
| 9 | duas impressoras, confirmação aberta | trocar de impressora no dropdown | confirmação fecha, nada enviado |
| 10 | 5 com `notify-send` observado | — | 0 notificações |

## 3. Teclado

Com o painel em `shutdown`: `j` leva o cursor ao botão, `Enter` abre a confirmação com "Back"
selecionado, `Enter` desiste; `→` + `Enter` confirma. Regras de segurança do `wtype` da memória
do projeto.

## 4. Ciclo de vida (Princípio VI)

Checklist das fatias anteriores; `remove`/reinstalar depois do push, com cópia da pasta e
`.specify/feature.json` restaurado.

## 5. Teste em hardware (Princípio VII)

Na Voron ociosa e fria, com o usuário:

1. o assistente liga um observador (GET a cada segundo em `webhooks`/`print_stats`, com
   horário) e captura o painel;
2. o usuário aciona **Emergency stop** pelo painel e confirma → painel "error", `Restart
   firmware` aparece, Emergency stop some;
3. o usuário aciona **Restart firmware** e confirma → conferir a sequência 503 → `startup` →
   `ready` no observador e no painel, e "idle" em até 2 ciclos depois de o Klipper ficar pronto
   (SC-002); 0 notificações (SC-005);
4. contar as interações (abrir, acionar, confirmar: SC-001).

Registrar versões e resultados em `specs/007-firmware-restart/hardware-test.md`.
