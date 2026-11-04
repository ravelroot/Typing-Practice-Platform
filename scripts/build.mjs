import { build, transform } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const web = path.join(root, 'web');
const target = path.join(root, 'Pluma.html');
const check = process.argv.includes('--check');

const version = (await readFile(path.join(root, 'VERSION'), 'utf8')).trim();
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
if (pkg.version !== version) {
  console.error(`VERSION (${version}) e package.json (${pkg.version}) não batem`);
  process.exit(1);
}

const bundle = await build({
  entryPoints: [path.join(web, 'src', 'main.ts')],
  bundle: true,
  write: false,
  format: 'iife',
  target: ['chrome111', 'edge111', 'firefox113', 'safari16.4'],
  minify: true,
  legalComments: 'none',
  charset: 'utf8',
  define: { PLUMA_VERSION: JSON.stringify(version) },
  logLevel: 'warning',
});
const js = bundle.outputFiles[0].text.trim().replace(/<\/script/gi, '<\\/script');

const css = (
  await transform(await readFile(path.join(web, 'css', 'pluma.css'), 'utf8'), {
    loader: 'css',
    minify: true,
    legalComments: 'none',
    target: ['chrome111', 'edge111', 'firefox113', 'safari16.4'],
  })
).code.trim();

const favicon = await readFile(path.join(web, 'img', 'favicon.svg'));
let html = (await readFile(path.join(web, 'index.html'), 'utf8')).replace(/\r\n?/g, '\n');

const boot = html.match(/<script>([\s\S]*?)<\/script>/);
if (!boot) throw new Error('script de inicialização não encontrado em web/index.html');
const sha = (s) => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`;
const csp = [
  "default-src 'none'",
  `script-src ${sha(boot[1])} ${sha(js)}`,
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
].join('; ');

const replaceOnce = (source, find, replacement) => {
  const i = source.indexOf(find);
  if (i < 0) throw new Error(`trecho não encontrado em web/index.html: ${find}`);
  return source.slice(0, i) + replacement + source.slice(i + find.length);
};

html = replaceOnce(html, '<meta charset="utf-8">', `<meta charset="utf-8">\n  <meta http-equiv="Content-Security-Policy" content="${csp}">`);
html = replaceOnce(html, '<link rel="icon" href="img/favicon.svg" type="image/svg+xml">', `<link rel="icon" href="data:image/svg+xml;base64,${favicon.toString('base64')}" type="image/svg+xml">`);
html = replaceOnce(html, '<link rel="stylesheet" href="css/pluma.css">', `<style>${css}</style>`);
html = replaceOnce(html, '<script type="module" src="app.js"></script>', `<script>${js}</script>`);

if (check) {
  const current = (await readFile(target, 'utf8').catch(() => '')).replace(/\r\n?/g, '\n');
  if (current !== html) {
    console.error('Pluma.html está desatualizado: rode npm run build');
    process.exit(1);
  }
  console.log('Pluma.html em dia');
} else {
  await writeFile(target, html);
  console.log(`Pluma.html ${version} pronto (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB)`);
}
