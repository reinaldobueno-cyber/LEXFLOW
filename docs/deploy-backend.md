# Deploy do backend ControlJus

O backend e necessario para a sincronizacao direta, porque ele guarda as credenciais em variaveis de ambiente e executa o Playwright para acessar o ControlJus.

## Recomendacao

Use um ambiente que rode container Docker:

- Render
- Railway
- Fly.io
- VPS propria

Cloudflare Pages/Workers nao e o caminho principal para este backend, porque o coletor usa Chromium/Playwright. Cloudflare pode ser usado depois como DNS, proxy ou tunnel apontando para um backend que rode container.

## Render

1. Crie um novo serviço `Web Service`.
2. Conecte o repositório `reinaldobueno-cyber/LEXFLOW`.
3. Escolha deploy por Docker.
4. Configure as variáveis:

```text
CONTROLJUS_URL=https://app.controljus.com.br/publicacoes/recortes/arquivadas
CONTROLJUS_USER=seu_usuario_real
CONTROLJUS_PASSWORD=sua_senha_real
CONTROLJUS_HEADLESS=true
CONTROLJUS_CACHE_TTL_MS=900000
CONTROLJUS_API_TOKEN=um_token_longo_para_proteger_a_api
```

Os seletores podem ficar com os valores de `.env.example`.

5. Depois do deploy, teste:

```text
https://SEU-BACKEND.onrender.com/api/health
https://SEU-BACKEND.onrender.com/api/controljus/publicacoes
https://SEU-BACKEND.onrender.com/api/controljus/publicacoes?refresh=1
https://SEU-BACKEND.onrender.com/api/controljus/refresh
https://SEU-BACKEND.onrender.com/api/controljus/status
```

Se `CONTROLJUS_API_TOKEN` estiver definido, envie:

```text
Authorization: Bearer SEU_TOKEN
```

6. No Cloudflare Worker, configure:

```bash
npx wrangler secret put CONTROLJUS_BACKEND_URL
npx wrangler secret put CONTROLJUS_BACKEND_TOKEN
```

`CONTROLJUS_BACKEND_URL` pode ser a base do backend ou a rota completa `/api/controljus/publicacoes`.

Depois, no LexFlow, clique em `Sincronizar ControlJus`.

## Local

```bash
npm install
npx playwright install chromium
npm run dev
```

Acesse:

```text
http://localhost:8787
```
