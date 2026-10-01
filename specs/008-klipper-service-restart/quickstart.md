# Quickstart: validar "Restart Klipper"

Comportamento esperado em [data-model.md](./data-model.md) e [contracts/](./contracts/).

> **Segurança**: só `GET` nas impressoras reais. Parar o serviço do Klipper na Voron e acionar o
> reinício pelo painel são feitos **pelo usuário**; o assistente prepara o observador e confere.
> Testes ao vivo: o usuário clica, o assistente prepara o servidor falso e os cronômetros
> (o usuário pediu para não enviar teclas sem perguntar).

## 1. Gates de toda tarefa

```bash
node --test tests/
omarchy plugin validate .
qmllint -I "$OMARCHY_PATH/shell" BarWidget.qml Panel.qml   # e o lint com qs/ em scratch
```

Depois de mudar código, `omarchy-restart-shell`.

## 2. Moonraker falso

O `server.py` da 007 (scratchpad), com dois acréscimos: `GET /machine/system_info` servindo a
fixture do arquivo `sysinfo-<porta>`, e o log incluindo a query do POST (para conferir
`?service=`). Estados por arquivo `state-<porta>`; sequência depois do POST por `next-<porta>`.

| # | Preparação | Passos | Esperado |
|---|-----------|--------|----------|
| 1 | `state` = `klippy-disconnected` | abrir o painel logo e esperar | error "Klippy Host not connected"; botão ausente nos primeiros 15 s, aparece depois; 1 `GET /machine/system_info` no log |
| 2 | alternar `klippy-disconnected` e `standby.synthetic` a cada 10 s | olhar o painel 1 min | botão nunca aparece |
| 3 | 503 há mais de 15 s | acionar, Back / Escape / clique fora | nada no log de POST |
| 4 | 503 há mais de 15 s, POST 200, `next` = `klippy-disconnected`, `startup`, `startup`, `standby.synthetic` | acionar e confirmar | 1 `POST /machine/services/restart?service=klipper`; painel passa por inicialização até idle; botão não reaparece no meio |
| 5 | `sysinfo` = `system-info-instance.synthetic`, servidor reiniciado | 4 de novo | POST com `?service=klipper-1` |
| 6 | POST 400 (`action-service-not-allowed`) e conexão fechada | confirmar | `Restart Klipper failed: …` com o motivo; botão continua |
| 7 | POST 200, `next` só `klippy-disconnected` | confirmar e esperar | botão volta 15 s depois (US2.2) |
| 8 | `state` = `shutdown` | abrir o painel | Restart firmware (007), sem Restart Klipper |
| 9 | 4 com `dbus-monitor` | — | 0 notificações |

## 3. Teclado

Só com a autorização do usuário: `j` até o botão, `Enter` abre a confirmação com "Back"
selecionado. Senão, o usuário confere pelo teclado.

## 4. Ciclo de vida (Princípio VI)

Checklist das fatias anteriores; `remove`/reinstalar depois do push, com cópia da pasta,
`.specify/feature.json` e impressoras restaurados.

## 5. Teste em hardware (Princípio VII)

Na Voron ociosa e fria, com o usuário:

1. o assistente liga o observador (GET de `webhooks`/`print_stats` a cada segundo, com horário e
   código HTTP) e captura `GET /machine/system_info` (reduzido aos campos usados) como fixture
   real `system-info-voron`;
2. o usuário para o serviço do Klipper (Mainsail → menu de energia → Klipper → Stop);
3. conferir: "error" com "Klippy Host not connected"; o botão só depois de 15 s;
4. o usuário aciona **Restart Klipper** e confirma → serviço volta, painel até idle; conferir no
   observador e que o POST com `?service=klipper` foi aceito (a query em POST vem do código
   do Moonraker, não da documentação);
5. 3 interações (SC-001), 0 notificações (SC-005).

Registrar em `specs/008-klipper-service-restart/hardware-test.md`.
