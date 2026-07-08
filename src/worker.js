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

const AUTH_SESSION_TTL_SECONDS = 60 * 60 * 12;
const MASTER_TENANT_ID = 'tenant_master';

function nowIso(){
  return new Date().toISOString();
}

function tenantKey(id){ return `tenant:${id}`; }
function userKey(id){ return `user:${id}`; }
function userEmailKey(email){ return `user-email:${String(email || '').trim().toLowerCase()}`; }
function sessionKey(token){ return `session:${token}`; }
function settingsKey(tenantId){ return `settings:${tenantId}`; }
function auditKey(tenantId, id = crypto.randomUUID()){ return `audit:${tenantId}:${Date.now()}:${id}`; }

function bytesToBase64Url(bytes){
  let str = '';
  new Uint8Array(bytes).forEach(byte => { str += String.fromCharCode(byte); });
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value){
  const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
}

function randomToken(bytes = 32){
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return bytesToBase64Url(data);
}

async function hashPassword(password, saltValue = ''){
  const salt = saltValue ? base64UrlToBytes(saltValue) : crypto.getRandomValues(new Uint8Array(16));
  try{
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({name:'PBKDF2', hash:'SHA-256', salt, iterations:180000}, key, 256);
    return `pbkdf2:sha256:180000:${bytesToBase64Url(salt)}:${bytesToBase64Url(bits)}`;
  }catch(error){
    return hashPasswordSha256(password, salt);
  }
}

async function hashPasswordSha256(password, salt){
  const encoded = new TextEncoder().encode(password);
  const joined = new Uint8Array(salt.length + encoded.length);
  joined.set(salt, 0);
  joined.set(encoded, salt.length);
  const digest = await crypto.subtle.digest('SHA-256', joined);
  return `sha256:salted:1:${bytesToBase64Url(salt)}:${bytesToBase64Url(digest)}`;
}

async function verifyPassword(password, storedHash){
  const parts = String(storedHash || '').split(':');
  if(parts.length !== 5 || !['pbkdf2','sha256'].includes(parts[0])) return false;
  const expected = parts[0] === 'sha256'
    ? await hashPasswordSha256(password, base64UrlToBytes(parts[3]))
    : await hashPassword(password, parts[3]);
  const a = new TextEncoder().encode(expected);
  const b = new TextEncoder().encode(storedHash);
  if(a.length !== b.length) return false;
  let diff = 0;
  for(let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function encryptionKey(env){
  const secret = env.SETTINGS_ENCRYPTION_KEY || env.AUTH_SECRET || '';
  if(!secret) throw new Error('SETTINGS_ENCRYPTION_KEY nao configurada.');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function encryptSecret(value, env){
  if(!value) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({name:'AES-GCM', iv}, await encryptionKey(env), new TextEncoder().encode(value));
  return {alg:'AES-GCM', iv:bytesToBase64Url(iv), data:bytesToBase64Url(encrypted)};
}

async function decryptSecret(encrypted, env){
  if(!encrypted?.iv || !encrypted?.data) return '';
  const decrypted = await crypto.subtle.decrypt(
    {name:'AES-GCM', iv:base64UrlToBytes(encrypted.iv)},
    await encryptionKey(env),
    base64UrlToBytes(encrypted.data)
  );
  return new TextDecoder().decode(decrypted);
}

function maskSecret(value){
  if(!value) return '';
  return '••••••••';
}

async function readBody(request){
  return await request.json().catch(() => ({}));
}

function publicUser(user, tenant){
  return {
    id:user.id,
    email:user.email,
    name:user.name,
    role:user.role,
    tenantId:user.tenantId,
    tenant:tenant ? {id:tenant.id, name:tenant.name, plan:tenant.plan, status:tenant.status} : null
  };
}

function publicUserRow(user){
  return {
    id:user.id,
    tenantId:user.tenantId,
    email:user.email,
    name:user.name,
    role:user.role,
    status:user.status,
    createdAt:user.createdAt,
    updatedAt:user.updatedAt
  };
}

async function auditLog(env, tenantId, actor, action, metadata = {}){
  const record = {
    id:crypto.randomUUID(),
    tenantId:tenantId || actor?.tenantId || MASTER_TENANT_ID,
    actorUserId:actor?.id || '',
    actorEmail:actor?.email || '',
    action,
    metadata,
    createdAt:nowIso()
  };
  await env.LEXFLOW_CACHE.put(auditKey(record.tenantId, record.id), JSON.stringify(record));
  return record;
}

async function ensureMasterUser(env){
  const email = (env.MASTER_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = env.MASTER_ADMIN_PASSWORD || '';
  if(!email || !password) return {configured:false};

  const existingUserId = await env.LEXFLOW_CACHE.get(userEmailKey(email));
  if(existingUserId) return {configured:true};

  const tenant = {
    id:MASTER_TENANT_ID,
    name:'LexFlow Master',
    plan:'master',
    status:'active',
    createdAt:nowIso()
  };
  const user = {
    id:crypto.randomUUID(),
    tenantId:tenant.id,
    email,
    name:env.MASTER_ADMIN_NAME || 'Reinaldo',
    role:'master',
    status:'active',
    passwordHash:await hashPassword(password),
    createdAt:nowIso(),
    updatedAt:nowIso()
  };
  await env.LEXFLOW_CACHE.put(tenantKey(tenant.id), JSON.stringify(tenant));
  await env.LEXFLOW_CACHE.put(userKey(user.id), JSON.stringify(user));
  await env.LEXFLOW_CACHE.put(userEmailKey(email), user.id);
  await auditLog(env, tenant.id, user, 'user.bootstrap_master', {email});
  return {configured:true};
}

function authTokenFromRequest(request){
  const auth = request.headers.get('Authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

async function getSession(request, env){
  const token = authTokenFromRequest(request);
  if(!token) return null;
  const session = await env.LEXFLOW_CACHE.get(sessionKey(token), {type:'json'});
  if(!session || new Date(session.expiresAt).getTime() < Date.now()) return null;
  const user = await env.LEXFLOW_CACHE.get(userKey(session.userId), {type:'json'});
  if(!user || user.status !== 'active') return null;
  const tenant = await env.LEXFLOW_CACHE.get(tenantKey(user.tenantId), {type:'json'});
  if(user.role !== 'master' && (!tenant || tenant.status !== 'active')) return null;
  return {token, session, user, tenant};
}

async function requireAuth(request, env){
  const auth = await getSession(request, env);
  if(!auth) return json({error:'unauthorized', message:'Sessao invalida ou expirada.'}, 401);
  return auth;
}

function requireMaster(auth){
  if(auth.user.role !== 'master') return json({error:'forbidden', message:'Acesso restrito ao Administrador Master.'}, 403);
  return null;
}

function canManageTenantUsers(auth, tenantId){
  return auth.user.role === 'master' || (auth.user.role === 'admin' && auth.user.tenantId === tenantId);
}

async function handleLogin(request, env){
  try{
    const bootstrap = await ensureMasterUser(env);
    if(!bootstrap.configured){
      return json({error:'auth_not_configured', message:'Configure MASTER_ADMIN_EMAIL e MASTER_ADMIN_PASSWORD nos secrets da Cloudflare.'}, 503);
    }
    const body = await readBody(request);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const userId = email ? await env.LEXFLOW_CACHE.get(userEmailKey(email)) : '';
    const user = userId ? await env.LEXFLOW_CACHE.get(userKey(userId), {type:'json'}) : null;
    if(!user || user.status !== 'active' || !(await verifyPassword(password, user.passwordHash))){
      await auditLog(env, MASTER_TENANT_ID, {email}, 'auth.login_failed', {email});
      return json({error:'invalid_credentials', message:'E-mail ou senha invalidos.'}, 401);
    }
    const tenant = await env.LEXFLOW_CACHE.get(tenantKey(user.tenantId), {type:'json'});
    if(user.role !== 'master' && (!tenant || tenant.status !== 'active')){
      return json({error:'tenant_inactive', message:'Conta do escritorio inativa.'}, 403);
    }
    const token = randomToken();
    const expiresAt = new Date(Date.now() + AUTH_SESSION_TTL_SECONDS * 1000).toISOString();
    await env.LEXFLOW_CACHE.put(sessionKey(token), JSON.stringify({userId:user.id, tenantId:user.tenantId, role:user.role, expiresAt}), {expirationTtl:AUTH_SESSION_TTL_SECONDS});
    await auditLog(env, user.tenantId, user, 'auth.login', {});
    return json({token, expiresAt, user:publicUser(user, tenant)});
  }catch(error){
    return json({error:'auth_bootstrap_error', message:error.message || 'Erro ao iniciar autenticacao.'}, 500);
  }
}

async function handleSession(request, env){
  const auth = await getSession(request, env);
  if(!auth) return json({authenticated:false}, 200);
  return json({authenticated:true, user:publicUser(auth.user, auth.tenant)});
}

async function handleLogout(request, env){
  const auth = await getSession(request, env);
  if(auth){
    await env.LEXFLOW_CACHE.delete(sessionKey(auth.token));
    await auditLog(env, auth.user.tenantId, auth.user, 'auth.logout', {});
  }
  return json({ok:true});
}

async function listTenants(env){
  const list = await env.LEXFLOW_CACHE.list({prefix:'tenant:'});
  const tenants = await Promise.all(list.keys.map(key => env.LEXFLOW_CACHE.get(key.name, {type:'json'})));
  return tenants.filter(Boolean);
}

async function listUsers(env, tenantId){
  const list = await env.LEXFLOW_CACHE.list({prefix:'user:'});
  const users = await Promise.all(list.keys.map(key => env.LEXFLOW_CACHE.get(key.name, {type:'json'})));
  return users.filter(user => user && (!tenantId || user.tenantId === tenantId)).map(publicUserRow);
}

async function handleTenants(request, env, auth){
  const denied = requireMaster(auth);
  if(denied) return denied;
  if(request.method === 'GET') return json({tenants:await listTenants(env)});
  const body = await readBody(request);
  if(request.method === 'PUT' || request.method === 'PATCH'){
    const id = body.id || new URL(request.url).searchParams.get('id');
    const current = id ? await env.LEXFLOW_CACHE.get(tenantKey(id), {type:'json'}) : null;
    if(!current) return json({error:'not_found', message:'Contrato nao encontrado.'}, 404);
    const next = {
      ...current,
      name:String(body.name ?? current.name).trim(),
      responsible:body.responsible ?? current.responsible ?? '',
      email:body.email ?? current.email ?? '',
      plan:body.plan ?? current.plan ?? 'starter',
      status:body.status ?? current.status ?? 'active',
      userLimit:Number(body.userLimit ?? current.userLimit ?? 5),
      processLimit:Number(body.processLimit ?? current.processLimit ?? 0),
      updatedAt:nowIso()
    };
    await env.LEXFLOW_CACHE.put(tenantKey(next.id), JSON.stringify(next));
    await auditLog(env, next.id, auth.user, 'tenant.update', {tenantId:next.id});
    return json({tenant:next});
  }
  if(request.method !== 'POST') return json({error:'method_not_allowed'}, 405);
  const tenant = {
    id:body.id || crypto.randomUUID(),
    name:String(body.name || '').trim(),
    responsible:body.responsible || '',
    email:body.email || '',
    plan:body.plan || 'starter',
    status:body.status || 'active',
    userLimit:Number(body.userLimit || 5),
    processLimit:Number(body.processLimit || 0),
    createdAt:nowIso()
  };
  if(!tenant.name) return json({error:'validation_error', message:'Nome do escritorio e obrigatorio.'}, 400);
  await env.LEXFLOW_CACHE.put(tenantKey(tenant.id), JSON.stringify(tenant));
  await auditLog(env, tenant.id, auth.user, 'tenant.create', {tenantId:tenant.id, name:tenant.name});
  return json({tenant}, 201);
}

async function handleUsers(request, env, auth){
  const url = new URL(request.url);
  const selectedTenant = auth.user.role === 'master' && url.searchParams.get('tenantId') ? url.searchParams.get('tenantId') : auth.user.tenantId;
  if(!canManageTenantUsers(auth, selectedTenant)) return json({error:'forbidden', message:'Sem permissao para gerenciar usuarios deste escritorio.'}, 403);

  if(request.method === 'GET') return json({users:await listUsers(env, selectedTenant)});

  const body = await readBody(request);
  const id = body.id || url.searchParams.get('id');

  if(request.method === 'DELETE'){
    const user = id ? await env.LEXFLOW_CACHE.get(userKey(id), {type:'json'}) : null;
    if(!user || user.tenantId !== selectedTenant) return json({error:'not_found'}, 404);
    if(user.role === 'master') return json({error:'forbidden', message:'Usuario master nao pode ser excluido.'}, 403);
    await env.LEXFLOW_CACHE.delete(userKey(user.id));
    await env.LEXFLOW_CACHE.delete(userEmailKey(user.email));
    await auditLog(env, selectedTenant, auth.user, 'user.delete', {userId:user.id, email:user.email});
    return json({ok:true});
  }

  if(request.method === 'PUT' || request.method === 'PATCH'){
    const current = id ? await env.LEXFLOW_CACHE.get(userKey(id), {type:'json'}) : null;
    if(!current || current.tenantId !== selectedTenant) return json({error:'not_found'}, 404);
    const nextEmail = String(body.email ?? current.email).trim().toLowerCase();
    const next = {
      ...current,
      name:String(body.name ?? current.name).trim(),
      email:nextEmail,
      role:['admin','advogado','assistente'].includes(body.role) ? body.role : current.role,
      status:['active','inactive'].includes(body.status) ? body.status : current.status,
      updatedAt:nowIso()
    };
    if(body.password) next.passwordHash = await hashPassword(String(body.password));
    if(next.email !== current.email){
      const existing = await env.LEXFLOW_CACHE.get(userEmailKey(next.email));
      if(existing && existing !== current.id) return json({error:'validation_error', message:'E-mail ja cadastrado.'}, 400);
      await env.LEXFLOW_CACHE.delete(userEmailKey(current.email));
      await env.LEXFLOW_CACHE.put(userEmailKey(next.email), next.id);
    }
    await env.LEXFLOW_CACHE.put(userKey(next.id), JSON.stringify(next));
    await auditLog(env, selectedTenant, auth.user, 'user.update', {userId:next.id, email:next.email});
    return json({user:publicUserRow(next)});
  }

  if(request.method !== 'POST') return json({error:'method_not_allowed'}, 405);
  const email = String(body.email || '').trim().toLowerCase();
  const name = String(body.name || '').trim();
  const password = String(body.password || '');
  const role = ['admin','advogado','assistente'].includes(body.role) ? body.role : 'advogado';
  if(!email || !name || !password) return json({error:'validation_error', message:'Nome, e-mail e senha sao obrigatorios.'}, 400);
  if(await env.LEXFLOW_CACHE.get(userEmailKey(email))) return json({error:'validation_error', message:'E-mail ja cadastrado.'}, 400);
  const user = {
    id:crypto.randomUUID(),
    tenantId:selectedTenant,
    email,
    name,
    role,
    status:body.status || 'active',
    passwordHash:await hashPassword(password),
    createdAt:nowIso(),
    updatedAt:nowIso()
  };
  await env.LEXFLOW_CACHE.put(userKey(user.id), JSON.stringify(user));
  await env.LEXFLOW_CACHE.put(userEmailKey(email), user.id);
  await auditLog(env, selectedTenant, auth.user, 'user.create', {userId:user.id, email});
  return json({user:publicUserRow(user)}, 201);
}

async function handleSettings(request, env, auth){
  const tenantId = auth.user.role === 'master' && new URL(request.url).searchParams.get('tenantId')
    ? new URL(request.url).searchParams.get('tenantId')
    : auth.user.tenantId;
  if(auth.user.role !== 'master' && tenantId !== auth.user.tenantId) return json({error:'forbidden'}, 403);
  const current = await env.LEXFLOW_CACHE.get(settingsKey(tenantId), {type:'json'}) || {tenantId, integrations:{}};
  if(request.method === 'GET'){
    const masked = structuredClone(current);
    if(masked.integrations?.controljus?.apiKeyEncrypted) masked.integrations.controljus.apiKeyMasked = maskSecret('x');
    if(masked.integrations?.djen?.tokenEncrypted) masked.integrations.djen.tokenMasked = maskSecret('x');
    delete masked.integrations?.controljus?.apiKeyEncrypted;
    delete masked.integrations?.djen?.tokenEncrypted;
    return json({settings:masked});
  }
  if(request.method !== 'PUT' && request.method !== 'POST') return json({error:'method_not_allowed'}, 405);
  const body = await readBody(request);
  const next = {
    tenantId,
    integrations:{
      controljus:{
        baseUrl:body.controljus?.baseUrl || current.integrations?.controljus?.baseUrl || '',
        apiKeyEncrypted:current.integrations?.controljus?.apiKeyEncrypted || null
      },
      djen:{
        authType:body.djen?.authType || current.integrations?.djen?.authType || 'public',
        serviceUrl:body.djen?.serviceUrl || current.integrations?.djen?.serviceUrl || DEFAULT_DJEN_ENDPOINT,
        frequency:body.djen?.frequency || current.integrations?.djen?.frequency || 'manual',
        oabs:Array.isArray(body.djen?.oabs) ? body.djen.oabs.map(oab => ({uf:String(oab.uf || '').toUpperCase(), numero:onlyDigits(oab.numero), nome:String(oab.nome || '')})).filter(oab => oab.uf && oab.numero) : (current.integrations?.djen?.oabs || []),
        tokenEncrypted:current.integrations?.djen?.tokenEncrypted || null
      }
    },
    updatedAt:nowIso(),
    updatedBy:auth.user.id
  };
  if(body.controljus?.apiKey) next.integrations.controljus.apiKeyEncrypted = await encryptSecret(body.controljus.apiKey, env);
  if(body.djen?.token) next.integrations.djen.tokenEncrypted = await encryptSecret(body.djen.token, env);
  await env.LEXFLOW_CACHE.put(settingsKey(tenantId), JSON.stringify(next));
  await auditLog(env, tenantId, auth.user, 'settings.update', {sections:Object.keys(body)});
  return json({ok:true});
}

async function handleAuditLog(request, env, auth){
  const tenantId = auth.user.role === 'master' && new URL(request.url).searchParams.get('tenantId')
    ? new URL(request.url).searchParams.get('tenantId')
    : auth.user.tenantId;
  const list = await env.LEXFLOW_CACHE.list({prefix:`audit:${tenantId}:`});
  const rows = await Promise.all(list.keys.slice(-100).map(key => env.LEXFLOW_CACHE.get(key.name, {type:'json'})));
  return json({items:rows.filter(Boolean).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))});
}

async function handleIntegrationTest(request, env, auth){
  const body = await readBody(request);
  await auditLog(env, auth.user.tenantId, auth.user, 'integration.test', {type:body.type || 'unknown'});
  return json({ok:true, message:'Estrutura de teste registrada. A validacao real sera feita pelo conector especifico.'});
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

function normalizePersonName(value){
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function restrictedReasonFromText(text){
  const normalized = normalizePersonName(text);
  if(!normalized) return '';
  const checks = [
    {pattern:'SEGREDO DE JUSTICA', reason:'Processo em segredo de justiça'},
    {pattern:'SIGILOSO', reason:'Documento ou ato sigiloso'},
    {pattern:'SIGILO', reason:'Documento ou ato sigiloso'},
    {pattern:'NAO FORAM PUBLICADOS', reason:'Arquivos da intimação não publicados'},
    {pattern:'ARQUIVOS DA INTIMACAO NAO FORAM PUBLICADOS', reason:'Arquivos da intimação não publicados'},
    {pattern:'ARQUIVOS DIGITAIS INDISPONIVEIS', reason:'Arquivos digitais indisponíveis'},
    {pattern:'INDISPONIVEIS NAO SAO DO TIPO PUBLICO', reason:'Arquivos indisponíveis por restrição pública'},
    {pattern:'NAO SAO DO TIPO PUBLICO', reason:'Arquivos indisponíveis por restrição pública'},
    {pattern:'RESTRITO', reason:'Conteúdo restrito'}
  ];
  const found = checks.find(item => normalized.includes(item.pattern));
  return found ? found.reason : '';
}

function samePersonName(a, b){
  const left = normalizePersonName(a);
  const right = normalizePersonName(b);
  return Boolean(left && right && left === right);
}

function isKnownMonitoredLawyer(value){
  const name = normalizePersonName(value);
  return DEFAULT_DJEN_OABS.some(oab => {
    const lawyer = normalizePersonName(oab.nome);
    return lawyer && (name === lawyer || name.includes(lawyer));
  });
}

function cleanPartyCandidate(value){
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\s*\((?:OAB|ADV|ADVOGAD[OA]|AUTOR|R[ÉE]U|REQUERENTE|REQUERID[OA]|APELANTE|APELAD[OA])[^)]*\)\s*/gi, ' ')
    .replace(/\s+R[ÉE]\s*\(?U?\)?\s*$/i, '')
    .replace(/\s+(?:AUTOR(?:A)?|R[ÉE]U|PARTE\s+R[ÉE]|REQUERENTE|REQUERID[OA]|APELANTE|APELAD[OA]|AGRAVANTE|AGRAVAD[OA]|EXEQUENTE|EXECUTAD[OA])\s*\(?[A-Z/]*\)?\s*$/i, '')
    .replace(/\s+(?:ADVOGAD[OA]\(?S?\)?|OAB|PROCURADOR(?:A)?|DEFENSOR(?:A)?|PROMOTOR(?:A)?|MINIST[ÉE]RIO)\b[\s\S]*$/i, '')
    .replace(/\s+-\s+.*$/i, '')
    .replace(/[.,;:]+$/g, '')
    .trim();
}

function isValidPartyCandidate(value){
  const candidate = cleanPartyCandidate(value);
  if(candidate.length < 3 || candidate.length > 80) return false;
  if(isKnownMonitoredLawyer(candidate)) return false;
  const normalized = normalizePersonName(candidate);
  if(!/[A-Z]{2,}(?:\s+[A-Z]{2,})+/.test(normalized)) return false;
  const blocked = ['ADVOGADO','ADVOGADA','OAB','PODER JUDICIARIO','TRIBUNAL','DIARIO DE JUSTICA','PROCESSO','PROCEDIMENTO','INTIMACAO','INTIMADO','INTIMADA','ARQUIVO','ARQUIVOS','DISPONIVEIS','INDISPONIVEIS','SEGREDO DE JUSTICA','DATA E ASSINATURA','ASSINATURA ELETRONICA','JUIZ','JUIZA','DE DIREITO','COMARCA','VARA','GABINETE','SENTENCA','DECISAO','DESPACHO','AUDIENCIA','DOCUMENTO','PUBLICADO','DISPONIBILIZADO'];
  return !blocked.some(word => normalized.includes(word));
}

function bestPartyCandidate(values){
  for(const value of values){
    const candidate = cleanPartyCandidate(value);
    if(isValidPartyCandidate(candidate)) return candidate;
  }
  return '';
}

function extractDjenPartyFromText(text){
  const raw = String(text ?? '').replace(/\s+/g, ' ').trim();
  if(!raw) return '';
  const role = '(?:AUTOR(?:A)?|R[ÉE]U|REQUERENTE|REQUERID[OA]|APELANTE|APELAD[OA]|AGRAVANTE|AGRAVAD[OA]|EXEQUENTE|EXECUTAD[OA]|RECORRENTE|RECORRID[OA]|IMPETRANTE|IMPETRAD[OA]|INTERESSAD[OA]|PACIENTE)';
  const stop = '(?=\\s+(?:ADVOGAD[OA]\\(?S?\\)?|OAB|PROCURADOR(?:A)?|DEFENSOR(?:A)?|PROMOTOR(?:A)?|MINIST[ÉE]RIO|AUTOR(?:A)?|R[ÉE]U|REQUERENTE|REQUERID[OA]|APELANTE|APELAD[OA]|AGRAVANTE|AGRAVAD[OA]|EXEQUENTE|EXECUTAD[OA]|RECORRENTE|RECORRID[OA]|IMPETRANTE|IMPETRAD[OA]|INTERESSAD[OA]|PACIENTE|RELATOR|JUIZ|JUIZA)\\b|$)';
  const regex = new RegExp(`\\b${role}(?:\\s*\\([A-Z/]+\\))*\\s*:\\s*([\\s\\S]{3,160}?)${stop}`, 'gi');
  const candidates = [];
  let match;
  while((match = regex.exec(raw))) candidates.push(match[1]);
  const selected = bestPartyCandidate(candidates);
  if(selected) return selected;
  const inline = raw.match(/\b(?:AUTOR(?:A)?|R[ÉE]U|REQUERENTE|REQUERID[OA]|APELANTE|APELAD[OA])(?:\s*\([A-Z/]+\))*\s+([A-ZÁÉÍÓÚÃÕÇ][A-ZÁÉÍÓÚÃÕÇ'.-]+(?:\s+[A-ZÁÉÍÓÚÃÕÇ][A-ZÁÉÍÓÚÃÕÇ'.-]+){1,8})/);
  return inline ? bestPartyCandidate([inline[1]]) : '';
}

function djenEndpoint(env, settings = null){
  return (settings?.integrations?.djen?.serviceUrl || env.DJEN_ENDPOINT || DEFAULT_DJEN_ENDPOINT).trim();
}

async function djenHeaders(env, settings = null){
  const headers = {Accept:'application/json'};
  const djen = settings?.integrations?.djen;
  if(djen?.authType === 'token' && djen.tokenEncrypted){
    const token = await decryptSecret(djen.tokenEncrypted, env);
    if(token) headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function parseDjenOabs(env, settings = null){
  const tenantOabs = settings?.integrations?.djen?.oabs;
  if(Array.isArray(tenantOabs) && tenantOabs.length){
    return tenantOabs.map(oab => ({uf:String(oab.uf || '').toUpperCase(), numero:onlyDigits(oab.numero), nome:String(oab.nome || '')})).filter(oab => oab.uf && oab.numero);
  }
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
  const inferredParty = extractDjenPartyFromText(texto);
  const rawDestinatario = String(item.nomeParte || item.destinatario || '').replace(/\s+/g, ' ').trim();
  const destinatario = bestPartyCandidate([rawDestinatario, inferredParty]);
  const restricaoMotivo = restrictedReasonFromText(`${texto} ${item.nomeOrgao || ''} ${item.tipoComunicacao || ''}`);
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
    destinatario,
    advogado:{nome:oab.nome, uf:oab.uf, numero:oab.numero},
    meio:item.meio || '',
    texto,
    link:item.link || sourceUrl,
    prazoIdentificado:detectPrazoText(texto),
    restrito:Boolean(restricaoMotivo),
    restricaoMotivo
  };
}

async function fetchDjenForOab(env, oab, start, end, settings = null){
  const url = new URL(djenEndpoint(env, settings));
  url.searchParams.set('numeroOab', oab.numero);
  url.searchParams.set('ufOab', oab.uf);
  url.searchParams.set('dataDisponibilizacaoInicio', start);
  url.searchParams.set('dataDisponibilizacaoFim', end);
  const response = await fetch(url.toString(), {headers:await djenHeaders(env, settings)});
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

function scopedKey(base, tenantId = MASTER_TENANT_ID){
  return `${base}:${tenantId || MASTER_TENANT_ID}`;
}

async function readDjenCache(env, tenantId = MASTER_TENANT_ID){
  return await env.LEXFLOW_CACHE.get(scopedKey(DJEN_CACHE_KEY, tenantId), {type:'json'});
}

async function writeDjenCache(env, payload, tenantId = MASTER_TENANT_ID){
  await env.LEXFLOW_CACHE.put(scopedKey(DJEN_CACHE_KEY, tenantId), JSON.stringify(payload));
  await env.LEXFLOW_CACHE.delete(scopedKey(DJEN_ERROR_KEY, tenantId));
}

async function writeDjenError(env, error, tenantId = MASTER_TENANT_ID){
  await env.LEXFLOW_CACHE.put(scopedKey(DJEN_ERROR_KEY, tenantId), JSON.stringify({
    message:error.message || 'Erro ao sincronizar DJEN',
    at:new Date().toISOString()
  }));
}

async function readDjenError(env, tenantId = MASTER_TENANT_ID){
  return await env.LEXFLOW_CACHE.get(scopedKey(DJEN_ERROR_KEY, tenantId), {type:'json'});
}

async function refreshDjen(env, requestUrl = 'https://lexflow.local/api/djen/comunicacoes', settings = null, tenantId = MASTER_TENANT_ID){
  const {start, end} = djenRange(requestUrl);
  const oabs = parseDjenOabs(env, settings);
  const settled = await Promise.allSettled(oabs.map(oab => fetchDjenForOab(env, oab, start, end, settings)));
  const results = settled.filter(r => r.status === 'fulfilled').map(r => r.value);
  const errors = settled.filter(r => r.status === 'rejected').map(r => r.reason?.message || 'Erro desconhecido');
  const comunicacoes = [...new Map(results.flatMap(result => result.items).map(item => [item.refId, item])).values()]
    .sort((a, b) => String(b.dataDisponibilizacao).localeCompare(String(a.dataDisponibilizacao)) || String(b.refId).localeCompare(String(a.refId)));

  if(!results.length && errors.length){
    throw new Error(errors.join(' | '));
  }

  const payload = {
    source:'DJEN/CNJ',
    endpoint:djenEndpoint(env, settings),
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
  await writeDjenCache(env, payload, tenantId);
  return payload;
}

async function proxyDjenComunicacoes(request, env, auth = null){
  const url = new URL(request.url);
  const force = url.searchParams.get('refresh') === '1';
  const tenantId = auth?.user?.role === 'master' && url.searchParams.get('tenantId') ? url.searchParams.get('tenantId') : (auth?.user?.tenantId || MASTER_TENANT_ID);
  const cached = await readDjenCache(env, tenantId);
  if(cached && !force){
    return json({...cached, sync:{status:'cached_djen', comunicacoes:cached.comunicacoes?.length || 0}});
  }
  try{
    const settings = auth ? await env.LEXFLOW_CACHE.get(settingsKey(tenantId), {type:'json'}) : null;
    const payload = await refreshDjen(env, request.url, settings, tenantId);
    return json({...payload, sync:{status:'fresh_djen', comunicacoes:payload.comunicacoes.length}});
  }catch(error){
    await writeDjenError(env, error, tenantId);
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

async function proxyDjenStatus(request, env, auth = null){
  const url = new URL(request.url);
  const tenantId = auth?.user?.role === 'master' && url.searchParams.get('tenantId') ? url.searchParams.get('tenantId') : (auth?.user?.tenantId || MASTER_TENANT_ID);
  const settings = auth ? await env.LEXFLOW_CACHE.get(settingsKey(tenantId), {type:'json'}) : null;
  const cached = await readDjenCache(env, tenantId);
  const lastError = await readDjenError(env, tenantId);
  return json({
    source:'DJEN/CNJ',
    endpoint:djenEndpoint(env, settings),
    oabs:parseDjenOabs(env, settings),
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
  const restricaoMotivo = restrictedReasonFromText(`${texto} ${item.cadernoNome || ''} ${item.diarioTipo || ''} ${item.titulo || ''}`);
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
    controlJusId: item.publicacaoId || item.id || '',
    restrito:Boolean(restricaoMotivo),
    restricaoMotivo
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

async function readCache(env, tenantId = MASTER_TENANT_ID){
  return await env.LEXFLOW_CACHE.get(scopedKey(CACHE_KEY, tenantId), {type:'json'});
}

async function writeCache(env, payload, tenantId = MASTER_TENANT_ID){
  await env.LEXFLOW_CACHE.put(scopedKey(CACHE_KEY, tenantId), JSON.stringify(payload));
  await env.LEXFLOW_CACHE.delete(scopedKey(ERROR_KEY, tenantId));
}

async function writeError(env, error, tenantId = MASTER_TENANT_ID){
  await env.LEXFLOW_CACHE.put(scopedKey(ERROR_KEY, tenantId), JSON.stringify({
    message:error.message || 'Erro ao sincronizar ControlJus',
    at:new Date().toISOString()
  }));
}

async function readError(env, tenantId = MASTER_TENANT_ID){
  return await env.LEXFLOW_CACHE.get(scopedKey(ERROR_KEY, tenantId), {type:'json'});
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

async function proxyControlJus(request, env, auth = null){
  const endpoint = backendEndpoint(env, '/api/controljus/publicacoes');
  if(endpoint){
    const response = await fetch(withQuery(endpoint, request.url), {method:'GET', headers:backendHeaders(env)});
    return proxiedJsonResponse(response);
  }

  const url = new URL(request.url);
  const force = url.searchParams.get('refresh') === '1';
  const tenantId = auth?.user?.tenantId || MASTER_TENANT_ID;
  const cached = await readCache(env, tenantId);
  if(cached && !force){
    return json({...cached, sync:{status:'cached_native'}});
  }
  return refreshControlJusNative(env, tenantId);
}

async function refreshControlJusNative(env, tenantId = MASTER_TENANT_ID){
  try{
    const result = await fetchControlJusWithBrowser(env);
    await writeCache(env, result, tenantId);
    return json({...result, sync:{status:'fresh_native', publicacoes:result.publicacoes.length}});
  }catch(error){
    await writeError(env, error, tenantId);
    const cached = await readCache(env, tenantId);
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

async function proxyControlJusStatus(request, env, auth = null){
  const endpoint = backendEndpoint(env, '/api/controljus/status');
  if(endpoint){
    const response = await fetch(withQuery(endpoint, request.url), {method:'GET', headers:backendHeaders(env)});
    return proxiedJsonResponse(response);
  }

  const tenantId = auth?.user?.tenantId || MASTER_TENANT_ID;
  const cached = await readCache(env, tenantId);
  const lastError = await readError(env, tenantId);
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

async function refreshControlJusBackend(env, reason, cron = '', tenantId = MASTER_TENANT_ID){
  const endpoint = backendEndpoint(env, '/api/controljus/refresh');
  if(!endpoint){
    const response = await refreshControlJusNative(env, tenantId);
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

async function proxyControlJusRefresh(request, env, auth = null){
  if(request.method !== 'POST' && request.method !== 'GET'){
    return json({error:'method_not_allowed'}, 405);
  }
  const result = await refreshControlJusBackend(env, 'manual', '', auth?.user?.tenantId || MASTER_TENANT_ID);
  return json(result, result.status || (result.ok ? 200 : 503));
}

async function proxyDjenRefresh(request, env, auth = null){
  if(request.method !== 'POST' && request.method !== 'GET'){
    return json({error:'method_not_allowed'}, 405);
  }
  const response = await proxyDjenComunicacoes(new Request(`${new URL(request.url).origin}/api/djen/comunicacoes?refresh=1`), env, auth);
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

    if(url.pathname === '/api/auth/login' && request.method === 'POST') return handleLogin(request, env);
    if(url.pathname === '/api/auth/session') return handleSession(request, env);
    if(url.pathname === '/api/auth/logout' && request.method === 'POST') return handleLogout(request, env);

    if(url.pathname.startsWith('/api/')){
      const auth = await requireAuth(request, env);
      if(auth instanceof Response) return auth;
      if(url.pathname === '/api/tenants') return handleTenants(request, env, auth);
      if(url.pathname === '/api/users') return handleUsers(request, env, auth);
      if(url.pathname === '/api/settings') return handleSettings(request, env, auth);
      if(url.pathname === '/api/audit-log') return handleAuditLog(request, env, auth);
      if(url.pathname === '/api/integrations/test') return handleIntegrationTest(request, env, auth);
      if(url.pathname === '/api/controljus/publicacoes') return proxyControlJus(request, env, auth);
      if(url.pathname === '/api/controljus/status') return proxyControlJusStatus(request, env, auth);
      if(url.pathname === '/api/controljus/refresh') return proxyControlJusRefresh(request, env, auth);
      if(url.pathname === '/api/djen/comunicacoes') return proxyDjenComunicacoes(request, env, auth);
      if(url.pathname === '/api/djen/status') return proxyDjenStatus(request, env, auth);
      if(url.pathname === '/api/djen/refresh') return proxyDjenRefresh(request, env, auth);
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
