# Contract: configuração do widget (`shell.json`)

As configurações ficam inline na entrada do widget em `bar.layout.<seção>[i]` de
`~/.config/omarchy/shell.json` (Princípio I; README do shell, "Storage rules" 3). O shell observa
o arquivo e reaplica `settings` no widget vivo, sem reiniciar (FR-024).

## Forma

```json
{
  "id": "io.github.brunorzm.omaklippy",
  "printers": [
    { "name": "Voron", "address": "192.168.1.50" },
    { "name": "Ender", "address": "http://ender.local:7125" }
  ],
  "refreshIntervalSec": 5,
  "timeoutSec": 3
}
```

Tipos, padrões e limites em [../data-model.md](../data-model.md#widgetsettings-persistido-pelo-shell-entrada-do-widget).
Chaves desconhecidas são ignoradas. O widget nunca escreve nessa entrada nesta fatia.

## Manifest

O `manifest.json` declara `defaults` e `schema` para os campos com tipo suportado (os tipos
vistos nos plugins first-party; o formulário que os renderiza ainda não vem no shell instalado):

```json
"barWidget": {
  "displayName": "OmaKlippy",
  "category": "Devices",
  "allowMultiple": true,
  "defaultSection": "right",
  "defaults": { "printers": [], "refreshIntervalSec": 5, "timeoutSec": 3 },
  "schema": [
    { "key": "refreshIntervalSec", "type": "integer", "label": "Intervalo de atualização (s)", "min": 2, "max": 3600, "step": 1, "defaultValue": 5 },
    { "key": "timeoutSec", "type": "integer", "label": "Tempo limite (s)", "min": 1, "max": 30, "step": 1, "defaultValue": 3 }
  ]
}
```

`printers` não tem tipo de schema equivalente (research R5), por isso fica só em `defaults`. O
shell não mescla `defaults` em runtime; o widget aplica os padrões via `Model.readSettings`.

## Como o usuário cadastra (documentado no README)

```bash
omarchy bar set io.github.brunorzm.omaklippy printers \
  '[{"name":"Voron","address":"192.168.1.50"}]'
omarchy bar set io.github.brunorzm.omaklippy refreshIntervalSec 10 --json
```

**`printers` vai sem `--json`.** Com `--json`, o `quickshell ipc call` que o `omarchy bar set`
usa por baixo interpreta o argumento que parece uma lista e o divide: uma lista de um item vira
o objeto solto, e uma lista de dois itens falha com "Too many arguments" (bug do Omarchy
4.0.4-1, verificado em 2026-09-29). Sem `--json`, a lista é gravada como texto JSON. Por isso o
widget aceita `printers` em três formas (`Model.readSettings`):

1. lista JSON (edição direta do `shell.json`), que chega ao QML como sequência do Qt, com
   `Array.isArray` falso, e é lida pelo `length`;
2. texto com uma lista JSON (o `bar set` sem `--json`);
3. um único objeto `{ name, address }` (o que sobra de um `bar set --json` com um item).

Segundo bug encontrado (mesma versão): o `omarchy bar set` altera a entrada no próprio lugar, e
o layout em memória do bar compartilha esse objeto. A partir do segundo `bar set` no mesmo
widget, o `inlineSettingsDelta` não enxerga diferença e o widget em execução não recebe o valor
novo até reiniciar o shell (nem com `reloadConfig`). A edição direta do `shell.json` é sempre
aplicada ao vivo.

Também é possível editar a entrada em `shell.json` diretamente. Com várias instâncias do widget,
use o argumento de posicionamento do `omarchy bar set` para escolher qual entrada alterar.
