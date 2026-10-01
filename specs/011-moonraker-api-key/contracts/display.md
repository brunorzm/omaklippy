# Contract: exibição (fatia 011)

Mesmos componentes da tela de cadastro (009): `Button`, `TextField` (`password: true` nos campos de
chave), `ConfirmDialog`, tokens do shell.

## Tela Printers… (impressora selecionada)

```text
│ API key …a1b2                         │  caption, dim — só com chave; nunca a chave inteira
│ [ 🔑 Set API key ]  [ Remove API key ] │  Remove só com chave; Remove abre ConfirmDialog (Back)
│ [ ••••••••••••••••  ] [ Save ]        │  aberto por "Set API key"; o campo começa vazio
│ invalid API key                        │  antes de gravar, se a chave tiver caracteres inválidos
│ [ 🗑 Remove Voron ]                    │  (009)
```

## Add by address (009)

```text
│ biqu.local needs an API key            │  conferência respondeu 401/403
│ [ ••••••••••••••••  ]                 │  campo da chave (senha)
│ [ Check again ]  [ Add anyway ]        │  confere de novo com a chave; Add anyway grava sem conferir (com a chave, se digitada)
```

## Resultados da busca (009)

```text
│   biqu         biqu.local     [ Add ] │
│   needs an API key                    │  caption, para resultados que responderam 401
```

## Motivos no painel principal

| Situação | Texto |
|----------|-------|
| recusa, sem chave | `unauthorized — allow this computer in trusted_clients or set an API key` |
| recusa, com chave | `API key rejected` |
| chave inválida na configuração | `invalid API key` |

## Teclado

`setKey`, `removeKey`, o campo da chave e `Save` entram na ordem dos botões da tela (depois do
`Remove <nome>`); no formulário em `needsKey`, o campo da chave e `Check again` depois de `submit`.
Campos de chave seguem o padrão dos campos da 009 (Enter grava/confere, Escape devolve o foco).
