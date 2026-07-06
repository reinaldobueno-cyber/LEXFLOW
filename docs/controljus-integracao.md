# Integracao ControlJus

URL alvo:

`https://app.controljus.com.br/publicacoes/recortes/arquivadas`

## Regra de seguranca

Nao coloque usuario e senha do ControlJus no `index.html`, no GitHub Pages ou em qualquer arquivo commitado.

O LexFlow publicado e um frontend estatico. Ele deve receber os recortes por importacao de JSON/CSV ou por uma API propria no futuro. A coleta autenticada deve rodar localmente ou em backend privado.

## Fluxo atual

1. Crie um arquivo `.env` a partir de `.env.example`.
2. Preencha `CONTROLJUS_USER` e `CONTROLJUS_PASSWORD` no `.env`.
3. Instale o Playwright, se ainda nao existir:

```bash
npm install -D playwright
```

4. Rode o coletor:

```bash
node tools/controljus-fetch.mjs
```

5. O coletor gera um arquivo em `data/controljus-recortes-*.json`.
6. No LexFlow, clique em `Conectar ControlJus` e importe esse arquivo.

## Proxima validacao

O primeiro acesso real deve confirmar:

- se o login usa campos simples de usuario/senha;
- se a tela carrega os recortes por API JSON;
- quais sao os nomes reais dos campos retornados;
- se existe exportacao CSV/Excel oficial no ControlJus;
- se ha paginacao/filtros de data que precisam ser percorridos.

Depois dessa validacao, o coletor deve ser ajustado para transformar a resposta do ControlJus diretamente no formato de publicacoes do LexFlow.
