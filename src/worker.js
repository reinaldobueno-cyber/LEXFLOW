import puppeteer from '@cloudflare/puppeteer';

const CACHE_KEY = 'controljus:publicacoes:latest';
const ERROR_KEY = 'controljus:last-error';
const DJEN_CACHE_KEY = 'djen:comunicacoes:latest';
const DJEN_ERROR_KEY = 'djen:last-error';
const DEFAULT_CONTROLJUS_URLS = [
  'https://app.controljus.com.br/publicacoes/recortes',
  'https://app.controljus.com.br/publicacoes/recortes/arquivadas'
];
const DEFAULT_DJEN_ENDPOINT = 'https://comunicaapi.pje.jus.br/api/v1/comunicacao';
const DEFAULT_DJEN_OABS = [
  {uf:'GO', numero:'60795', nome:'Igor Lazaro Pires Neto'},
  {uf:'DF', numero:'59142', nome:'Igor Lazaro Pires Neto'},
  {uf:'GO', numero:'74242', nome:'Luiz Fernando Correa Pires'}
];
const DEFAULT_USER_SELECTOR = 'input[type="email"], input[name="email"], input[name="usuario"], input[name="login"], input[type="text"]';
const DEFAULT_PASSWORD_SELECTOR = 'input[type="password"]';

const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

function json(body, status = 200){
  return new Response(JSON.stringify(body), {status, headers: jsonHeaders});
}

function sleep(ms){
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isoDate(value){
  if(!value) return '';
  const dt = new Date(value);
  if(Number.isNaN(dt.getTime())) return '';
  return dt.toISOString().slice(0, 10);
}

function dateOnly(date){
  const dt = new Date(date);
  if(Number.isNaN(dt.getTime())) return '';
  return dt.toISOString().slice(0, 10);
}

function addDays(date, days){
  const dt = new Date(date);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt;
}

function onlyDigits(value){
  return String(value ?? '').replace(/\D/g, '');
}

function formatProcesso(value){
  const digits = onlyDigits(value);
  if(digits.length !== 20) return String(value || '');
  return `${digits.slice(0,7)}-${digits.slice(7,9)}.${digits.slice(9,13)}.${digits.slice(13,14)}.${digits.slice(14,16)}.${digits.slice(16)}`;
}

function decodeEntities(text){
  return String(text ?? '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&aacute;/gi, 'á').replace(/&eacute;/gi, 'é').replace(/&iacute;/gi, 'í').replace(/&oacute;/gi, 'ó').replace(/&uacute;/gi, 'ú')
    .replace(/&Aacute;/g, 'Á').replace(/&Eacute;/g, 'É').replace(/&Iacute;/g, 'Í').replace(/&Oacute;/g, 'Ó').replace(/&Uacute;/g, 'Ú')
    .replace(/&atilde;/gi, 'ã').replace(/&otilde;/gi, 'õ').replace(/&ccedil;/gi, 'ç')
    .replace(/&agrave;/gi, 'à').replace(/&ecirc;/gi, 'ê').replace(/&ocirc;/gi, 'ô')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function stripHtml(html){
  return decodeEntities(String(html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function detectPrazoText(text){
  const raw = String(text ?? '').replace(/\s+/g, ' ').trim();
  if(!raw) return '';
  const normalized = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const words = {um:1,uma:1,dois:2,duas:2,tres:3,quatro:4,cinco:5,seis:6,sete:7,oito:8,nove:9,dez:10,onze:11,doze:12,treze:13,quatorze:14,catorze:14,quinze:15,vinte:20,trinta:30};
  const matches = [];
  const re = /prazo\s+(?:legal\s+)?(?:de|por|para|no prazo de)\s+(\d+|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|vinte|trinta)\s+dias?/g;
  let match;
  while((match = re.exec(normalized))){
    const n = /^\d+$/.test(match[1]) ? Number(match[1]) : words[match[1]];
    if(n && !matches.includes(n)) matches.push(n);
  }
  if(!matches.length){
    const simple = normalized.match(/em\s+(\d+|cinco|dez|quinze|trinta)\s+dias?/);
    if(simple){
      const n = /^\d+$/.test(simple[1]) ? Number(simple[1]) : words[simple[1]];
      if(n) matches.push(n);
    }
  }
  if(!matches.length) return '';
  return matches.length === 1 ? `Prazo mencionado: ${matches[0]} dias` : `Prazos mencionados: ${matches.join(', ')} dias`;
}

function djenEndpoint(env){
  return (env.DJEN_ENDPOINT || DEFAULT_DJEN_ENDPOINT).trim();
}

function parseDjenOabs(env){
  const configured = (env.DJEN_OABS || '').trim();
  if(!configured) return DEFAULT_DJEN_OABS;
  return configured.split(';').map(entry => {
    const [uf, numero, ...nameParts] = entry.split(':').map(part => part.trim());
    return {uf:(uf || '').toUpperCase(), numero:onlyDigits(numero), nome:nameParts.join(':') || `${uf} ${numero}`};
  }).filter(oab => oab.uf && oab.numero);
}

function djenRange(requestUrl){
  const url = new URL(requestUrl);
  const today = new Date();
  const end = url.searchParams.get('fim') || url.searchParams.get('dataFim') || dateOnly(today);
  const start = url.searchParams.get('inicio') || url.searchParams.get('dataInicio') || dateOnly(addDays(end, -6));
  return {start, end};
}

function normalizeDjenComunicacao(item, oab, sourceUrl){
  const texto = stripHtml(item.texto || item.textoComunicacao || '');
  return {
    refId:item.id ? `DJEN-${item.id}` : `DJEN-${oab.uf}-${oab.numero}-${item.numero_processo || crypto.randomUUID()}`,
    id:item.id || '',
    source:'DJEN/CNJ',
    dataDisponibilizacao:item.data_disponibilizacao || '',
    dataPublicacao:item.data_publicacao || '',
    tribunal:item.siglaTribunal || '',
    orgao:item.nomeOrgao || '',
    tipoComunicacao:item.tipoComunicacao || '',
    processo:formatProcesso(item.numero_processo || item.processo || ''),
    processoOriginal:item.numero_processo || '',
    destinatario:item.nomeParte || item.destinatario || '',
    advogado:{nome:oab.nome, uf:oab.uf, numero:oab.numero},
    meio:item.meio || '',
    texto,
    link:item.link || sourceUrl,
    prazoIdentificado:detectPrazoText(texto)
  };
}

async function fetchDjenForOab(env, oab, start, end){
  const url = new URL(djenEndpoint(env));
  url.searchParams.set('numeroOab', oab.numero);
  url.searchParams.set('ufOab', oab.uf);
  url.searchParams.set('dataDisponibilizacaoInicio', start);
  url.searchParams.set('dataDisponibilizacaoFim', end);
  const response = await fetch(url.toString(), {headers:{Accept:'application/json'}});
  if(!response.ok){
    throw new Error(`DJEN ${oab.uf} ${oab.numero}: HTTP ${response.status}`);
  }
  const payload = await response.json();
  const items = Array.isArray(payload.items) ? payload.items : [];
  return {
    oab,
    url:url.toString(),
    count:payload.count ?? items.length,
    items:items.map(item => normalizeDjenComunicacao(item, oab, url.toString()))
  };
}

async function readDjenCache(env){
  return await env.LEXFLOW_CACHE.get(DJEN_CACHE_KEY, {type:'json'});
}

async function writeDjenCache(env, payload){
  await env.LEXFLOW_CACHE.put(DJEN_CACHE_KEY, JSON.stringify(payload));
  await env.LEXFLOW_CACHE.delete(DJEN_ERROR_KEY);
}

async function writeDjenError(env, error){
  await env.LEXFLOW_CACHE.put(DJEN_ERROR_KEY, JSON.stringify({
    message:error.message || 'Erro ao sincronizar DJEN',
    at:new Date().toISOString()
  }));
}

async function readDjenError(env){
  return await env.LEXFLOW_CACHE.get(DJEN_ERROR_KEY, {type:'json'});
}

async function refreshDjen(env, requestUrl = 'https://lexflow.local/api/djen/comunicacoes'){
  const {start, end} = djenRange(requestUrl);
  const oabs = parseDjenOabs(env);
  const settled = await Promise.allSettled(oabs.map(oab => fetchDjenForOab(env, oab, start, end)));
  const results = settled.filter(r => r.status === 'fulfilled').map(r => r.value);
  const errors = settled.filter(r => r.status === 'rejected').map(r => r.reason?.message || 'Erro desconhecido');
  const comunicacoes = [...new Map(results.flatMap(result => result.items).map(item => [item.refId, item])).values()]
    .sort((a, b) => String(b.dataDisponibilizacao).localeCompare(String(a.dataDisponibilizacao)) || String(b.refId).localeCompare(String(a.refId)));

  if(!results.length && errors.length){
    throw new Error(errors.join(' | '));
  }

  const payload = {
    source:'DJEN/CNJ',
    endpoint:djenEndpoint(env),
    collectedAt:new Date().toISOString(),
    periodo:{inicio:start, fim:end},
    oabs,
    comunicacoes,
    diagnostics:{
      requested:oabs.length,
      successful:results.length,
      failed:errors.length,
      totalBruto:results.reduce((sum, result) => sum + Number(result.count || 0), 0),
      errors
    }
  };
  await writeDjenCache(env, payload);
  return payload;
}

async function proxyDjenComunicacoes(request, env){
  const url = new URL(request.url);
  const force = url.searchParams.get('refresh') === '1';
  const cached = await readDjenCache(env);
  if(cached && !force){
    return json({...cached, sync:{status:'cached_djen', comunicacoes:cached.comunicacoes?.length || 0}});
  }
  try{
    const payload = await refreshDjen(env, request.url);
    return json({...payload, sync:{status:'fresh_djen', comunicacoes:payload.comunicacoes.length}});
  }catch(error){
    await writeDjenError(env, error);
    if(cached){
      return json({...cached, sync:{status:'stale_djen_after_error', message:error.message}}, 202);
    }
    return json({
      source:'DJEN/CNJ',
      endpoint:djenEndpoint(env),
      collectedAt:new Date().toISOString(),
      comunicacoes:[],
      sync:{status:'djen_error', message:error.message}
    }, 503);
  }
}

async function proxyDjenStatus(request, env){
  const cached = await readDjenCache(env);
  const lastError = await readDjenError(env);
  return json({
    source:'DJEN/CNJ',
    endpoint:djenEndpoint(env),
    oabs:parseDjenOabs(env),
    cache:{
      hasData:Boolean(cached),
      collectedAt:cached?.collectedAt || null,
      comunicacoes:cached?.comunicacoes?.length || 0,
      periodo:cached?.periodo || null,
      fresh:Boolean(cached)
    },
    lastError
  });
}

function controlJusUrls(env){
  const configured = (env.CONTROLJUS_URLS || env.CONTROLJUS_URL || '').trim();
  const urls = configured
    ? configured.split(',').map(url => url.trim()).filter(Boolean)
    : DEFAULT_CONTROLJUS_URLS;
  return [...new Set(urls)];
}

function normalizeRecorte(item, sourceUrl){
  const associado = Array.isArray(item.associadosEncontrados) ? item.associadosEncontrados[0] : null;
  const processo = item.processoEletronico || item.protocolo || item.publicacaoNumero || '';
  const tribunal = item.orgaoSigla || item.diarioSigla || item.estadoSigla || item.ufString || '';
  const texto = item.textoLimpo || item.textoResumido || item.texto || '';
  return {
    refId: item.publicacaoId ? `CJ-${item.publicacaoId}` : `CJ-${item.id || processo}`,
    dataPublicacao: isoDate(item.publicacaoData || item.disponibilizacaoDataHora || item.dataInsercao),
    processo,
    cliente: associado?.nome || item.relacao || item.titulo || '',
    tribunal,
    tipoPublicacao: item.cadernoNome || item.diarioTipo || item.titulo || 'Recorte ControlJus',
    textoRecorte: texto,
    prazoIdentificado: detectPrazoText(texto),
    prazoFatal: '',
    status: 'Novo',
    responsavel: '',
    observacoes: item.diarioNome ? `Diario: ${item.diarioNome}` : '',
    linkOrigem: sourceUrl,
    controlJusId: item.publicacaoId || item.id || ''
  };
}

function backendBase(env){
  return (env.CONTROLJUS_BACKEND_URL || '').trim();
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

function withQuery(baseUrl, requestUrl){
  const incoming = new URL(requestUrl);
  const target = new URL(baseUrl);
  target.search = incoming.search;
  return target.toString();
}

async function proxiedJsonResponse(response){
  const proxiedHeaders = new Headers(response.headers);
  Object.entries(jsonHeaders).forEach(([key, value]) => proxiedHeaders.set(key, value));
  return new Response(response.body, {status: response.status, headers: proxiedHeaders});
}

async function readCache(env){
  return await env.LEXFLOW_CACHE.get(CACHE_KEY, {type:'json'});
}

async function writeCache(env, payload){
  await env.LEXFLOW_CACHE.put(CACHE_KEY, JSON.stringify(payload));
  await env.LEXFLOW_CACHE.delete(ERROR_KEY);
}

async function writeError(env, error){
  await env.LEXFLOW_CACHE.put(ERROR_KEY, JSON.stringify({
    message:error.message || 'Erro ao sincronizar ControlJus',
    at:new Date().toISOString()
  }));
}

async function readError(env){
  return await env.LEXFLOW_CACHE.get(ERROR_KEY, {type:'json'});
}

function credentialsStatus(env){
  return {
    hasUser:Boolean(env.CONTROLJUS_USER),
    hasPassword:Boolean(env.CONTROLJUS_PASSWORD),
    hasBrowserBinding:Boolean(env.BROWSER),
    hasCacheBinding:Boolean(env.LEXFLOW_CACHE)
  };
}

function assertNativeCollectorConfigured(env){
  const status = credentialsStatus(env);
  if(!status.hasBrowserBinding || !status.hasCacheBinding){
    throw new Error('Cloudflare Browser Run ou KV ainda nao estao configurados.');
  }
  if(!status.hasUser || !status.hasPassword){
    throw new Error('Credenciais CONTROLJUS_USER e CONTROLJUS_PASSWORD ainda nao foram configuradas nos secrets da Cloudflare.');
  }
}

async function clickSubmit(page){
  const clicked = await page.evaluate(() => {
    const candidates = [...document.querySelectorAll('button, input[type="submit"], input[type="button"]')];
    const visible = candidates.filter(el => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    });
    const preferred = visible.find(el => /entrar|login|acessar/i.test(el.innerText || el.value || '')) || visible[0];
    if(!preferred) return false;
    preferred.click();
    return true;
  });
  return Boolean(clicked);
}

async function fetchControlJusWithBrowser(env){
  assertNativeCollectorConfigured(env);
  const urls = controlJusUrls(env);
  const cfg = {
    user: env.CONTROLJUS_USER,
    password: env.CONTROLJUS_PASSWORD,
    userSelector: env.CONTROLJUS_USER_SELECTOR || DEFAULT_USER_SELECTOR,
    passwordSelector: env.CONTROLJUS_PASSWORD_SELECTOR || DEFAULT_PASSWORD_SELECTOR
  };

  const browser = await puppeteer.launch(env.BROWSER);
  const page = await browser.newPage();
  const captured = [];
  const diagnostics = {
    capturedJson:0,
    recortesResponses:0,
    rawRecortes:0,
    tableRows:0,
    visitedUrls:[],
    needsLogin:false,
    loginSubmitted:false,
    passwordVisibleAfterLogin:false,
    finalUrl:'',
    title:'',
    bodyLength:0,
    visibleInputs:0,
    visibleButtons:0,
    loginPageText:''
  };

  page.on('response', async response => {
    const url = response.url();
    const headers = response.headers();
    const contentType = headers['content-type'] || '';
    if(!/json/i.test(contentType)) return;
    if(!/publica|recorte|intim|arquivad|controljus/i.test(url)) return;
    try{
      captured.push({url, status:response.status(), body:await response.json()});
    }catch(e){}
  });

  try{
    await page.goto(urls[0], {waitUntil:'domcontentloaded', timeout:30000});
    const passwordInput = await page.$(cfg.passwordSelector);
    diagnostics.needsLogin = Boolean(passwordInput);
    if(passwordInput){
      diagnostics.visibleInputs = await page.$$eval('input', inputs => inputs.filter(input => {
        const style = window.getComputedStyle(input);
        const rect = input.getBoundingClientRect();
        return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
      }).length).catch(() => 0);
      diagnostics.visibleButtons = await page.$$eval('button, input[type="submit"], input[type="button"]', buttons => buttons.filter(button => {
        const style = window.getComputedStyle(button);
        const rect = button.getBoundingClientRect();
        return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
      }).length).catch(() => 0);

      await page.waitForSelector(cfg.userSelector, {timeout:12000});
      await page.click(cfg.userSelector, {clickCount:3});
      await page.type(cfg.userSelector, cfg.user);
      await page.click(cfg.passwordSelector, {clickCount:3});
      await page.type(cfg.passwordSelector, cfg.password);
      await page.keyboard.press('Enter').catch(() => {});
      await sleep(5000);

      if(await page.$(cfg.passwordSelector)){
        await clickSubmit(page);
        await sleep(7000);
      }
      diagnostics.loginSubmitted = true;
    }

    for(const targetUrl of urls){
      const before = captured.filter(entry => entry.url.includes('/api/recortes/pesquisar')).length;
      await page.goto(targetUrl, {waitUntil:'domcontentloaded', timeout:30000});
      diagnostics.visitedUrls.push(targetUrl);
      await Promise.race([
        new Promise(resolve => {
          const tick = setInterval(() => {
            const current = captured.filter(entry => entry.url.includes('/api/recortes/pesquisar')).length;
            if(current > before){
              clearInterval(tick);
              resolve();
            }
          }, 500);
        }),
        sleep(18000)
      ]);
      await sleep(1200);
    }

    const tableRows = await page.$$eval('table tbody tr', rows => rows.map(row => ({
      cells:[...row.querySelectorAll('th,td')].map(cell => cell.innerText.trim())
    }))).catch(() => []);
    diagnostics.passwordVisibleAfterLogin = Boolean(await page.$(cfg.passwordSelector));
    diagnostics.finalUrl = page.url();
    diagnostics.title = await page.title().catch(() => '');
    const bodyText = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
    diagnostics.bodyLength = bodyText.length;
    diagnostics.loginPageText = diagnostics.passwordVisibleAfterLogin ? bodyText.slice(0, 240) : '';

    const recortes = captured
      .filter(entry => entry.url.includes('/api/recortes/pesquisar'))
      .flatMap(entry => Array.isArray(entry.body?.resultado) ? entry.body.resultado.map(item => ({...item, __sourceUrl:entry.url})) : []);
    const uniqueRecortes = [...new Map(recortes.map(item => [item.publicacaoId || item.id || JSON.stringify(item).slice(0, 100), item])).values()];
    const publicacoes = uniqueRecortes.map(item => normalizeRecorte(item, item.__sourceUrl || urls[0]));

    return {
      source:'ControlJus',
      mode:'cloudflare_browser_run',
      url:urls[0],
      urls,
      collectedAt:new Date().toISOString(),
      publicacoes,
      diagnostics:{
        ...diagnostics,
        capturedJson:captured.length,
        recortesResponses:captured.filter(entry => entry.url.includes('/api/recortes/pesquisar')).length,
        rawRecortes:recortes.length,
        tableRows:tableRows.length
      }
    };
  }finally{
    await browser.close();
  }
}

async function proxyControlJus(request, env){
  const endpoint = backendEndpoint(env, '/api/controljus/publicacoes');
  if(endpoint){
    const response = await fetch(withQuery(endpoint, request.url), {method:'GET', headers:backendHeaders(env)});
    return proxiedJsonResponse(response);
  }

  const url = new URL(request.url);
  const force = url.searchParams.get('refresh') === '1';
  const cached = await readCache(env);
  if(cached && !force){
    return json({...cached, sync:{status:'cached_native'}});
  }
  return refreshControlJusNative(env);
}

async function refreshControlJusNative(env){
  try{
    const result = await fetchControlJusWithBrowser(env);
    await writeCache(env, result);
    return json({...result, sync:{status:'fresh_native', publicacoes:result.publicacoes.length}});
  }catch(error){
    await writeError(env, error);
    const cached = await readCache(env);
    if(cached){
      return json({...cached, sync:{status:'stale_after_error', message:error.message}}, 202);
    }
    return json({
      source:'ControlJus',
      mode:'cloudflare_browser_run',
      collectedAt:new Date().toISOString(),
      publicacoes:[],
      sync:{status:'native_error', message:error.message}
    }, 503);
  }
}

async function proxyControlJusStatus(request, env){
  const endpoint = backendEndpoint(env, '/api/controljus/status');
  if(endpoint){
    const response = await fetch(withQuery(endpoint, request.url), {method:'GET', headers:backendHeaders(env)});
    return proxiedJsonResponse(response);
  }

  const cached = await readCache(env);
  const lastError = await readError(env);
  return json({
    source:'ControlJus',
    mode:'cloudflare_browser_run',
    native:credentialsStatus(env),
    cache:{
      hasData:Boolean(cached),
      collectedAt:cached?.collectedAt || null,
      publicacoes:cached?.publicacoes?.length || 0,
      fresh:Boolean(cached),
      refreshing:false
    },
    lastError
  }, cached || credentialsStatus(env).hasUser && credentialsStatus(env).hasPassword ? 200 : 503);
}

async function refreshControlJusBackend(env, reason, cron = ''){
  const endpoint = backendEndpoint(env, '/api/controljus/refresh');
  if(!endpoint){
    const response = await refreshControlJusNative(env);
    const payload = await response.json().catch(() => ({}));
    return {ok:response.ok || response.status === 202, status:response.status, reason, cron, ...payload};
  }

  const url = new URL(endpoint);
  url.searchParams.set('refresh', '1');
  url.searchParams.set('source', reason);
  if(cron) url.searchParams.set('cron', cron);

  const response = await fetch(url.toString(), {method:'POST', headers:backendHeaders(env)});
  const payload = await response.json().catch(() => ({}));
  return {ok:response.ok || response.status === 202, status:response.status, ...payload};
}

async function proxyControlJusRefresh(request, env){
  if(request.method !== 'POST' && request.method !== 'GET'){
    return json({error:'method_not_allowed'}, 405);
  }
  const result = await refreshControlJusBackend(env, 'manual');
  return json(result, result.status || (result.ok ? 200 : 503));
}

async function proxyDjenRefresh(request, env){
  if(request.method !== 'POST' && request.method !== 'GET'){
    return json({error:'method_not_allowed'}, 405);
  }
  const response = await proxyDjenComunicacoes(new Request(`${new URL(request.url).origin}/api/djen/comunicacoes?refresh=1`), env);
  return response;
}

export default {
  async fetch(request, env){
    if(request.method === 'OPTIONS') return new Response(null, {status:204, headers:jsonHeaders});

    const url = new URL(request.url);
    if(url.pathname === '/api/health'){
      const native = credentialsStatus(env);
      return json({
        ok:true,
        service:'lexflow-cloudflare',
        time:new Date().toISOString(),
        controlJusBackendConfigured:Boolean(backendBase(env)),
        controlJusNativeConfigured:native.hasBrowserBinding && native.hasCacheBinding && native.hasUser && native.hasPassword
      });
    }

    if(url.pathname === '/api/controljus/publicacoes') return proxyControlJus(request, env);
    if(url.pathname === '/api/controljus/status') return proxyControlJusStatus(request, env);
    if(url.pathname === '/api/controljus/refresh') return proxyControlJusRefresh(request, env);
    if(url.pathname === '/api/djen/comunicacoes') return proxyDjenComunicacoes(request, env);
    if(url.pathname === '/api/djen/status') return proxyDjenStatus(request, env);
    if(url.pathname === '/api/djen/refresh') return proxyDjenRefresh(request, env);

    return env.ASSETS.fetch(request);
  },

  async scheduled(controller, env, ctx){
    ctx.waitUntil(
      Promise.allSettled([
        refreshControlJusBackend(env, 'cloudflare_cron', controller.cron)
          .then(result => console.log(JSON.stringify({event:'controljus_cron_sync', cron:controller.cron, result}))),
        refreshDjen(env)
          .then(result => console.log(JSON.stringify({event:'djen_cron_sync', cron:controller.cron, comunicacoes:result.comunicacoes.length})))
      ]).then(results => {
        results.filter(result => result.status === 'rejected').forEach(result => {
          console.error(JSON.stringify({event:'cron_sync_error', cron:controller.cron, message:result.reason?.message || 'Erro desconhecido'}));
        });
      })
    );
  }
};
