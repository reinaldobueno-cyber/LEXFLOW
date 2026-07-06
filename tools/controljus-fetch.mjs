import fs from 'node:fs/promises';
import path from 'node:path';
import {fetchControlJusPublicacoes} from './controljus-client.mjs';

const outDir = path.resolve('data');
await fs.mkdir(outDir, {recursive:true});

const result = await fetchControlJusPublicacoes();
const stamp = result.collectedAt.replace(/[:.]/g, '-');

const rawFile = path.join(outDir, `controljus-recortes-${stamp}.json`);
await fs.writeFile(rawFile, JSON.stringify({
  source:result.source,
  url:result.url,
  collectedAt:result.collectedAt,
  captured:result.captured,
  tableRows:result.tableRows
}, null, 2));

const normalizedFile = path.join(outDir, `controljus-publicacoes-${stamp}.json`);
await fs.writeFile(normalizedFile, JSON.stringify({
  source:result.source,
  url:result.url,
  collectedAt:result.collectedAt,
  publicacoes:result.publicacoes
}, null, 2));

console.log(`Arquivo bruto gerado: ${rawFile}`);
console.log(`Arquivo para importar no LexFlow: ${normalizedFile}`);
console.log(`Publicacoes normalizadas: ${result.publicacoes.length}`);
