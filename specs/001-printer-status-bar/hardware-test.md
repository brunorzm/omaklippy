# Registro do teste em hardware: 001-printer-status-bar

Princípio VII da constituição: a fatia só está concluída com este registro completo. Roteiro em
[quickstart.md](./quickstart.md).

```text
Data:                  2026-09-29
Resultado:             APROVADO. Fatia 001 concluída.
Impressoras:           Voron (voron.local, 192.168.0.110)
                       Biqu B1 (biqu.local, 192.168.0.100, hostname "biqu")
Versão do Klipper:     Voron v0.13.0-770-gce7002be-dirty · Biqu v0.13.0-707-gf604aeeea
Versão do Moonraker:   Voron v0.11.0-1-g1cfb0c4 · Biqu v0.10.0-31-gd5ee171
Acesso:                sem autenticação (este computador em trusted_clients)
Omarchy:               4.0.4-1, dois monitores (eDP-1 + DP-3), temas Solitude, Catppuccin Latte, Tokyo Night
```

## Cenários

Legenda: [x] verificado na impressora real · [s] verificado com o Moonraker falso local
(fixtures) e coberto por teste automatizado.

```text
US1 ícone
  [x] ociosa (Voron e Biqu)
  [x] imprimindo: barra de progresso (Voron; 0% no aquecimento, 16%, 27%, 64%, 80%)
  [x] pausada (Voron: preenchimento atenuado; pouco visível com progresso baixo, ver Melhorias)
  [x] fim da impressão: `complete` → ociosa (Voron)
  [x] cancelamento → ociosa (Voron: `paused` → `standby` direto, sem o estado `cancelled`)
  [x] erro: cor de alerta + selo (Biqu; vermelho no Tokyo Night, cinza no Solitude)
  [x] offline: ícone esmaecido (Biqu desligada; Wi-Fi do computador desligado)
  [x] troca de tema (Catppuccin Latte, Tokyo Night): ícone, selo e painel acompanham
  [s] barra vertical

US2 falhas
  [x] impressora desligada na tomada (Biqu): offline em ≤ 8 s, sem dados antigos, volta sozinha
  [x] Wi-Fi do computador desligado: tudo offline e volta sozinho (usuário)
  [x] endereço inexistente e endereço inválido
  [x] shutdown do MCU (Biqu: termistor do bico fora da faixa): erro com a mensagem do Klipper
      em parágrafos legíveis; depois do conserto, volta a ociosa sem selo
  [x] Klipper parado (Biqu): 503 "Klippy Host not connected", sem temperaturas
  [x] FIRMWARE_RESTART (Voron, ~5 s): 503 "Klippy Disconnected" → 503 "Klippy Host not
      connected" → 200 `startup` → ready; erro legível por 1–2 ciclos e volta sozinho
  [x] 401 (Biqu sem 192.168.0.0/16 em trusted_clients): "acesso não autorizado — libere…"
  [x] curl ausente (binário inexistente): erro "curl não encontrado"
  [s] M112 não executado: mesmo caminho do shutdown real do MCU acima (webhooks.state shutdown)

US3 painel
  [x] detalhes ociosa, imprimindo, pausada e erro (arquivo, %, restante, bico/mesa atual/alvo)
  [x] restante "—" enquanto o tempo de impressão ainda é zero (Voron aquecendo)
  [x] restante calculado (Voron: 36m a 16%, 9m a 64%, 4m a 80%)
  [x] abre com clique no ícone; fecha com clique fora, Escape, novo clique e `hide`
  [x] troca para outro painel (Wi-Fi) fecha o nosso

US4 seletor
  [x] mais relevante ao abrir (Biqu em erro acima da Voron imprimindo; Biqu offline → Voron)
  [x] troca pelo teclado (j/k + Enter) e pelo mouse
  [x] seleção mantida ao reabrir; ícone segue a escolha (decisão de 2026-09-29)
  [s] nomes repetidos

US5 cadastro
  [x] vazio, cadastro ao vivo, remoção ao vivo

Ciclo de vida
  [x] clique · Escape · summon · hide · troca de painel · desabilitar · reabilitar ·
      reiniciar o shell · remover e reinstalar do GitHub

Desempenho
  [x] 5 impressoras (3 inexistentes): no máximo 3 curl simultâneos, painel abre em ~60 ms
```

## Fixtures reais capturadas

`standby` (Voron), `printing`, `paused`, `complete`, `klippy-restarting`, `startup` (Voron);
`shutdown`, `klippy-disconnected`, `unauthorized`, `biqu-standby` (Biqu B1). Falhas de rede
reais: `refused`, `dns`, `timeout`, `bad-url`. A de `cancelled` não existe nesta impressora
(o macro de cancelamento leva direto a `standby`); fica a sintética.

## Bugs do Omarchy 4.0.4 encontrados

1. `omarchy bar set --json` divide listas JSON no `quickshell ipc call` (lista de um item vira
   objeto; dois itens: "Too many arguments"). Contorno no plugin: `printers` aceita lista, texto
   JSON ou objeto único.
2. Só o primeiro `omarchy bar set` num widget chega ao widget em execução (a entrada é alterada
   no próprio lugar e o `inlineSettingsDelta` não vê diferença). Contorno: editar o `shell.json`.
3. Hot reload não recarrega o código de um plugin de terceiros. Contorno: `omarchy-restart-shell`.
4. Widgets recriados na reconexão de um monitor recebem as configurações da última montagem
   completa da barra (`ModuleSlot.moduleSettings = entrySettings(entry)`) e não recebem as
   mudanças feitas depois (`Bar.applySettingsDelta` só alcança os widgets antigos). Reproduzido
   renomeando a Biqu ao vivo. Contorno: `omarchy-restart-shell`.

## Melhorias para próximas fatias (não bloqueiam)

- Distinguir melhor "pausada" no ícone com progresso baixo (p.ex. um marcador de pausa), já
  apontado na análise (U1).
- Mostrar `display_status.message` do Klipper (p.ex. "Aquecendo a Camara") no painel.

## Observações

O tema Solitude define `urgent` = `#565d60` (cinza), por isso o erro ganhou um selo além da cor.
