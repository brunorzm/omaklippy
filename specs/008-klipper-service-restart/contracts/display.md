# Contract: exibição (Restart Klipper)

Complementa o [display.md da 007](../../007-firmware-restart/contracts/display.md). Nenhuma mudança
no `Panel.qml`: o botão vem em `actions.primary`.

## Posição no painel (FR-010)

**Serviço do Klipper desconectado há 15 s ou mais**

```text
│ ⚠ error                               │
│ Klippy Host not connected            │  motivo (001)
├──────────────────────────────────────┤
│ [ ⟳ Restart Klipper                ] │  linha primary, um botão, largura total, sem fundo
│                                      │
│ [ ↗ Open web UI                    ] │  (003)
│ ⚠ Restart Klipper failed: …          │  failureText, só em falha
│ updated <1 min ago                   │
```

| Estado | Linha primary |
|--------|---------------|
| imprimindo / pausada / ociosa | como na 002 |
| error com Klipper `shutdown`/`error` | Restart firmware (007) |
| error com 503 há ≥ 15 s | **Restart Klipper** |
| error com 503 há < 15 s, `startup`, erro de impressão, 401/403 | — |
| offline | — |

## Confirmação (FR-004)

| Propriedade | Valor |
|-------------|-------|
| `message` | `Restart the Klipper service on Voron? It will start again on the printer's computer.` |
| `cancelText` | Back |
| `confirmText` | Restart |
| `selectedIndex` ao abrir | 0 (Back) |

Confirmar, desistir e fechamento automático: regras da 002, sem mudança.

## Ícone da barra

Sem controles (FR-012).
