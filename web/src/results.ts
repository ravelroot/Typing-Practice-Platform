import { COMPLEXITY_LABELS, KIND_LABELS, SIZE_LABELS } from './content.ts';
import { describe, type Layout } from './keyboard.ts';
import { ERROR_PENALTY, formatBp, formatDuration, formatX100, type Summary, type TimelinePoint } from './metrics.ts';
import type { Context, Entry } from './history.ts';
import { countUp, el, icon, openSheet, type Overlay } from './ui.ts';

export interface ResultActions {
  repeat: (() => void) | null;
  next: () => void;
  history: () => void;
  closed: () => void;
}

const nf = new Intl.NumberFormat('pt-BR');
const int = (v: number) => nf.format(Math.round(v));

function verdict(s: Summary): string {
  const acc = s.accuracyBp / 100;
  const wpm = s.wpmX100 / 100;
  if (!s.keystrokes) return 'Nenhum toque registrado.';
  if (acc >= 98 && wpm >= 60) return 'Voando: rápido e quase sem erros.';
  if (acc >= 98) return 'Precisão de relojoeiro. Agora dá para acelerar um pouco.';
  if (acc >= 95) return 'Mão firme. Continue nesse ritmo.';
  if (acc >= 90) return 'Bom ritmo. Errar menos vai subir os toques líquidos.';
  return `Desacelere um pouco: cada erro não corrigido custa ${ERROR_PENALTY} toques líquidos.`;
}

function card(label: string, value: HTMLElement | string, sub: string | null, i: number, cls = ''): HTMLElement {
  const val = typeof value === 'string' ? el('span', { class: 'val', text: value }) : value;
  return el('div', { class: `card ${cls}`, style: { '--i': String(i) } }, el('span', { class: 'lbl', text: label }), val, sub ? el('span', { class: 'sub', text: sub }) : null);
}

function counter(to: number, format: (v: number) => string, delay: number, unit?: string): HTMLElement {
  const v = el('span', { class: 'val' });
  const num = el('span');
  v.append(num);
  if (unit) v.append(el('small', { text: unit }));
  countUp(num, to, format, 900, delay);
  return v;
}

function chart(points: TimelinePoint[]): SVGSVGElement | null {
  if (points.length < 2) return null;
  const NS = 'http://www.w3.org/2000/svg';
  const W = 900;
  const H = 150;
  const L = 34;
  const B = 18;
  const max = Math.max(20, ...points.map((p) => p.wpm));
  const top = Math.ceil(max / 20) * 20;
  const x = (i: number) => L + (i / (points.length - 1)) * (W - L - 6);
  const y = (v: number) => 6 + (1 - v / top) * (H - B - 12);
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'chart');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Velocidade em palavras por minuto ao longo do teste, com os erros marcados');
  const grid = document.createElementNS(NS, 'g');
  grid.setAttribute('class', 'grid');
  for (let v = 0; v <= top; v += top / 4) {
    const ln = document.createElementNS(NS, 'line');
    ln.setAttribute('x1', String(L));
    ln.setAttribute('x2', String(W));
    ln.setAttribute('y1', String(y(v)));
    ln.setAttribute('y2', String(y(v)));
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', '0');
    t.setAttribute('y', String(y(v) + 3));
    t.textContent = int(v);
    grid.append(ln, t);
  }
  svg.append(grid);
  const pts = points.map((p, i) => [x(i), y(p.wpm)] as const);
  let d = `M${pts[0]?.[0]} ${pts[0]?.[1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1] as readonly [number, number];
    const [x1, y1] = pts[i] as readonly [number, number];
    const mx = (x0 + x1) / 2;
    d += ` C${mx} ${y0} ${mx} ${y1} ${x1} ${y1}`;
  }
  const area = document.createElementNS(NS, 'path');
  area.setAttribute('class', 'area');
  area.setAttribute('d', `${d} L${x(points.length - 1)} ${y(0)} L${x(0)} ${y(0)} Z`);
  const line = document.createElementNS(NS, 'path');
  line.setAttribute('class', 'line');
  line.setAttribute('d', d);
  const avg = points.reduce((s, p) => s + p.wpm, 0) / points.length;
  const avgLine = document.createElementNS(NS, 'line');
  avgLine.setAttribute('class', 'avg');
  avgLine.setAttribute('x1', String(L));
  avgLine.setAttribute('x2', String(W));
  avgLine.setAttribute('y1', String(y(avg)));
  avgLine.setAttribute('y2', String(y(avg)));
  svg.append(area, avgLine, line);
  points.forEach((p, i) => {
    if (!p.errors) return;
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('class', 'miss');
    c.setAttribute('cx', String(x(i)));
    c.setAttribute('cy', String(H - 6));
    c.setAttribute('r', String(Math.min(6, 2.5 + p.errors)));
    c.style.animationDelay = `${300 + (i / points.length) * 900}ms`;
    svg.append(c);
  });
  requestAnimationFrame(() => {
    const len = Math.ceil(line.getTotalLength?.() ?? 2000);
    line.style.setProperty('--len', String(len));
  });
  line.style.setProperty('--len', '4000');
  return svg;
}

const keyName = (c: string) => (c === ' ' ? 'espaço' : c === '\n' ? '↵' : c);

export function openResults(
  summary: Summary & { texts?: number },
  ctx: Context,
  points: TimelinePoint[],
  record: { record: boolean; previous: Entry | null },
  layout: Layout,
  actions: ResultActions,
): Overlay {
  const isTest = ctx.mode === 'test';
  const subtitle = [
    isTest ? 'Teste' : 'Sessão livre',
    KIND_LABELS[ctx.kind],
    ctx.kind === 'custom' ? null : SIZE_LABELS[ctx.size],
    ctx.kind === 'custom' ? null : COMPLEXITY_LABELS[ctx.complexity],
  ]
    .filter(Boolean)
    .join(' · ');

  const head = el(
    'div',
    { class: 'sheet-head' },
    el('div', {}, el('h2', { text: 'Diagnóstico' }), el('p', { text: `${subtitle}. ${verdict(summary)}` })),
    isTest && record.record
      ? el('span', { class: 'badge' }, icon('trophy', 15), record.previous ? `Novo recorde! Antes: ${formatX100(record.previous.netPerMinX100)}` : 'Primeiro recorde nesta categoria')
      : null,
  );

  const hero = el(
    'div',
    { class: 'hero' },
    card('Toques líquidos por minuto', counter(summary.netPerMinX100 / 100, int, 120), `${formatX100(summary.wpmX100, 1)} palavras por minuto`, 0, 'main'),
    card(isTest ? 'Tempo final' : 'Tempo ativo', counter(summary.durationMs, formatDuration, 160), isTest ? 'do primeiro ao último toque' : 'pausas longas não contam', 1),
    card('Precisão', counter(summary.accuracyBp, (v) => formatBp(Math.round(v)), 200), `${int(summary.correct)} de ${int(summary.keystrokes)} toques certos`, 2, summary.accuracyBp >= 9500 ? 'good' : summary.accuracyBp < 9000 ? 'bad' : ''),
  );

  const cards = el(
    'div',
    { class: 'cards' },
    card('Toques brutos', counter(summary.keystrokes, int, 260), 'todos os caracteres digitados', 3),
    card('Acertos', counter(summary.correct, int, 300), 'toques na tecla certa', 4, 'good'),
    card('Erros', counter(summary.errors, int, 340), `${int(summary.corrected)} corrigidos · ${int(summary.uncorrected)} não corrigidos`, 5, summary.errors ? 'bad' : ''),
    card('Toques líquidos', counter(summary.net, int, 380), `brutos − ${ERROR_PENALTY} × não corrigidos`, 6),
    card('Palavras por minuto', counter(summary.wpmX100 / 100, (v) => formatX100(v * 100, 1), 420), `brutas: ${formatX100(summary.rawWpmX100, 1)}`, 7),
    card('Consistência', el('span', { class: 'val', text: formatBp(summary.consistencyBp, 0) }), summary.consistencyBp == null ? 'precisa de 3 segundos ou mais' : 'ritmo estável entre os segundos', 8),
    card('Maior sequência', counter(summary.maxStreak, int, 460), 'toques certos seguidos', 9),
    card(isTest ? 'Caracteres' : 'Textos', counter(isTest ? summary.chars : (summary.texts ?? 1), int, 500), isTest ? `${int(summary.backspaces)} apagados` : `${int(summary.chars)} caracteres`, 10),
  );

  const formula = el(
    'p',
    { class: 'formula' },
    el('b', { text: 'Como calculamos: ' }),
    `toques líquidos = toques brutos − ${ERROR_PENALTY} × erros não corrigidos; precisão = acertos ÷ toques brutos; palavras por minuto = toques líquidos por minuto ÷ 5.`,
  );

  const body = el('div', {}, head, hero, cards, formula);

  const svg = isTest ? chart(points) : null;
  const missed = Object.entries(summary.missed)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const train = el('div', { class: 'chart-box' }, el('h3', { text: 'Teclas para treinar' }));
  if (missed.length) {
    const list = el('div', { class: 'keys-to-train' });
    missed.forEach(([c, n], i) => {
      const d = describe(c, layout);
      list.append(el('span', { class: 'keycap', style: { '--i': String(i) }, title: d.text }, el('b', { text: keyName(c) }), `${n} ${n === 1 ? 'erro' : 'erros'}`));
    });
    train.append(list);
  } else {
    train.append(el('p', { class: 'formula', text: 'Nenhum erro. Impecável!' }));
  }

  if (svg) {
    const box = el('div', { class: 'chart-box' }, el('h3', {}, el('span', { text: 'Ritmo (palavras por minuto a cada segundo)' }), el('span', { text: '● erros' })));
    box.append(svg);
    body.append(box);
  }
  body.append(train);

  const nextBtn = el('button', { class: 'btn primary', type: 'button' }, icon('next', 16), 'Próximo texto', el('kbd', { text: 'Enter' }));
  const repeatBtn = actions.repeat ? el('button', { class: 'btn', type: 'button' }, icon('restart', 16), 'Repetir este texto', el('kbd', { text: 'R' })) : null;
  const histBtn = el('button', { class: 'btn ghost', type: 'button' }, icon('history', 16), 'Histórico e recordes');
  body.append(el('div', { class: 'sheet-foot' }, el('div', { class: 'grp' }, histBtn), el('div', { class: 'grp' }, repeatBtn, nextBtn)));

  let chosen: (() => void) | null = null;
  const overlay = openSheet(body, {
    label: 'Diagnóstico',
    onClose: () => {
      body.removeEventListener('keydown', keys);
      if (chosen) chosen();
      else actions.closed();
    },
  });
  const pick = (fn: () => void) => {
    chosen = fn;
    overlay.close();
  };
  nextBtn.addEventListener('click', () => pick(actions.next));
  repeatBtn?.addEventListener('click', () => pick(actions.repeat as () => void));
  histBtn.addEventListener('click', () => pick(actions.history));
  const keys = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLButtonElement && e.key === 'Enter') return;
    if (e.key === 'Enter') {
      e.preventDefault();
      pick(actions.next);
    } else if ((e.key === 'r' || e.key === 'R') && actions.repeat && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      pick(actions.repeat);
    }
  };
  body.addEventListener('keydown', keys);
  setTimeout(() => nextBtn.focus({ preventScroll: true }), 50);
  return overlay;
}
