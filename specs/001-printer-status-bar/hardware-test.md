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
US1 ícone:    [x] ociosa (Voron real)  [x] imprimindo (Voron real, aquecendo a câmara: 0%)  [~] pausada  [ ] fim/cancelado  [ ] troca de tema
              [x] barra vertical (com o Moonraker falso)
US2 falhas:   [x] desligada (Biqu B1 na tomada: offline em ≤ 8 s, sem dados antigos, volta sozinha como erro)  [ ] Wi-Fi  [~] sem resposta (servidor travado)  [x] endereço inexistente
              [x] shutdown real do MCU (Biqu B1: termistor do bico fora da faixa; ícone com selo e mensagem do Klipper legível no painel)  [ ] M112  [x] klipper parado (503 real na Biqu B1: "Klippy Host not connected", sem temperaturas)  [x] 401 real (Biqu B1 sem 192.168.0.0/16 em trusted_clients)  [x] curl ausente (binário inexistente)
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

1. Na Voron: pausa/retomada (opcional, mexe na impressão real) e o fim da impressão → ociosa.
2. `FIRMWARE_RESTART` na Biqu → volta a ociosa.
4. Desligar o Wi-Fi do computador → tudo offline e volta sozinho (fazer por último; derruba a sessão do assistente).
7. Trocar o tema do Omarchy e conferir o ícone.
9. Capturar as fixtures reais que faltam (T048): `paused`, `complete`, `cancelled`, `startup`.
   Já reais: `standby`, `printing`, `shutdown`, `klippy-disconnected`, `unauthorized`.

10. **Investigar**: depois de reconectar o monitor externo, a instância do widget no monitor do
    notebook ficou com as configurações vazias ("nenhuma impressora configurada"), embora o
    `shell.json` e o `listShellConfig` do shell tivessem as impressoras. Reiniciar o shell
    resolveu. Reproduzir desconectando e reconectando o monitor e ver se o problema é do repasse
    de `settings` do shell (provável) ou do widget.

Observações: o tema em uso tem `urgent` = `#565d60` (cinza), por isso o erro ganhou um selo além
da cor.
