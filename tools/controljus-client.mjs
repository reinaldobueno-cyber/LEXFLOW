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
    prazoIdentificado: '',
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

  try{
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

    await page.goto(cfg.url, {waitUntil:'domcontentloaded'});
    await page.waitForResponse(response =>
      response.url().includes('/api/recortes/pesquisar') && response.status() === 200,
      {timeout:45000}
    ).catch(() => {});
    await page.waitForLoadState('networkidle', {timeout:30000}).catch(() => {});
    await page.waitForTimeout(5000);

    const tableRows = await page.locator('table tbody tr').evaluateAll(rows => rows.map(row => {
      const cells = [...row.querySelectorAll('th,td')].map(cell => cell.innerText.trim());
      return {cells};
    })).catch(() => []);

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
