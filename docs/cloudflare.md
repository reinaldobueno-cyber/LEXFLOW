# Deploy Cloudflare do LexFlow

URL oficial publicada:

```text
https://lexflow.reinaldo-bueno.workers.dev
```

Endpoint fixo operacional para recortes ControlJus:

```text
https://lexflow.reinaldo-bueno.workers.dev/api/controljus/publicacoes
```

Health check:

```text
https://lexflow.reinaldo-bueno.workers.dev/api/health
```

## Arquitetura

O Cloudflare Worker serve o frontend estatico do LexFlow e expõe as rotas `/api/*`.

O coletor autenticado do ControlJus usa Playwright/Chromium. Por isso ele nao roda diretamente dentro do Worker. O Worker funciona como porta fixa do LexFlow e, quando configurado, encaminha para um backend privado em Render, Railway, Fly.io, VPS ou outro ambiente que rode Chromium.

Fluxo:

```text
LexFlow Cloudflare
  /api/controljus/publicacoes
    -> backend privado com Playwright
      -> ControlJus autenticado
```

## Deploy

```bash
npm install
npm run build:cloudflare
npm run deploy:cloudflare
```

## Configurar backend privado

Quando o backend autenticado estiver publicado, configure no Worker:

```bash
npx wrangler secret put CONTROLJUS_BACKEND_URL
```

Valor esperado:

```text
https://SEU-BACKEND/api/controljus/publicacoes
```

Se o backend exigir token, configure tambem:

```bash
npx wrangler secret put CONTROLJUS_BACKEND_TOKEN
```

Enquanto `CONTROLJUS_BACKEND_URL` nao estiver configurado, a rota `/api/controljus/publicacoes` responde `503 backend_not_configured`, sem quebrar o frontend.

## Sincronizacao

O botao `Sincronizar ControlJus` do LexFlow chama:

```text
https://lexflow.reinaldo-bueno.workers.dev/api/controljus/publicacoes?refresh=1
```

O Worker encaminha para o backend privado. O frontend faz merge por `controlJusId`, `refId` ou processo/data/texto, preservando status, responsavel e prazos ja tratados pelo usuario.
