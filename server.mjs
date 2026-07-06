import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fetchControlJusPublicacoes} from './tools/controljus-client.mjs';

const root = process.cwd();
const port = Number(process.env.PORT || 8787);

function send(res, status, body, headers = {}){
  res.writeHead(status, {
    'Access-Control-Allow-Origin':'*',
    'Access-Control-Allow-Methods':'GET, OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type',
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

const server = http.createServer(async (req, res) => {
  try{
    if(req.method === 'OPTIONS') return send(res, 204, '');

    const url = new URL(req.url, `http://${req.headers.host}`);
    if(url.pathname === '/api/health'){
      return send(res, 200, JSON.stringify({ok:true, service:'lexflow-controljus', time:new Date().toISOString()}), {'Content-Type':'application/json; charset=utf-8'});
    }

    if(url.pathname === '/api/controljus/publicacoes'){
      const result = await fetchControlJusPublicacoes();
      return send(res, 200, JSON.stringify({
        source:result.source,
        url:result.url,
        collectedAt:result.collectedAt,
        publicacoes:result.publicacoes
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
