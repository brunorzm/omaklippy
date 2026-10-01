# Quickstart: validar o cadastro e a busca

Comportamento em [data-model.md](./data-model.md) e [contracts/](./contracts/).

> **Segurança**: a busca faz só GET de leitura e só quando pedida. Adicionar e remover gravam o
> `shell.json` do usuário: backup antes de cada sessão de teste e conferência depois. Testes ao
> vivo: o usuário clica e digita; o assistente prepara, observa e confere (sem enviar teclas sem
> perguntar).

## 1. Gates de toda tarefa

```bash
node --test tests/
omarchy plugin validate .
qmllint -I "$OMARCHY_PATH/shell" BarWidget.qml Panel.qml   # e o lint com qs/ em scratch
```

Depois de mudar código, `omarchy-restart-shell`.

## 2. Busca na rede real (US1)

| # | Passos | Esperado |
|---|--------|----------|
| 1 | painel com Voron e Biqu → Printers… → Search network | andamento; em até 30 s, Voron (`voron.local`) e Biqu (`biqu.local`), as duas "Added" |
| 2 | Cancel no meio | busca para; nada adicionado; nenhum `curl`/`avahi` sobrando |
| 3 | fechar o painel no meio | idem |
| 4 | com `avahi-browse` indisponível (não dá para simular no PATH do shell: conferido pelo teste puro) | aviso `mdnsUnavailable` |

## 3. Adicionar e remover (US1–US3), com backup do `shell.json`

| # | Passos | Esperado |
|---|--------|----------|
| 1 | remover a Biqu (confirmar) | some do painel e da barra; `shell.json` sem ela, Voron intacta |
| 2 | buscar e adicionar a Biqu | volta com o nome que ela informa (`biqu`) e endereço `biqu.local`, selecionada; `shell.json` com ela no fim |
| 3 | remover de novo e adicionar por endereço `biqu.local` com nome `Biqu B1` | `shell.json` volta igual ao backup (o nome "Biqu B1" do usuário é restaurado) |
| 4 | Add by address `biqu.local` | "biqu.local is already in the list" |
| 5 | Add by address `192.168.0.99` (nada responde) | motivo + Add anyway; Back sem adicionar |
| 6 | Add by address `a b` | "invalid address" |
| 7 | remover a última impressora (só se o usuário quiser; com backup) | painel vazio abre na tela de cadastro |
| 8 | `omarchy-restart-shell` | lista continua a mesma (SC-004) |

## 4. Ciclo de vida (Princípio VI)

Checklist das fatias anteriores; `remove`/reinstalar depois do push, com cópia da pasta,
`.specify/feature.json` e impressoras restaurados.

## 5. Hardware (Princípio VII)

Os cenários do §2 e §3 já usam a Voron e a Biqu reais. Registrar em
`specs/009-printer-setup/hardware-test.md`: tempo da busca, o que achou, os `shell.json` antes e
depois de cada gravação (só a entrada do OmaKlippy), versões.
