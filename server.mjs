import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fetchControlJusPublicacoes} from './tools/controljus-client.mjs';

const root = process.cwd();
const port = Number(process.env.PORT || 8787);
const cacheTtlMs = Number(process.env.CONTROLJUS_CACHE_TTL_MS || 15 * 60 * 1000);
let controlJusCache = null;
let controlJusRefresh = null;
let lastControlJusError = null;

function send(res, status, body, headers = {}){
  res.writeHead(status, {
    'Access-Control-Allow-Origin':'*',
    'Access-Control-Allow-Methods':'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type, Authorization',
    ...headers
  });
  res.end(body);
}

function contentType(file){
  if(file.endsWith('.html')) return 'text/html; charset=utf-8';
  if(file.endsWith('.css')) return 'text/css; charset=utf-8';
  if(file.endsWith('.js') || file.endsWith('.mjs')) return 'text/javascript; charset=utf-8';
  if(file.endsWith('.json')) return 'application/json; charset=utf-8';
  return 'text/plain; charset=utf-8';
}

function timeout(ms){
  return new Promise(resolve => setTimeout(() => resolve({timedOut:true}), ms));
}

function isAuthorized(req){
  const token = process.env.CONTROLJUS_API_TOKEN;
  if(!token) return true;
  const header = req.headers.authorization || '';
  return header === `Bearer ${token}`;
}

function cacheIsFresh(){
  if(!controlJusCache?.collectedAt) return false;
  const age = Date.now() - new Date(controlJusCache.collectedAt).getTime();
  return age >= 0 && age < cacheTtlMs;
}

function controlJusCacheStatus(){
  return {
    hasData:Boolean(controlJusCache),
    collectedAt:controlJusCache?.collectedAt || null,
    publicacoes:controlJusCache?.publicacoes?.length || 0,
    fresh:cacheIsFresh(),
    refreshing:Boolean(controlJusRefresh),
    ttlMs:cacheTtlMs
  };
}

async function refreshControlJus(){
  if(controlJusRefresh) return controlJusRefresh;
  lastControlJusError = null;
  controlJusRefresh = fetchControlJusPublicacoes()
    .then(result => {
      controlJusCache = {
        source:result.source,
        url:result.url,
        collectedAt:result.collectedAt,
        publicacoes:result.publicacoes,
        diagnostics:result.diagnostics
      };
      return controlJusCache;
    })
    .catch(error => {
      lastControlJusError = {
        message:error.message || 'Erro ao sincronizar ControlJus',
        at:new Date().toISOString()
      };
      throw error;
    })
    .finally(() => {
      controlJusRefresh = null;
    });
  return controlJusRefresh;
}

const server = http.createServer(async (req, res) => {
  try{
    if(req.method === 'OPTIONS') return send(res, 204, '');

    const url = new URL(req.url, `http://${req.headers.host}`);
    if(url.pathname === '/api/health'){
      return send(res, 200, JSON.stringify({
        ok:true,
        service:'lexflow-controljus',
        commit:process.env.RENDER_GIT_COMMIT || '',
        time:new Date().toISOString(),
        cache:controlJusCacheStatus(),
        lastError:lastControlJusError
      }), {'Content-Type':'application/json; charset=utf-8'});
    }

    if(url.pathname === '/api/controljus/publicacoes'){
      if(!isAuthorized(req)){
        return send(res, 401, JSON.stringify({error:'unauthorized'}), {'Content-Type':'application/json; charset=utf-8'});
      }

      const force = url.searchParams.get('refresh') === '1';
      if(controlJusCache && !force && cacheIsFresh()){
        return send(res, 200, JSON.stringify({...controlJusCache, sync:{status:'cached', cacheTtlMs}}), {'Content-Type':'application/json; charset=utf-8'});
      }

      const result = await Promise.race([refreshControlJus(), timeout(25000)]);
      if(result?.timedOut){
        return send(res, 202, JSON.stringify({
          source:'ControlJus',
          collectedAt:new Date().toISOString(),
          publicacoes:controlJusCache?.publicacoes || [],
          diagnostics:controlJusCache?.diagnostics || null,
          sync:{status:'processing', message:'A sincronizacao ainda esta em andamento. Tente novamente em alguns segundos.'}
        }), {'Content-Type':'application/json; charset=utf-8'});
      }

      return send(res, 200, JSON.stringify({...result, sync:{status:'fresh', cacheTtlMs}}), {'Content-Type':'application/json; charset=utf-8'});
    }

    if(url.pathname === '/api/controljus/refresh'){
      if(!isAuthorized(req)){
        return send(res, 401, JSON.stringify({error:'unauthorized'}), {'Content-Type':'application/json; charset=utf-8'});
      }

      const result = await Promise.race([refreshControlJus(), timeout(25000)]);
      if(result?.timedOut){
        return send(res, 202, JSON.stringify({
          source:'ControlJus',
          collectedAt:new Date().toISOString(),
          cache:controlJusCacheStatus(),
          diagnostics:controlJusCache?.diagnostics || null,
          sync:{status:'processing', message:'A sincronizacao foi acionada e ainda esta em andamento.'}
        }), {'Content-Type':'application/json; charset=utf-8'});
      }

      return send(res, 200, JSON.stringify({
        source:'ControlJus',
        collectedAt:result.collectedAt,
        cache:controlJusCacheStatus(),
        diagnostics:result.diagnostics,
        sync:{status:'fresh', publicacoes:result.publicacoes?.length || 0, cacheTtlMs}
      }), {'Content-Type':'application/json; charset=utf-8'});
    }

    if(url.pathname === '/api/controljus/status'){
      if(!isAuthorized(req)){
        return send(res, 401, JSON.stringify({error:'unauthorized'}), {'Content-Type':'application/json; charset=utf-8'});
      }
      return send(res, 200, JSON.stringify({
        source:'ControlJus',
        cache:controlJusCacheStatus(),
        lastError:lastControlJusError
      }), {'Content-Type':'application/json; charset=utf-8'});
    }

    const relative = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const file = path.resolve(root, relative);
    if(!file.startsWith(root)) return send(res, 403, 'Forbidden');
    const body = await fs.readFile(file);
    return send(res, 200, body, {'Content-Type':contentType(file)});
  }catch(e){
    const status = e.code === 'ENOENT' ? 404 : 500;
    const body = status === 404
      ? 'Not found'
      : JSON.stringify({error:e.message || 'Erro interno'});
    return send(res, status, body, {'Content-Type':status === 404 ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8'});
  }
});

server.listen(port, () => {
  console.log(`LexFlow com API ControlJus: http://localhost:${port}`);
});
