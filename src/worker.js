const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

function json(body, status = 200){
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders
  });
}

function withQuery(baseUrl, requestUrl){
  const incoming = new URL(requestUrl);
  const target = new URL(baseUrl);
  target.search = incoming.search;
  return target.toString();
}

async function proxyControlJus(request, env){
  const backend = (env.CONTROLJUS_BACKEND_URL || '').trim();
  if(!backend){
    return json({
      source: 'ControlJus',
      collectedAt: new Date().toISOString(),
      publicacoes: [],
      sync: {
        status: 'backend_not_configured',
        message: 'Cloudflare esta ativo, mas o backend autenticado do ControlJus ainda nao foi configurado. O coletor com Playwright precisa rodar em Render, Railway, Fly.io, VPS ou outro ambiente com Chromium.'
      }
    }, 503);
  }

  const backendUrl = new URL(backend);
  const endpoint = backendUrl.pathname === '/' || backendUrl.pathname === ''
    ? backend.replace(/\/$/, '') + '/api/controljus/publicacoes'
    : backend;
  const headers = new Headers();
  headers.set('Accept', 'application/json');
  if(env.CONTROLJUS_BACKEND_TOKEN){
    headers.set('Authorization', `Bearer ${env.CONTROLJUS_BACKEND_TOKEN}`);
  }

  const response = await fetch(withQuery(endpoint, request.url), {
    method: 'GET',
    headers
  });
  const proxiedHeaders = new Headers(response.headers);
  Object.entries(jsonHeaders).forEach(([key, value]) => proxiedHeaders.set(key, value));
  return new Response(response.body, {
    status: response.status,
    headers: proxiedHeaders
  });
}

export default {
  async fetch(request, env){
    if(request.method === 'OPTIONS') return new Response(null, {status: 204, headers: jsonHeaders});

    const url = new URL(request.url);
    if(url.pathname === '/api/health'){
      return json({
        ok: true,
        service: 'lexflow-cloudflare',
        time: new Date().toISOString(),
        controlJusBackendConfigured: Boolean((env.CONTROLJUS_BACKEND_URL || '').trim())
      });
    }

    if(url.pathname === '/api/controljus/publicacoes'){
      return proxyControlJus(request, env);
    }

    return env.ASSETS.fetch(request);
  }
};
