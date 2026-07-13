import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';

function createCache(){
  const store = new Map();
  return {
    async get(key, opts = {}){
      const value = store.get(key);
      if(value === undefined) return null;
      if(opts.type === 'json' && typeof value === 'string') return JSON.parse(value);
      return value;
    },
    async put(key, value){ store.set(key, value); },
    async delete(key){ store.delete(key); },
    async list({prefix = ''} = {}){
      return {
        keys: Array.from(store.keys()).filter(name => name.startsWith(prefix)).map(name => ({name}))
      };
    }
  };
}

async function loginWith(env, email, password){
  const request = new Request('https://example.com/api/auth/login', {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({email, password})
  });
  const response = await worker.fetch(request, env);
  return {status: response.status, body: await response.json()};
}

async function authedJson(env, token, url, body){
  const request = new Request(url, {
    method: 'POST',
    headers: {'content-type': 'application/json', authorization: `Bearer ${token}`},
    body: JSON.stringify(body)
  });
  const response = await worker.fetch(request, env);
  return {status: response.status, body: await response.json()};
}

test('recreates the master user hash when the configured password changes', async () => {
  const cache = createCache();
  const env = {
    LEXFLOW_CACHE: cache,
    MASTER_ADMIN_EMAIL: 'admin@lexflow.com',
    MASTER_ADMIN_PASSWORD: 'senha-antiga'
  };

  const firstLogin = await loginWith(env, 'admin@lexflow.com', 'senha-antiga');
  assert.equal(firstLogin.status, 200);
  assert.equal(firstLogin.body.user?.email, 'admin@lexflow.com');

  env.MASTER_ADMIN_PASSWORD = 'senha-nova';
  const secondLogin = await loginWith(env, 'admin@lexflow.com', 'senha-nova');
  assert.equal(secondLogin.status, 200);
  assert.equal(secondLogin.body.user?.email, 'admin@lexflow.com');
});

test('creates an audited A3 browser request for restricted publications', async () => {
  const cache = createCache();
  const env = {
    LEXFLOW_CACHE: cache,
    MASTER_ADMIN_EMAIL: 'admin@lexflow.com',
    MASTER_ADMIN_PASSWORD: 'senha-a3'
  };

  const login = await loginWith(env, 'admin@lexflow.com', 'senha-a3');
  assert.equal(login.status, 200);

  const result = await authedJson(env, login.body.token, 'https://example.com/api/a3/requests', {
    publicacao:{
      processo:'5588081-07.2026.8.09.0012',
      tribunal:'TJGO',
      publicacaoId:'DJEN-123',
      origem:'DJEN',
      motivo:'Arquivos digitais indisponiveis',
      sourceUrl:'https://comunicaapi.pje.jus.br/api/v1/comunicacao/abc'
    }
  });

  assert.equal(result.status, 201);
  assert.equal(result.body.request?.processo, '5588081-07.2026.8.09.0012');
  assert.equal(result.body.browserLaunchUrl, 'https://comunicaapi.pje.jus.br/api/v1/comunicacao/abc');
  assert.equal(result.body.agentLaunchUrl, '');
  assert.equal(result.body.request?.agent?.mode, 'browser_open');
});
