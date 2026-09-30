# Teste em hardware: Abrir a interface web pelo painel

Roteiro: [quickstart §5](./quickstart.md#5-teste-em-hardware-princípio-vii). Nenhum comando foi
enviado às impressoras: o botão só abre o navegador. As teclas foram enviadas com `wtype`, sempre
conferindo antes que o painel estava aberto e que a primeira tecla chegou a ele.

```text
Data:                        2026-09-30
Impressoras:                 Voron (voron.local; Klipper v0.13.0-770-gce7002be-dirty, Moonraker v0.11.0-1-g1cfb0c4)
                             Biqu B1 (biqu.local; Klipper v0.13.0-707-gf604aeeea, Moonraker v0.10.0-31-gd5ee171)
Configuração:                a de sempre, sem webUrl (endereço derivado)
Navegador padrão:            chromium.desktop
URL aberta por impressora:   Voron → http://voron.local (Mainsail); Biqu B1 → http://biqu.local (Mainsail)
Tempo até o navegador (SC-003): Voron 677 ms, Biqu 511 ms (do Enter até o Chromium com o foco);
                             painel fechado em 285 ms e 337 ms (FR-011)
Falha simulada (US3):        não validada ao vivo; ver "Falha ao vivo" abaixo
Ciclo de vida:               ver abaixo
Observações:                 ambas ociosas (idle); na Biqu o bico estava a 134 °C, aquecido por outro meio
```

## Moonraker falso (T015, T018, T026), 2026-09-29

- Estados: imprimindo (Pause/Cancel, e-stop, Open web UI em linha própria), ocioso (e-stop e
  Open web UI), `shutdown` (só Open web UI, FR-013), endereço inválido (offline "invalid
  address", só Open web UI), sem impressoras (sem área de ações).
- URLs: `127.0.0.1:7126` → `http://127.0.0.1:7126`; `127.0.0.1:7125` → `http://127.0.0.1`
  (porta 7125 retirada); `webUrl: http://127.0.0.1:7125/web` → `/web` na 7125; `webUrl: "a b"`
  → sem botão, status normal; `address: "a b"` + `webUrl` válido → botão abre o `webUrl`.
- Teclado: `j` até a última parada (Open web UI) e Enter; troca de impressora pelo dropdown e
  acionamento logo em seguida abre a nova.
- FR-014: com o `POST` do Pause atrasado 10 s, Open web UI continuou habilitado com o spinner do
  Pause girando, abriu o navegador e fechou o painel; o falso registrou um único `POST
  /printer/print/pause`, concluído depois.
- Glifo `\u{f03cc}` confere com "open in new" na fonte do bar.

## Falha ao vivo (T021): não foi possível

O plano (research R5) contava com `~/.local/bin` antes de `/usr/share/omarchy/bin` no `PATH` do
shell. Estava errado: o `PATH` conferido era o do terminal do assistente. O do processo
`quickshell -n -p /usr/share/omarchy/shell` começa com `/usr/share/omarchy/bin`, então o launcher
falso (criado com aprovação do usuário) foi ignorado, e o launcher real abriu o navegador
normalmente. O arquivo foi removido logo em seguida, e `command -v omarchy-launch-browser` voltou
a `/usr/share/omarchy/bin/omarchy-launch-browser`.

Simular a falha exigiria mudar arquivos do sistema (root) ou reiniciar o shell do desktop com
outro ambiente. Nenhum dos dois vale o risco para este teste. A US3 fica coberta pelos testes
automáticos (`parseWebLaunchResult`, slot `web` em `acceptCommandResult`, `failureText` em
qualquer estado, limpeza na troca de impressora e na próxima ação) e pela leitura do código do
`BarWidget` (o painel só fecha com `result.ok`).

## Ciclo de vida (T027)

- Escape fecha; `omarchy-shell shell summon|hide` abre e fecha (com dois monitores, o summon abre
  o painel nos dois).
- `omarchy-restart-shell` com o navegador aberto pelo botão: o Chromium continuou (mesmo PID).
- `disable` → nenhum processo `omarchy-launch-browser`/`curl` sobrando; `enable` → widget de
  volta, sem impressoras (conhecido), painel vazio certo; `shell.json` restaurado do backup.
- Conferido pelo usuário em 2026-09-30: o clique com o mouse em Open web UI abriu a interface
  web da Voron e da Biqu; FR-015: os botões do meio e direito no ícone não fazem nada.
- Remover (2026-09-30, depois do push de `7f5e7df`, com cópia da pasta no scratchpad):
  `omarchy plugin remove --yes` apagou a pasta e a entrada no `shell.json`; nenhum processo
  `curl`/`omarchy-launch-browser` sobrou; nada do plugin fora da pasta. Reinstalado do GitHub
  (`omarchy plugin add … --enable --yes`, `7f5e7df`, conteúdo igual ao da cópia), Voron e Biqu
  recadastradas: painel com Voron idle, Emergency stop e Open web UI.
