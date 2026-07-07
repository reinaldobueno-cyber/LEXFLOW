const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

function backendBase(env){
  const backend = (env.CONTROLJUS_BACKEND_URL || '').trim();
  if(!backend) return '';
  return backend;
}

function backendEndpoint(env, apiPath){
  const backend = backendBase(env);
  if(!backend) return '';
  const backendUrl = new URL(backend);
  if(backendUrl.pathname === '/' || backendUrl.pathname === ''){
    return backend.replace(/\/$/, '') + apiPath;
  }
  return `${backendUrl.origin}${apiPath}`;
}

function backendHeaders(env){
  const headers = new Headers();
  headers.set('Accept', 'application/json');
  if(env.CONTROLJUS_BACKEND_TOKEN){
    headers.set('Authorization', `Bearer ${env.CONTROLJUS_BACKEND_TOKEN}`);
  }
  return headers;
}

function backendNotConfiguredResponse(){
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

async function proxiedJsonResponse(response){
  const proxiedHeaders = new Headers(response.headers);
  Object.entries(jsonHeaders).forEach(([key, value]) => proxiedHeaders.set(key, value));
  return new Response(response.body, {
    status: response.status,
    headers: proxiedHeaders
  });
}

async function proxyControlJus(request, env){
  const endpoint = backendEndpoint(env, '/api/controljus/publicacoes');
  if(!endpoint){
    return backendNotConfiguredResponse();
  }

  const response = await fetch(withQuery(endpoint, request.url), {
    method: 'GET',
    headers:backendHeaders(env)
  });
  return proxiedJsonResponse(response);
}

async function proxyControlJusStatus(request, env){
  const endpoint = backendEndpoint(env, '/api/controljus/status');
  if(!endpoint){
    return json({
      source: 'ControlJus',
      cache: {hasData: false, collectedAt: null, publicacoes: 0, fresh: false, refreshing: false},
      lastError: {message: 'Backend autenticado ainda nao configurado.', at: new Date().toISOString()}
    }, 503);
  }

  const response = await fetch(withQuery(endpoint, request.url), {method: 'GET', headers:backendHeaders(env)});
  return proxiedJsonResponse(response);
}

async function refreshControlJusBackend(env, reason, cron = ''){
  const endpoint = backendEndpoint(env, '/api/controljus/refresh');
  if(!endpoint){
    return {
      ok:false,
      status:503,
      sync:{status:'backend_not_configured', reason, cron},
      time:new Date().toISOString()
    };
  }

  const url = new URL(endpoint);
  url.searchParams.set('refresh', '1');
  url.searchParams.set('source', reason);
  if(cron) url.searchParams.set('cron', cron);

  const response = await fetch(url.toString(), {
    method:'POST',
    headers:backendHeaders(env)
  });
  const payload = await response.json().catch(() => ({}));
  return {
    ok:response.ok || response.status === 202,
    status:response.status,
    ...payload
  };
}

async function proxyControlJusRefresh(request, env){
  if(request.method !== 'POST' && request.method !== 'GET'){
    return json({error:'method_not_allowed'}, 405);
  }
  const result = await refreshControlJusBackend(env, 'manual');
  return json(result, result.status || (result.ok ? 200 : 503));
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

    if(url.pathname === '/api/controljus/status'){
      return proxyControlJusStatus(request, env);
    }

    if(url.pathname === '/api/controljus/refresh'){
      return proxyControlJusRefresh(request, env);
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(controller, env, ctx){
    ctx.waitUntil(
      refreshControlJusBackend(env, 'cloudflare_cron', controller.cron)
        .then(result => console.log(JSON.stringify({event:'controljus_cron_sync', cron:controller.cron, result})))
        .catch(error => console.error(JSON.stringify({event:'controljus_cron_sync_error', cron:controller.cron, message:error.message})))
    );
  }
};
