# Contract: exibição (tela de cadastro)

Tudo com `qs.Ui` (`Button`, `TextField`, `ConfirmDialog`, `PanelSeparator`, `PanelSectionHeader`) e
tokens de `qs.Commons`. O conteúdo vem de `buildSetupModel`
([model-api.md](./model-api.md#painel)).

## Entrada

- Painel com impressoras: botão `Printers…` na última linha da área de ações (depois de Open web
  UI), aparência comum. Abre a tela de cadastro.
- Painel vazio: abre direto na tela de cadastro (no lugar de "Add a printer with:" + comando, FR-009).

## Tela de cadastro

```text
│ Printers                              │  PanelSectionHeader
│ [ ⌕ Search network                  ] │  vira "Searching… 1 found" + [Cancel] durante a busca
│   Voron        voron.local    [Added] │  resultado já cadastrado: botão desabilitado
│   Biqu         biqu.local     [ Add ] │
│ ⓘ Network announcements unavailable…  │  avisos (mdns/scan), bodySmall
├──────────────────────────────────────┤
│ Add by address                        │
│ [ voron.local or 192.168.1.50       ] │  TextField Address
│ [ Name (optional)                   ] │  TextField Name
│ [ Add ]                               │  vira "Checking voron.local…"; sem resposta: motivo + [Add anyway]
├──────────────────────────────────────┤
│ [ 🗑 Remove Voron                    ] │  só com impressora selecionada; ConfirmDialog
│ ⚠ Could not save the printers: …      │  falha de gravação
│ [ ← Back ]                            │  volta ao painel (não aparece no painel vazio)
```

- `nothingFound` → "No printers found on the network." no lugar da lista.
- `editable: false` → só o aviso `notEditable` e Back.

## Remover

| Propriedade | Valor |
|-------------|-------|
| `message` | `Remove Voron from the list? You can add it again later.` |
| `cancelText` / `confirmText` | Back / Remove |
| `selectedIndex` ao abrir | 0 (Back) |

## Teclado (FR-010)

- `j`/`k` percorrem os botões da tela (Search/Cancel, Add de cada resultado, campos, Add, Remove,
  Back); Enter/Espaço aciona; num campo, Enter entra nele.
- Com foco num `TextField`: as teclas vão para o campo; Enter no Address passa ao Name; Enter no
  Name confirma; Escape sai do campo e devolve o foco ao `PanelKeyCatcher` (não fecha o painel).
- Escape fora de campo: com busca em andamento, cancela; senão fecha o painel (como antes).
- Fechar o painel cancela a busca e o formulário; ao reabrir, volta ao painel principal (ou à tela
  de cadastro, se vazio).
