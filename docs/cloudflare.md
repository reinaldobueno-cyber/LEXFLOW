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

Status do cache/sincronizacao:

```text
https://lexflow.reinaldo-bueno.workers.dev/api/controljus/status
```

Acionamento de refresh sem retornar a lista completa:

```text
https://lexflow.reinaldo-bueno.workers.dev/api/controljus/refresh
```

## Arquitetura

O Cloudflare Worker serve o frontend estatico do LexFlow e expõe as rotas `/api/*`.

O coletor autenticado do ControlJus roda prioritariamente dentro da propria Cloudflare usando Browser Run, a plataforma de navegador headless da Cloudflare. O cache da ultima coleta fica em KV.

Como fallback, o Worker ainda aceita `CONTROLJUS_BACKEND_URL` para encaminhar para um backend privado em Render, Railway, Fly.io, VPS ou outro ambiente que rode Chromium.

Fluxo:

```text
LexFlow Cloudflare
  /api/controljus/publicacoes
    -> Browser Run + KV
      -> ControlJus autenticado
```

## Deploy

```bash
npm install
npm run build:cloudflare
npm run deploy:cloudflare
```

## Configurar credenciais ControlJus na Cloudflare

Configure os secrets:

```bash
npx wrangler secret put CONTROLJUS_USER
npx wrangler secret put CONTROLJUS_PASSWORD
```

Opcionalmente, configure a URL e seletores se a tela real de login exigir ajuste:

```bash
npx wrangler secret put CONTROLJUS_URL
npx wrangler secret put CONTROLJUS_USER_SELECTOR
npx wrangler secret put CONTROLJUS_PASSWORD_SELECTOR
```

Depois rode:

```bash
npm run deploy:cloudflare
```

## Fallback com backend privado

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

Enquanto `CONTROLJUS_USER` e `CONTROLJUS_PASSWORD` nao estiverem configurados, a rota `/api/controljus/publicacoes` responde `503 native_error`, sem quebrar o frontend.

## Sincronizacao

O botao `Sincronizar ControlJus` do LexFlow chama:

```text
https://lexflow.reinaldo-bueno.workers.dev/api/controljus/publicacoes?refresh=1
```

O Worker coleta via Browser Run ou encaminha para o backend privado de fallback. O frontend faz merge por `controlJusId`, `refId` ou processo/data/texto, preservando status, responsavel e prazos ja tratados pelo usuario.

## Sincronizacao automatica

O Worker tambem tem Cron Trigger configurado em `wrangler.jsonc`:

```text
*/30 11-23 * * mon-fri
```

A Cloudflare executa cron em UTC. Esta expressão equivale a uma tentativa de refresh a cada 30 minutos, de segunda a sexta, aproximadamente entre 08:00 e 20:30 no horario de Brasilia.

O Cron chama o refresh por:

```text
/api/controljus/refresh
```

Essa rota aquece o cache em KV sem trafegar a lista completa para o navegador.
