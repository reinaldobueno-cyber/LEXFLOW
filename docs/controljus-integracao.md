# Integracao ControlJus

URL alvo:

`https://app.controljus.com.br/publicacoes/recortes/arquivadas`

## Regra de seguranca

Nao coloque usuario e senha do ControlJus no `index.html`, no GitHub Pages ou em qualquer arquivo commitado.

O LexFlow publicado e um frontend estatico. Ele deve receber os recortes por importacao de JSON/CSV ou por uma API propria no futuro. A coleta autenticada deve rodar localmente ou em backend privado.

## Fluxo direto com API privada

O consumo direto nao pode acontecer apenas no GitHub Pages, porque o GitHub Pages nao executa backend e nao pode guardar credenciais.

Para testar direto nesta maquina:

1. Crie um arquivo `.env` a partir de `.env.example`.
2. Preencha `CONTROLJUS_USER` e `CONTROLJUS_PASSWORD` no `.env`.
3. Instale as dependencias:

```bash
npm install
npx playwright install chromium
```

4. Suba o LexFlow com API:

```bash
npm run dev
```

5. Acesse:

```text
http://localhost:8787
```

6. Clique em `Conectar ControlJus` e depois em `Sincronizar agora`.

A rota usada pelo painel e:

```text
http://localhost:8787/api/controljus/publicacoes?refresh=1
```

Em producao, essa API deve ser publicada em um backend privado, por exemplo Render, Railway, VPS, servidor do escritorio ou outro ambiente com variaveis de ambiente seguras. O Cloudflare Worker do LexFlow passa a ser a porta fixa:

```text
https://lexflow.reinaldo-bueno.workers.dev/api/controljus/publicacoes
```

## Fluxo por arquivo, fallback

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

Depois dessa validacao, o backend deve ser publicado em ambiente privado e configurado no modal `Conectar ControlJus`.
