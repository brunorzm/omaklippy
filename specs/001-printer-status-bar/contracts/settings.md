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
  '[{"name":"Voron","address":"192.168.1.50"}]' --json
omarchy bar set io.github.brunorzm.omaklippy refreshIntervalSec 10 --json
```

Também é possível editar a entrada em `shell.json` diretamente. Com várias instâncias do widget,
use o argumento de posicionamento do `omarchy bar set` para escolher qual entrada alterar.
