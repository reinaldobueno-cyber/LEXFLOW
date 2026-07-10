import http from 'node:http';
import {spawn} from 'node:child_process';

const host = process.env.LEXFLOW_A3_HOST || '127.0.0.1';
const port = Number(process.env.LEXFLOW_A3_PORT || 48731);
const allowedOrigin = process.env.LEXFLOW_ORIGIN || 'https://lexflow.reinaldo-bueno.workers.dev';

function send(res, status, body, headers = {}){
  res.writeHead(status, {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
    ...headers
  });
  res.end(body);
}

function clean(value, max = 1000){
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function isSafeUrl(value){
  try{
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol);
  }catch(error){
    return false;
  }
}

function openUrl(target){
  const url = String(target || '');
  if(!isSafeUrl(url)) throw new Error('URL invalida para abertura local.');
  if(process.platform === 'win32'){
    spawn('cmd', ['/c', 'start', '', url], {detached:true, stdio:'ignore'}).unref();
    return;
  }
  if(process.platform === 'darwin'){
    spawn('open', [url], {detached:true, stdio:'ignore'}).unref();
    return;
  }
  spawn('xdg-open', [url], {detached:true, stdio:'ignore'}).unref();
}

async function readJson(req){
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if(!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function requestFromUrl(url){
  return {
    action:clean(url.searchParams.get('action'), 80),
    requestId:clean(url.searchParams.get('requestId'), 120),
    processo:clean(url.searchParams.get('processo'), 80),
    tribunal:clean(url.searchParams.get('tribunal'), 40),
    publicacaoId:clean(url.searchParams.get('publicacaoId'), 120),
    origem:clean(url.searchParams.get('origem'), 40),
    motivo:clean(url.searchParams.get('motivo'), 300),
    tenantId:clean(url.searchParams.get('tenantId'), 120),
    sourceUrl:clean(url.searchParams.get('sourceUrl'), 1000),
    lexflowUrl:clean(url.searchParams.get('lexflowUrl'), 300)
  };
}

function htmlResponse(payload){
  const lines = [
    ['Request ID', payload.requestId],
    ['Processo', payload.processo],
    ['Tribunal', payload.tribunal],
    ['Origem', payload.origem],
    ['Motivo', payload.motivo],
    ['URL aberta', payload.openedUrl || 'Nenhuma URL oficial informada para abertura automatica.']
  ].map(([label, value]) => `<p><b>${label}:</b> ${String(value || '-')}</p>`).join('');
  return `<!doctype html><meta charset="utf-8"><title>LexFlow A3</title>
    <body style="font-family:Arial,sans-serif; margin:32px; color:#101828;">
      <h1>LexFlow A3</h1>
      <p>Solicitacao recebida pelo agente local. O PIN do certificado deve ser informado somente no fluxo do navegador/driver do token.</p>
      ${lines}
    </body>`;
}

const server = http.createServer(async (req, res) => {
  try{
    if(req.method === 'OPTIONS') return send(res, 204, '');
    const url = new URL(req.url, `http://${host}:${port}`);

    if(url.pathname === '/health'){
      return send(res, 200, JSON.stringify({
        ok:true,
        service:'lexflow-a3-local-agent',
        host,
        port,
        allowedOrigin,
        time:new Date().toISOString()
      }));
    }

    if(url.pathname !== '/open'){
      return send(res, 404, JSON.stringify({error:'not_found'}));
    }

    const payload = req.method === 'POST'
      ? {...requestFromUrl(url), ...(await readJson(req))}
      : requestFromUrl(url);

    if(payload.action !== 'open_restricted_file'){
      return send(res, 400, JSON.stringify({error:'invalid_action'}));
    }

    let openedUrl = '';
    if(isSafeUrl(payload.sourceUrl)){
      openedUrl = payload.sourceUrl;
      openUrl(openedUrl);
    }

    if(req.headers.accept?.includes('text/html')){
      return send(res, 200, htmlResponse({...payload, openedUrl}), {'Content-Type':'text/html; charset=utf-8'});
    }
    return send(res, 200, JSON.stringify({
      ok:true,
      message:openedUrl
        ? 'Fonte autenticada aberta no navegador local.'
        : 'Solicitacao recebida. Configure a URL oficial da publicacao para abertura automatica.',
      openedUrl,
      request:payload
    }));
  }catch(error){
    return send(res, 500, JSON.stringify({error:'a3_agent_error', message:error.message || 'Erro no agente A3'}));
  }
});

server.listen(port, host, () => {
  console.log(`LexFlow A3 Local Agent: http://${host}:${port}`);
  console.log(`Configure no LexFlow: http://${host}:${port}/open`);
});
