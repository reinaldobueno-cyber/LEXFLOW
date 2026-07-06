import fs from 'node:fs/promises';
import path from 'node:path';

const env = Object.fromEntries(
  (await fs.readFile('.env', 'utf8').catch(() => ''))
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && line.includes('='))
    .map(line => {
      const idx = line.indexOf('=');
      return [line.slice(0, idx), line.slice(idx + 1)];
    })
);

const cfg = {
  url: env.CONTROLJUS_URL || 'https://app.controljus.com.br/publicacoes/recortes/arquivadas',
  user: env.CONTROLJUS_USER,
  password: env.CONTROLJUS_PASSWORD,
  userSelector: env.CONTROLJUS_USER_SELECTOR || 'input[type="email"], input[name="email"], input[name="usuario"], input[name="login"], input[type="text"]',
  passwordSelector: env.CONTROLJUS_PASSWORD_SELECTOR || 'input[type="password"]',
  submitSelector: env.CONTROLJUS_SUBMIT_SELECTOR || 'button[type="submit"], input[type="submit"], button:has-text("Entrar"), button:has-text("Login"), button:has-text("Acessar")',
  headless: env.CONTROLJUS_HEADLESS !== 'false'
};

if(!cfg.user || !cfg.password){
  console.error('Crie um arquivo .env a partir de .env.example com CONTROLJUS_USER e CONTROLJUS_PASSWORD.');
  process.exit(1);
}

let chromium;
try{
  ({chromium} = await import('playwright'));
}catch(e){
  console.error('Playwright nao esta instalado. Rode: npm install -D playwright');
  process.exit(1);
}

const outDir = path.resolve('data');
await fs.mkdir(outDir, {recursive:true});

function isoDate(value){
  if(!value) return '';
  const dt = new Date(value);
  if(Number.isNaN(dt.getTime())) return '';
  return dt.toISOString().slice(0, 10);
}

function normalizeRecorte(item){
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
    prazoIdentificado: '',
    prazoFatal: '',
    status: 'Novo',
    responsavel: '',
    observacoes: item.diarioNome ? `Diario: ${item.diarioNome}` : '',
    linkOrigem: cfg.url,
    controlJusId: item.publicacaoId || item.id || ''
  };
}

const browser = await chromium.launch({headless:cfg.headless});
const page = await browser.newPage();
const captured = [];

page.on('response', async response => {
  const url = response.url();
  const contentType = response.headers()['content-type'] || '';
  if(!/json/i.test(contentType)) return;
  if(!/publica|recorte|intim|arquivad|controljus/i.test(url)) return;
  try{
    captured.push({url, status:response.status(), body:await response.json()});
  }catch(e){}
});

await page.goto(cfg.url, {waitUntil:'domcontentloaded'});

const needsLogin = await page.locator(cfg.passwordSelector).first().isVisible().catch(() => false);
if(needsLogin){
  await page.locator(cfg.userSelector).first().fill(cfg.user);
  await page.locator(cfg.passwordSelector).first().fill(cfg.password);
  const submit = page.locator(cfg.submitSelector).first();
  if(await submit.isVisible({timeout:5000}).catch(() => false)){
    await Promise.all([
      page.waitForLoadState('networkidle').catch(() => {}),
      submit.click()
    ]);
  }else{
    await Promise.all([
      page.waitForLoadState('networkidle').catch(() => {}),
      page.locator(cfg.passwordSelector).first().press('Enter')
    ]);
  }
}

await page.goto(cfg.url, {waitUntil:'networkidle'});
await page.waitForTimeout(2500);

const tableRows = await page.locator('table tbody tr').evaluateAll(rows => rows.map(row => {
  const cells = [...row.querySelectorAll('th,td')].map(cell => cell.innerText.trim());
  return {cells};
})).catch(() => []);

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = {
  source:'ControlJus',
  url:cfg.url,
  collectedAt:new Date().toISOString(),
  captured,
  tableRows
};

const recortes = captured
  .filter(entry => entry.url.includes('/api/recortes/pesquisar'))
  .flatMap(entry => Array.isArray(entry.body?.resultado) ? entry.body.resultado : []);
const uniqueRecortes = [...new Map(recortes.map(item => [item.publicacaoId || item.id || JSON.stringify(item).slice(0,100), item])).values()];
const publicacoes = uniqueRecortes.map(normalizeRecorte);

const file = path.join(outDir, `controljus-recortes-${stamp}.json`);
await fs.writeFile(file, JSON.stringify(output, null, 2));
const normalizedFile = path.join(outDir, `controljus-publicacoes-${stamp}.json`);
await fs.writeFile(normalizedFile, JSON.stringify({source:'ControlJus', url:cfg.url, collectedAt:output.collectedAt, publicacoes}, null, 2));
console.log(`Arquivo bruto gerado: ${file}`);
console.log(`Arquivo para importar no LexFlow: ${normalizedFile}`);
console.log(`Publicacoes normalizadas: ${publicacoes.length}`);
console.log('Importe o arquivo controljus-publicacoes-*.json no LexFlow pelo botao "Conectar ControlJus".');

await browser.close();
