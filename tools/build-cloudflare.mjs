import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');

await fs.rm(dist, {recursive: true, force: true});
await fs.mkdir(dist, {recursive: true});
await fs.copyFile(path.join(root, 'index.html'), path.join(dist, 'index.html'));

await fs.writeFile(path.join(dist, '_headers'), `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), microphone=(), camera=()
`, 'utf8');

console.log('Cloudflare build pronto em ./dist');
