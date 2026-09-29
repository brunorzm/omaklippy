# Registro do teste em hardware: 001-printer-status-bar

Princípio VII da constituição: a fatia só está concluída com este registro completo. Roteiro em
[quickstart.md](./quickstart.md).

```text
Data:                        2026-09-29 (parcial, durante a implementação)
Impressora(s) / placa:       Voron (voron.local, 192.168.0.110); Biqu B1 (biqu.local, hostname "biqu")
Versão do Klipper:           Voron v0.13.0-770-gce7002be-dirty; Biqu v0.13.0-707-gf604aeeea
Versão do Moonraker:         Voron v0.11.0-1-g1cfb0c4; Biqu v0.10.0-31-gd5ee171
Acesso:                      200 sem autenticação (este computador está em trusted_clients)
```

## Verificado na implementação

Legenda: [x] verificado · [~] verificado com o Moonraker falso local (fixtures), falta na
impressora real · [ ] pendente.

```text
US1 ícone:    [x] ociosa (Voron real)  [x] imprimindo (Voron real, aquecendo a câmara: 0%)  [x] pausada (Voron real: painel "pausada · 2%", restante 20m; ícone com preenchimento atenuado, pouco visível com progresso baixo)  [x] fim (Voron real: `complete` → ociosa)  [x] cancelado (Voron real: `paused` → `standby` direto; o macro de cancelamento dela não emite `cancelled`) → ociosa  [x] troca de tema (Catppuccin Latte e Tokyo Night: ícone, selo vermelho de erro e painel acompanham)
              [x] barra vertical (com o Moonraker falso)
US2 falhas:   [x] desligada (Biqu B1 na tomada: offline em ≤ 8 s, sem dados antigos, volta sozinha como erro)  [ ] Wi-Fi  [~] sem resposta (servidor travado)  [x] endereço inexistente
              [x] shutdown real do MCU (Biqu B1: termistor do bico fora da faixa; ícone com selo e mensagem do Klipper legível no painel)  [x] FIRMWARE_RESTART real na Voron (~5 s: 503 "Klippy Disconnected" → 503 "Klippy Host not connected" → 200 `startup` → ready; o plugin mostra erro com mensagem legível e volta sozinho)  [ ] M112  [x] klipper parado (503 real na Biqu B1: "Klippy Host not connected", sem temperaturas)  [x] 401 real (Biqu B1 sem 192.168.0.0/16 em trusted_clients)  [x] curl ausente (binário inexistente)
US3 painel:   [x] detalhes da Voron ociosa  [x] detalhes imprimindo (Voron real: arquivo, 0%, restante "—", mesa 105/118 °C)  [x] impressão real avançando (Voron: 16% com restante 36m, depois 27%)
              [~] restante "—"  [x] fecha com Escape e hide  [x] abre com clique no ícone e fecha com clique fora (usuário)
US4 seletor:  [x] mais relevante (Biqu em erro acima da Voron imprimindo; Biqu offline → Voron imprimindo passa a ser a destacada)  [x] troca pelo teclado (j/k + Enter)  [x] troca pelo mouse (usuário)  [x] ícone segue a escolha (decisão de 2026-09-29)
              [x] seleção mantida ao reabrir  [x] nomes repetidos (testes)
US5 cadastro: [x] vazio  [x] cadastro ao vivo  [x] remoção ao vivo
Ciclo de vida: [x] clique  [x] Escape  [x] summon  [x] hide  [x] troca de painel  [x] desabilitar
               [x] reabilitar (sem as configurações, comportamento do Omarchy)  [x] reiniciar shell  [x] remover (e reinstalar do GitHub: volta na mesma posição, sem as configurações)
Desempenho:   [x] 5 impressoras (3 inexistentes): no máximo 3 curl simultâneos, painel abre em ~60 ms
```

## Pendências para concluir a fatia

2. `FIRMWARE_RESTART` na Biqu → volta a ociosa.
4. Desligar o Wi-Fi do computador → tudo offline e volta sozinho (fazer por último; derruba a sessão do assistente).
9. Fixture real de `cancelled`: não obtida; o macro de cancelamento da Voron leva direto a
   `standby`. Fica a sintética. Já reais: `standby`, `printing`, `paused`, `complete`, `shutdown`,
   `klippy-disconnected`, `klippy-restarting`, `startup`, `unauthorized`.

10. ~~Investigar configurações vazias depois de reconectar o monitor~~ **Diagnosticado (bug do
    Omarchy 4.0.4)**: `Bar.applySettingsDelta` aplica mudanças de configuração só nos widgets em
    execução. Widgets criados depois, quando um monitor é reconectado, recebem as configurações
    da última reconstrução completa da barra (`ModuleSlot.moduleSettings =
    entrySettings(entry)`). Reproduzido: com a Biqu renomeada ao vivo para "Biqu B1 (teste)",
    depois de reconectar o monitor a instância recriada mostrou "Biqu B1", embora o `shell.json`
    e o `listShellConfig` tivessem o nome novo. Contorno: `omarchy-restart-shell` depois de mudar
    configurações. Não é corrigível no plugin. Visto de novo: a instância recriada também não
    recebe mudanças feitas **depois** da recriação (o nome "(teste)" continuou no monitor externo
    após restaurar "Biqu B1" no `shell.json`).

Melhoria possível (não bloqueia): distinguir melhor "pausada" no ícone com progresso baixo
(p.ex. um marcador de pausa), já apontado na análise (U1).

Observações: o tema em uso tem `urgent` = `#565d60` (cinza), por isso o erro ganhou um selo além
da cor.
