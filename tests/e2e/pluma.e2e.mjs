import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PAGE = pathToFileURL(path.join(root, 'Pluma.html')).href;

let browser;

before(async () => {
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
});

async function open(prefs = { tutorialDone: true }, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 860 }, ...options });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(options.url ?? PAGE);
  if (prefs) {
    await page.evaluate((p) => {
      localStorage.clear();
      localStorage.setItem('pluma:prefs', JSON.stringify(p));
    }, prefs);
    await page.reload();
  }
  await page.waitForSelector('#text .c');
  await page.waitForTimeout(150);
  return { page, context, errors };
}

const target = (page) =>
  page.evaluate(() => Array.from(document.querySelectorAll('#text .c'), (s) => (s.classList.contains('nl') ? '\n' : s.textContent)).join(''));

async function typeAll(page, text, delay = 0) {
  for (const ch of Array.from(text)) {
    if (ch === '\n') await page.keyboard.press('Enter');
    else await page.keyboard.insertText(ch);
    if (delay) await page.waitForTimeout(delay);
  }
}

const cardValue = (page, label) =>
  page.evaluate(async (l) => {
    await new Promise((r) => setTimeout(r, 1100));
    const card = [...document.querySelectorAll('.sheet .card')].find((c) => c.querySelector('.lbl')?.textContent === l);
    return card?.querySelector('.val')?.textContent ?? null;
  }, label);

test('abre direto do disco, com CSP e sem erros, e o tutorial aparece só na primeira vez', async () => {
  const { page, context, errors } = await open(null);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('.tour-card');
  const csp = await page.getAttribute('meta[http-equiv="Content-Security-Policy"]', 'content');
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /connect-src 'none'/);
  assert.match(await page.textContent('.tour-card'), /Ver tutorial/);
  await page.click('.tour-card .btn.primary');
  assert.match(await page.textContent('.tour-step'), /Passo 1 de 8/);
  await page.keyboard.press('ArrowRight');
  assert.match(await page.textContent('.tour-step'), /Passo 2 de 8/);
  await page.keyboard.press('ArrowLeft');
  assert.match(await page.textContent('.tour-step'), /Passo 1 de 8/);
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(60);
    await page.click('.tour-card .btn.primary');
  }
  assert.equal(await page.locator('.tour-card').count(), 0);
  await page.click('#menuBtn');
  await page.click('.menu li:has-text("Tutorial rápido")');
  assert.match(await page.textContent('.tour-step'), /Passo 1 de 8/);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.tour-card').count(), 0);
  await page.reload();
  await page.waitForSelector('#text .c');
  await page.waitForTimeout(700);
  assert.equal(await page.locator('.tour-card').count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test('teste sem erros: tempo final, precisão de 100% e primeiro recorde', async () => {
  const { page, context, errors } = await open({ tutorialDone: true, mode: 'test', kind: 'text', size: 'short', complexity: 'easy' });
  const text = await target(page);
  assert.ok(text.length > 20);
  await typeAll(page, text, 8);
  await page.waitForSelector('.sheet h2:text("Diagnóstico")');
  assert.equal(await cardValue(page, 'Precisão'), '100,0%');
  assert.equal(await cardValue(page, 'Erros'), '0');
  assert.equal(await cardValue(page, 'Toques brutos'), String(Array.from(text).length));
  assert.match(await page.textContent('.badge'), /Primeiro recorde/);
  assert.match(await cardValue(page, 'Tempo final'), /^\d:\d\d,\d\d$/);
  const history = await page.evaluate(() => JSON.parse(localStorage.getItem('pluma:historico')));
  assert.equal(history.length, 1);
  assert.equal(history[0].errors, 0);
  assert.equal(history[0].mode, 'test');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  assert.equal(await page.locator('.sheet').count(), 0);
  assert.notEqual(await target(page), text);
  assert.deepEqual(errors, []);
  await context.close();
});

test('erros corrigidos e não corrigidos entram no diagnóstico e nos toques líquidos', async () => {
  const { page, context } = await open({ tutorialDone: true, mode: 'test', kind: 'alphabet', size: 'short', complexity: 'easy' });
  const text = await target(page);
  assert.equal(text, 'abcdefghijklmnopqrstuvwxyz');
  await page.keyboard.insertText('ab');
  await page.keyboard.insertText('x');
  assert.equal(await page.locator('#text .c.err').count(), 1);
  await page.keyboard.press('Backspace');
  assert.equal(await page.locator('#text .c.err').count(), 0);
  await typeAll(page, 'cdefghijklmnopqrstuvwxy');
  await page.keyboard.insertText('q');
  await page.waitForSelector('.sheet h2:text("Diagnóstico")');
  assert.equal(await cardValue(page, 'Erros'), '2');
  assert.equal(await cardValue(page, 'Toques brutos'), '27');
  assert.equal(await cardValue(page, 'Acertos'), '25');
  assert.equal(await cardValue(page, 'Toques líquidos'), '22');
  assert.equal(await cardValue(page, 'Precisão'), '92,6%');
  const subtitle = await page.evaluate(() => [...document.querySelectorAll('.sheet .card')].find((c) => c.querySelector('.lbl')?.textContent === 'Erros')?.querySelector('.sub')?.textContent);
  assert.match(subtitle, /1 corrigidos · 1 não corrigidos/);
  await context.close();
});

test('modo livre emenda textos e o Ctrl+Enter mostra o diagnóstico da sessão', async () => {
  const { page, context, errors } = await open({ tutorialDone: true, mode: 'free', kind: 'words', size: 'short', complexity: 'easy' });
  assert.equal(await page.locator('.stat .lbl:text("Tempo")').count(), 0);
  const first = await target(page);
  await typeAll(page, first);
  await page.waitForTimeout(1100);
  const second = await target(page);
  assert.notEqual(second, first);
  await typeAll(page, second.slice(0, 10));
  await page.keyboard.press('Control+Enter');
  await page.waitForSelector('.sheet h2:text("Diagnóstico")');
  assert.match(await page.textContent('.sheet-head p'), /Sessão livre/);
  assert.equal(await cardValue(page, 'Textos'), '2');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  const hist = await page.evaluate(() => JSON.parse(localStorage.getItem('pluma:historico')));
  assert.equal(hist[0].mode, 'free');
  assert.equal(hist[0].texts, 2);
  assert.equal(await page.textContent('.stat:nth-child(4) .val'), '0');
  assert.deepEqual(errors, []);
  await context.close();
});

test('avançar só com a tecla certa segura a letra errada', async () => {
  const { page, context } = await open({ tutorialDone: true, mode: 'free', kind: 'alphabet', size: 'short', complexity: 'easy', stopOnError: true });
  await page.keyboard.insertText('a');
  await page.keyboard.insertText('z');
  assert.equal(await page.locator('#text .c.ok').count(), 1);
  assert.equal(await page.locator('#text .c.err').count(), 0);
  await page.keyboard.insertText('b');
  assert.equal(await page.locator('#text .c.ok').count(), 2);
  await context.close();
});

test('todos os conteúdos geram texto, e o teclado numérico aparece no tipo certo', async () => {
  const { page, context, errors } = await open({ tutorialDone: true, mode: 'test', kind: 'text', size: 'medium', complexity: 'hard' });
  const kinds = ['Texto', 'Palavras', 'Sem acentos', 'Alfabeto', 'Números', 'Teclado num.', 'Dados', 'Misto'];
  for (const label of kinds) {
    await page.click('#kindDrop .dropdown-btn');
    await page.click(`.listbox li:has(.opt-label:text-is("${label}"))`);
    await page.waitForTimeout(300);
    const text = await target(page);
    assert.ok(text.length > 10, label);
    assert.equal(await page.locator('#kb.numpad').count(), label === 'Teclado num.' ? 1 : 0, label);
    if (label === 'Sem acentos') assert.doesNotMatch(text, /[áàâãéêíóôõúç]/i);
    if (label === 'Teclado num.') assert.match(text, /^[0-9,+\-*/\n]+$/);
  }
  assert.deepEqual(errors, []);
  await context.close();
});

test('texto customizado: diálogo, limpeza e digitação', async () => {
  const { page, context } = await open({ tutorialDone: true, mode: 'test', kind: 'text', size: 'short', complexity: 'easy' });
  await page.click('#kindDrop .dropdown-btn');
  await page.click('.listbox li:has(.opt-label:text-is("Customizado"))');
  await page.waitForSelector('.custom-area');
  await page.fill('.custom-area', '  “Olá,   mundo”  —  ação!  ');
  await page.click('.sheet .btn.primary');
  await page.waitForTimeout(400);
  assert.equal(await target(page), '"Olá, mundo" - ação!');
  assert.equal(await page.locator('#complexitySeg.disabled').count(), 1);
  assert.equal(await page.locator('#sizeSeg.disabled').count(), 0);
  const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem('pluma:prefs')));
  assert.equal(prefs.kind, 'custom');
  assert.equal(prefs.customText, '"Olá, mundo" - ação!');
  await context.close();
});

test('enviar um PDF vira texto para digitar, dividido em partes', async () => {
  const { page, context, errors } = await open({ tutorialDone: true, mode: 'test', kind: 'text', size: 'short', complexity: 'easy' });
  await page.click('#kindDrop .dropdown-btn');
  await page.click('.listbox li:has(.opt-label:text-is("Customizado"))');
  await page.setInputFiles('.drop input[type=file]', path.join(root, 'tests', 'fixtures', 'documento.pdf'));
  await page.waitForSelector('.drop-status.ok');
  assert.match(await page.textContent('.drop-status'), /documento\.pdf pronto para digitar: 1 página/);
  const value = await page.inputValue('.custom-area');
  assert.match(value, /^Relatório da feira de ciências\nA turma do 8º ano/);
  assert.match(value, /"o mais importante foi a curiosidade" - e todos concordaram\.\.\./);
  assert.ok(await page.isVisible('.part-row'));
  await page.fill('.part-input', '2');
  await page.click('.sheet .btn.primary');
  await page.waitForTimeout(400);
  assert.match(await page.textContent('#typingTag'), /Customizado · documento\.pdf · parte 2 de \d+/);
  const part2 = await target(page);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(400);
  assert.match(await page.textContent('#typingTag'), /parte 3 de/);
  assert.notEqual(await target(page), part2);
  await page.click('.actions button:has-text("Parte anterior")');
  await page.waitForTimeout(400);
  assert.equal(await target(page), part2);
  await page.click('.actions button:has-text("Trocar texto ou arquivo")');
  await page.setInputFiles('.drop input[type=file]', { name: 'foto.png', mimeType: 'image/png', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]) });
  await page.waitForSelector('.drop-status.bad');
  assert.match(await page.textContent('.drop-status'), /formato não reconhecido/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('o teclado na tela mostra a sequência do acento e o dedo certo', async () => {
  const { page, context } = await open({ tutorialDone: true, mode: 'test', kind: 'custom', customText: 'pé Ã', size: 'short', complexity: 'easy' });
  await page.keyboard.insertText('p');
  assert.equal(await page.getAttribute('.key.next', 'data-code'), 'BracketLeft');
  assert.equal(await page.getAttribute('.key.then', 'data-code'), 'KeyE');
  assert.match(await page.textContent('#fingerHint'), /acento agudo/);
  await page.keyboard.insertText('é ');
  assert.equal(await page.getAttribute('.key.next', 'data-code'), 'Quote');
  const thens = await page.$$eval('.key.then', (n) => n.map((x) => x.dataset.code).sort());
  assert.deepEqual(thens, ['KeyA', 'ShiftRight']);
  await context.close();
});

test('colar não funciona e as teclas de navegação não movem o cursor', async () => {
  const { page, context } = await open({ tutorialDone: true, mode: 'test', kind: 'alphabet', size: 'short', complexity: 'easy' });
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData('text/plain', 'abcdefghijklmnopqrstuvwxyz');
    document.getElementById('input').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  assert.equal(await page.locator('#text .c.ok').count(), 0);
  await page.keyboard.insertText('abc');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.insertText('d');
  assert.equal(await page.locator('#text .c.ok').count(), 4);
  await context.close();
});

test('paletas, tema e preferências ficam salvos', async () => {
  const { page, context } = await open({ tutorialDone: true });
  assert.equal(await page.evaluate(() => (document.getElementById('paletteBtn').click(), document.querySelector('.menu').innerText.trim())), '');
  await page.keyboard.press('Escape');
  for (const [label, id] of [['Bento', 'bento'], ['Sonda', 'sonda'], ['Nexo', 'nexo']]) {
    await page.click('#paletteBtn');
    await page.click(`.menu li[aria-label="Paleta ${label}"]`);
    assert.equal(await page.evaluate(() => document.documentElement.dataset.palette), id);
  }
  await page.click('#paletteBtn');
  await page.click('.menu li[aria-label="Paleta Pluma (padrão)"]');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.palette ?? null), null);
  const before = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.click('#themeBtn');
  const after = await page.evaluate(() => document.documentElement.dataset.theme);
  assert.notEqual(after, before);
  await page.click('#paletteBtn');
  await page.click('.menu li[aria-label="Paleta Sonda"]');
  await page.reload();
  await page.waitForSelector('#text .c');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.palette), 'sonda');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), after);
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert.ok(bg === 'rgb(243, 241, 236)' || bg === 'rgb(15, 22, 27)', bg);
  await context.close();
});

test('histórico mostra recordes e exporta CSV', async () => {
  const { page, context } = await open({ tutorialDone: true, mode: 'test', kind: 'alphabet', size: 'short', complexity: 'easy' });
  await typeAll(page, 'abcdefghijklmnopqrstuvwxyz', 5);
  await page.waitForSelector('.sheet');
  await page.waitForTimeout(300);
  await page.click('.sheet .btn.ghost:has-text("Histórico")');
  await page.waitForSelector('.drawer');
  assert.equal(await page.locator('.record').count(), 1);
  assert.match(await page.textContent('.record'), /Alfabeto · Curto · Fácil/);
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('.drawer [aria-label="Exportar CSV"]')]);
  assert.match(download.suggestedFilename(), /^pluma-historico-\d{4}-\d\d-\d\d\.csv$/);
  await context.close();
});

test('no celular a página cabe na largura e o texto rola com o cursor', async () => {
  const { page, context, errors } = await open(
    { tutorialDone: true, mode: 'test', kind: 'text', size: 'long', complexity: 'medium' },
    { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  );
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 0, `rolagem horizontal de ${overflow}px`);
  const text = await target(page);
  await typeAll(page, text.slice(0, 200));
  await page.waitForTimeout(600);
  const shift = await page.evaluate(() => new DOMMatrix(getComputedStyle(document.getElementById('scroller')).transform).m42);
  assert.ok(shift < -20, `deslocamento ${shift}`);
  assert.deepEqual(errors, []);
  await context.close();
});

test('sem efeitos, as animações ficam desligadas', async () => {
  const { page, context } = await open({ tutorialDone: true, effects: false });
  assert.equal(await page.evaluate(() => document.documentElement.dataset.motion), 'off');
  await context.close();
});

const java = spawnSync('java', ['-version'], { stdio: 'ignore' }).status === 0;

test('o servidor local em Java entrega a página com cabeçalhos de segurança', { skip: !java && 'Java não encontrado' }, async () => {
  const server = spawn('java', [path.join(root, 'tools', 'Servidor.java'), '--porta', '0', '--arquivo', path.join(root, 'Pluma.html')], { cwd: root });
  try {
    const port = await new Promise((resolve, reject) => {
      let out = '';
      const timer = setTimeout(() => reject(new Error(`servidor não subiu: ${out}`)), 30000);
      server.stdout.on('data', (d) => {
        out += d;
        const m = out.match(/localhost:(\d+)/);
        if (m) {
          clearTimeout(timer);
          resolve(Number(m[1]));
        }
      });
      server.on('exit', (code) => reject(new Error(`servidor saiu com ${code}: ${out}`)));
    });
    const base = `http://127.0.0.1:${port}`;
    const res = await fetch(`${base}/`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal((await fetch(`${base}/nada`)).status, 404);
    assert.equal((await fetch(`${base}/`, { method: 'POST' })).status, 405);
    assert.deepEqual(await (await fetch(`${base}/saude`)).json(), { status: 'ok' });
    const etag = res.headers.get('etag');
    assert.equal((await fetch(`${base}/`, { headers: { 'If-None-Match': etag } })).status, 304);
    const { page, context, errors } = await open({ tutorialDone: true, kind: 'alphabet', size: 'short', complexity: 'easy' }, { url: `${base}/` });
    await typeAll(page, 'abcdefghijklmnopqrstuvwxyz');
    await page.waitForSelector('.sheet h2:text("Diagnóstico")');
    assert.deepEqual(errors, []);
    await context.close();
  } finally {
    server.kill();
  }
});

test('o acervo passa na conferência em Java', { skip: !java && 'Java não encontrado' }, () => {
  const r = spawnSync('java', [path.join(root, 'tools', 'Acervo.java'), 'web/data/textos.json', 'web/data/palavras.json'], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Acervo em ordem/);
});
