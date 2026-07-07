import fs from 'node:fs/promises';

export async function loadEnv(file = '.env'){
  return Object.fromEntries(
    (await fs.readFile(file, 'utf8').catch(() => ''))
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#') && line.includes('='))
      .map(line => {
        const idx = line.indexOf('=');
        return [line.slice(0, idx), line.slice(idx + 1)];
      })
  );
}

function isoDate(value){
  if(!value) return '';
  const dt = new Date(value);
  if(Number.isNaN(dt.getTime())) return '';
  return dt.toISOString().slice(0, 10);
}

function detectPrazoText(text){
  const raw = String(text??'').replace(/\s+/g,' ').trim();
  if(!raw) return '';
  const normalized = raw.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const words = {um:1,uma:1,dois:2,duas:2,tres:3,quatro:4,cinco:5,seis:6,sete:7,oito:8,nove:9,dez:10,onze:11,doze:12,treze:13,quatorze:14,catorze:14,quinze:15,vinte:20,trinta:30};
  const matches = [];
  const re = /prazo\s+(?:legal\s+)?(?:de|por|para|no prazo de)\s+(\d+|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|vinte|trinta)\s+dias?/g;
  let m;
  while((m = re.exec(normalized))){
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : words[m[1]];
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

export async function fetchControlJusPublicacoes(options = {}){
  const fileEnv = await loadEnv(options.envFile || '.env');
  const env = options.env || {...fileEnv, ...process.env};
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
    throw new Error('Crie um arquivo .env com CONTROLJUS_USER e CONTROLJUS_PASSWORD.');
  }

  let chromium;
  try{
    ({chromium} = await import('playwright'));
  }catch(e){
    throw new Error('Playwright nao esta instalado. Rode: npm install.');
  }

  const browser = await chromium.launch({
    headless:cfg.headless,
    args:[
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  });
  const page = await browser.newPage();
  const diagnostics = {
    capturedJson:0,
    recortesResponses:0,
    rawRecortes:0,
    tableRows:0,
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
  await page.route('**/*', route => {
    const type = route.request().resourceType();
    if(['image','media','font'].includes(type)) return route.abort();
    return route.continue();
  });
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

  try{
    await page.goto(cfg.url, {waitUntil:'domcontentloaded'});

    const needsLogin = await page.locator(cfg.passwordSelector).first().isVisible().catch(() => false);
    diagnostics.needsLogin = needsLogin;
    if(needsLogin){
      const visibleInputs = page.locator('input:visible');
      diagnostics.visibleInputs = await visibleInputs.count().catch(() => 0);
      diagnostics.visibleButtons = await page.locator('button:visible, input[type="submit"]:visible').count().catch(() => 0);

      const passwordInput = page.locator(cfg.passwordSelector).first();
      const userInput = page.locator(cfg.userSelector).first();
      await userInput.fill(cfg.user);
      await passwordInput.fill(cfg.password);
      await passwordInput.press('Enter').catch(() => {});
      await page.waitForLoadState('networkidle', {timeout:8000}).catch(() => {});

      if(await page.locator(cfg.passwordSelector).first().isVisible().catch(() => false)){
        const submit = page.locator(cfg.submitSelector).first();
        if(await submit.isVisible({timeout:5000}).catch(() => false)){
          await Promise.all([
            page.waitForLoadState('networkidle', {timeout:12000}).catch(() => {}),
            submit.click({force:true})
          ]);
        }
      }

      diagnostics.loginSubmitted = true;
      await page.waitForTimeout(5000);
    }

    await page.goto(cfg.url, {waitUntil:'domcontentloaded'});
    await page.waitForResponse(response =>
      response.url().includes('/api/recortes/pesquisar') && response.status() === 200,
      {timeout:25000}
    ).catch(() => {});
    await page.waitForLoadState('networkidle', {timeout:10000}).catch(() => {});
    await page.waitForTimeout(1500);

    const tableRows = await page.locator('table tbody tr').evaluateAll(rows => rows.map(row => {
      const cells = [...row.querySelectorAll('th,td')].map(cell => cell.innerText.trim());
      return {cells};
    })).catch(() => []);
    diagnostics.passwordVisibleAfterLogin = await page.locator(cfg.passwordSelector).first().isVisible().catch(() => false);
    diagnostics.finalUrl = page.url();
    diagnostics.title = await page.title().catch(() => '');
    const bodyText = await page.locator('body').innerText({timeout:3000}).catch(() => '');
    diagnostics.bodyLength = bodyText.length;
    diagnostics.loginPageText = diagnostics.passwordVisibleAfterLogin ? bodyText.slice(0, 240) : '';

    const recortes = captured
      .filter(entry => entry.url.includes('/api/recortes/pesquisar'))
      .flatMap(entry => Array.isArray(entry.body?.resultado) ? entry.body.resultado : []);
    const uniqueRecortes = [...new Map(recortes.map(item => [item.publicacaoId || item.id || JSON.stringify(item).slice(0,100), item])).values()];
    const publicacoes = uniqueRecortes.map(item => normalizeRecorte(item, cfg.url));

    return {
      source:'ControlJus',
      url:cfg.url,
      collectedAt:new Date().toISOString(),
      publicacoes,
      diagnostics:{
        ...diagnostics,
        capturedJson:captured.length,
        recortesResponses:captured.filter(entry => entry.url.includes('/api/recortes/pesquisar')).length,
        rawRecortes:recortes.length,
        tableRows:tableRows.length
      },
      captured,
      tableRows
    };
  }finally{
    await browser.close();
  }
}
