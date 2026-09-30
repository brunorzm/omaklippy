# Contract: exibição (Restart firmware)

Complementa o [contrato de exibição da 002](../../002-panel-print-actions/contracts/display.md) e o
da [003](../../003-open-web-ui/contracts/display.md). Nenhuma mudança no `Panel.qml`: o botão vem
em `actions.primary`.

## Posição no painel (FR-009)

**Firmware desligado (parada de emergência, falha do MCU, erro de configuração)**

```text
│ ⚠ error                               │
│ MCU 'mcu' shutdown: ADC out of range │  motivo da impressora (001)
├──────────────────────────────────────┤
│ [ ↻ Restart firmware               ] │  linha primary, um botão, largura total, sem fundo
│                                      │
│ [ ↗ Open web UI                    ] │  (003)
│ ⚠ Restart firmware failed: …         │  failureText, só em falha
│ updated <1 min ago                   │
```

| Estado | Linha primary | Emergência | Web (003) |
|--------|---------------|------------|-----------|
| imprimindo / pausada / ociosa | como na 002 | como na 002 | se houver endereço |
| error com Klipper `shutdown`/`error` | **Restart firmware** | — | se houver endereço |
| error com Klipper `startup`, 503, erro de impressão, 401/403 | — | — | se houver endereço |
| offline | — | — | se houver endereço |

## Botão

O `Button` da linha primary da 002: bordered, fundo transparente (não o fundo de alerta),
`iconText` = `ACTION_GLYPHS.firmwareRestart`, girando o glifo `busy` em andamento; mouse e teclado
(Enter/Espaço com o cursor, j/k para chegar) iguais aos demais.

## Confirmação (FR-003)

| Propriedade | Valor |
|-------------|-------|
| `message` | `Restart the firmware on Voron? Klipper and the printer's boards will restart.` |
| `cancelText` | Back |
| `confirmText` | Restart |
| `selectedIndex` ao abrir | 0 (Back) |

Confirmar, desistir (Back, Escape, clique no fundo) e fechamento automático sem enviar (painel
abre/fecha, troca de impressora, botão sumiu ou ficou desabilitado): regras da 002, sem mudança.

## Ícone da barra

Sem controles (FR-011); durante o reinício o ícone mostra o erro e depois o estado ocioso, como
qualquer mudança de estado (001).
