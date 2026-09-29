# Registro do teste em hardware: 001-printer-status-bar

Princípio VII da constituição: a fatia só está concluída com este registro completo. Roteiro em
[quickstart.md](./quickstart.md).

```text
Data:                        2026-09-29 (parcial, durante a implementação)
Impressora(s) / placa:       Voron (voron.local, 192.168.0.110)
Versão do Klipper:           v0.13.0-770-gce7002be-dirty
Versão do Moonraker:         v0.11.0-1-g1cfb0c4
Acesso:                      200 sem autenticação (este computador está em trusted_clients)
```

## Verificado na implementação

Legenda: [x] verificado · [~] verificado com o Moonraker falso local (fixtures), falta na
impressora real · [ ] pendente.

```text
US1 ícone:    [x] ociosa (Voron real)  [~] imprimindo  [~] pausada  [ ] fim/cancelado  [ ] troca de tema
              [x] barra vertical (com o Moonraker falso)
US2 falhas:   [ ] desligada  [ ] Wi-Fi  [~] sem resposta (servidor travado)  [x] endereço inexistente
              [ ] M112  [~] klipper parado (503)  [ ] 401 real  [x] curl ausente (binário inexistente)
US3 painel:   [x] detalhes da Voron ociosa  [~] detalhes imprimindo  [ ] comparação com o Mainsail durante impressão
              [~] restante "—"  [x] fecha com Escape e hide  [ ] fecha com clique fora / novo clique
US4 seletor:  [x] mais relevante  [x] troca pelo teclado (j/k + Enter)  [ ] troca pelo mouse
              [x] seleção mantida ao reabrir  [x] nomes repetidos (testes)
US5 cadastro: [x] vazio  [x] cadastro ao vivo  [x] remoção ao vivo
Ciclo de vida: [ ] clique  [x] Escape  [x] summon  [x] hide  [x] troca de painel  [x] desabilitar
               [x] reabilitar (sem as configurações, comportamento do Omarchy)  [x] reiniciar shell  [ ] remover
Desempenho:   [x] 5 impressoras (3 inexistentes): no máximo 3 curl simultâneos, painel abre em ~60 ms
```

## Pendências para concluir a fatia

1. Com uma impressão real na Voron: ícone e painel imprimindo e pausada, fim ou cancelamento, e
   comparação com o Mainsail (±1 ciclo).
2. `M112` → erro com selo; `FIRMWARE_RESTART` → volta a ociosa.
3. `sudo systemctl stop klipper` no Pi → erro "Klippy Host not connected".
4. Desligar a Voron e desligar o Wi-Fi do computador → offline em até 8 s e volta sozinho.
5. Tirar o IP de `trusted_clients` → erro "acesso não autorizado".
6. Clique do mouse: abrir e fechar pelo ícone, fechar clicando fora, selecionar na lista.
7. Trocar o tema do Omarchy e conferir o ícone.
8. `omarchy plugin remove` (depois de commitar e enviar o repositório; o comando apaga a pasta).
9. Capturar as fixtures reais que faltam (T048).

Observações: o tema em uso tem `urgent` = `#565d60` (cinza), por isso o erro ganhou um selo além
da cor.
