import { el } from './ui.ts';

export type Finger = 'lp' | 'lr' | 'lm' | 'li' | 'ri' | 'rm' | 'rr' | 'rp' | 'th';

export const FINGER_COLORS: Record<Finger, string> = {
  lp: '#f2b5a7',
  lr: '#f4d58d',
  lm: '#b8d8a8',
  li: '#9fcbe0',
  ri: '#b9b5ea',
  rm: '#e8b3d4',
  rr: '#f0c39a',
  rp: '#a8d8cf',
  th: '#d9d1ce',
};

export const FINGER_NAMES: Record<Finger, string> = {
  lp: 'mínimo esquerdo',
  lr: 'anelar esquerdo',
  lm: 'médio esquerdo',
  li: 'indicador esquerdo',
  ri: 'indicador direito',
  rm: 'médio direito',
  rr: 'anelar direito',
  rp: 'mínimo direito',
  th: 'polegar',
};

interface KeyDef {
  code: string;
  label: string;
  alt?: string;
  w?: number;
  finger: Finger;
  mod?: boolean;
  home?: boolean;
  cls?: string;
}

const k = (code: string, label: string, finger: Finger, extra: Partial<KeyDef> = {}): KeyDef => ({ code, label, finger, ...extra });
const letter = (c: string, finger: Finger, home = false): KeyDef => k(`Key${c.toUpperCase()}`, c.toUpperCase(), finger, { home });

const MAIN: KeyDef[][] = [
  [
    k('Backquote', "'", 'lp', { alt: '"' }), k('Digit1', '1', 'lp', { alt: '!' }), k('Digit2', '2', 'lr', { alt: '@' }),
    k('Digit3', '3', 'lm', { alt: '#' }), k('Digit4', '4', 'li', { alt: '$' }), k('Digit5', '5', 'li', { alt: '%' }),
    k('Digit6', '6', 'ri', { alt: '¨' }), k('Digit7', '7', 'ri', { alt: '&' }), k('Digit8', '8', 'rm', { alt: '*' }),
    k('Digit9', '9', 'rr', { alt: '(' }), k('Digit0', '0', 'rp', { alt: ')' }), k('Minus', '-', 'rp', { alt: '_' }),
    k('Equal', '=', 'rp', { alt: '+' }), k('Backspace', '⌫', 'rp', { w: 2, mod: true }),
  ],
  [
    k('Tab', 'Tab', 'lp', { w: 1.5, mod: true }), letter('q', 'lp'), letter('w', 'lr'), letter('e', 'lm'), letter('r', 'li'), letter('t', 'li'),
    letter('y', 'ri'), letter('u', 'ri'), letter('i', 'rm'), letter('o', 'rr'), letter('p', 'rp'),
    k('BracketLeft', '´', 'rp', { alt: '`' }), k('BracketRight', '[', 'rp', { alt: '{' }), k('Enter', '↵', 'rp', { w: 1.5, mod: true }),
  ],
  [
    k('CapsLock', 'Caps', 'lp', { w: 1.75, mod: true }), letter('a', 'lp'), letter('s', 'lr'), letter('d', 'lm'), letter('f', 'li', true),
    letter('g', 'li'), letter('h', 'ri'), letter('j', 'ri', true), letter('k', 'rm'), letter('l', 'rr'),
    k('Semicolon', 'Ç', 'rp'), k('Quote', '~', 'rp', { alt: '^' }), k('Backslash', ']', 'rp', { alt: '}' }),
    k('Enter', '', 'rp', { w: 1.25, mod: true }),
  ],
  [
    k('ShiftLeft', 'Shift', 'lp', { w: 1.25, mod: true }), k('IntlBackslash', '\\', 'lp', { alt: '|' }), letter('z', 'lp'), letter('x', 'lr'),
    letter('c', 'lm'), letter('v', 'li'), letter('b', 'li'), letter('n', 'ri'), letter('m', 'ri'), k('Comma', ',', 'rm', { alt: '<' }),
    k('Period', '.', 'rr', { alt: '>' }), k('Slash', ';', 'rp', { alt: ':' }), k('IntlRo', '/', 'rp', { alt: '?' }),
    k('ShiftRight', 'Shift', 'rp', { w: 1.75, mod: true }),
  ],
  [
    k('ControlLeft', 'Ctrl', 'lp', { w: 1.5, mod: true }), k('MetaLeft', 'Win', 'lp', { mod: true }), k('AltLeft', 'Alt', 'th', { w: 1.5, mod: true }),
    k('Space', 'espaço', 'th', { w: 7, mod: true }), k('AltRight', 'AltGr', 'th', { w: 1.5, mod: true }), k('ContextMenu', '☰', 'rp', { mod: true }),
    k('ControlRight', 'Ctrl', 'rp', { w: 1.5, mod: true }),
  ],
];

const NUMPAD: KeyDef[] = [
  k('NumLock', 'Num', 'ri', { mod: true }), k('NumpadDivide', '/', 'rm'), k('NumpadMultiply', '*', 'rr'), k('NumpadSubtract', '-', 'rp'),
  k('Numpad7', '7', 'ri'), k('Numpad8', '8', 'rm'), k('Numpad9', '9', 'rr'), k('NumpadAdd', '+', 'rp', { cls: 'tall' }),
  k('Numpad4', '4', 'ri', { home: false }), k('Numpad5', '5', 'rm', { home: true }), k('Numpad6', '6', 'rr'),
  k('Numpad1', '1', 'ri'), k('Numpad2', '2', 'rm'), k('Numpad3', '3', 'rr'), k('NumpadEnter', '↵', 'rp', { cls: 'tall' }),
  k('Numpad0', '0', 'th', { cls: 'wide' }), k('NumpadDecimal', ',', 'rr'),
];

export interface Stroke {
  code: string;
  shift: boolean;
}

const FINGER_OF = new Map<string, Finger>();
for (const row of MAIN) for (const d of row) FINGER_OF.set(d.code, d.finger);
for (const d of NUMPAD) FINGER_OF.set(d.code, d.finger);

const MAIN_STROKES = new Map<string, Stroke[]>();
const plain = (code: string): Stroke => ({ code, shift: false });
const shifted = (code: string): Stroke => ({ code, shift: true });
const ACUTE = plain('BracketLeft');
const GRAVE = shifted('BracketLeft');
const TILDE = plain('Quote');
const CIRC = shifted('Quote');
const UML = shifted('Digit6');

for (const c of 'abcdefghijklmnopqrstuvwxyz') {
  MAIN_STROKES.set(c, [plain(`Key${c.toUpperCase()}`)]);
  MAIN_STROKES.set(c.toUpperCase(), [shifted(`Key${c.toUpperCase()}`)]);
}
for (let d = 0; d <= 9; d++) MAIN_STROKES.set(String(d), [plain(`Digit${d}`)]);
const SHIFT_DIGITS = ')!@#$%¨&*(';
for (let d = 0; d <= 9; d++) if (d !== 6) MAIN_STROKES.set(SHIFT_DIGITS[d] as string, [shifted(`Digit${d}`)]);
const DIRECT: [string, Stroke][] = [
  [' ', plain('Space')], ['\n', plain('Enter')], ["'", plain('Backquote')], ['"', shifted('Backquote')],
  ['-', plain('Minus')], ['_', shifted('Minus')], ['=', plain('Equal')], ['+', shifted('Equal')],
  ['[', plain('BracketRight')], ['{', shifted('BracketRight')], [']', plain('Backslash')], ['}', shifted('Backslash')],
  ['ç', plain('Semicolon')], ['Ç', shifted('Semicolon')], [',', plain('Comma')], ['<', shifted('Comma')],
  ['.', plain('Period')], ['>', shifted('Period')], [';', plain('Slash')], [':', shifted('Slash')],
  ['/', plain('IntlRo')], ['?', shifted('IntlRo')], ['\\', plain('IntlBackslash')], ['|', shifted('IntlBackslash')],
];
for (const [c, s] of DIRECT) MAIN_STROKES.set(c, [s]);
const DEAD: [Stroke, string, string][] = [
  [ACUTE, 'aeiou', 'áéíóú'],
  [GRAVE, 'a', 'à'],
  [CIRC, 'aeo', 'âêô'],
  [TILDE, 'ao', 'ãõ'],
  [UML, 'u', 'ü'],
];
for (const [dead, base, out] of DEAD) {
  for (let i = 0; i < base.length; i++) {
    const b = base[i] as string;
    const o = out[i] as string;
    MAIN_STROKES.set(o, [dead, plain(`Key${b.toUpperCase()}`)]);
    MAIN_STROKES.set(o.toUpperCase(), [dead, shifted(`Key${b.toUpperCase()}`)]);
  }
}
MAIN_STROKES.set('´', [ACUTE, plain('Space')]);
MAIN_STROKES.set('`', [GRAVE, plain('Space')]);
MAIN_STROKES.set('~', [TILDE, plain('Space')]);
MAIN_STROKES.set('^', [CIRC, plain('Space')]);
MAIN_STROKES.set('¨', [UML, plain('Space')]);

const NUMPAD_STROKES = new Map<string, Stroke[]>([
  [',', [plain('NumpadDecimal')]],
  ['+', [plain('NumpadAdd')]],
  ['-', [plain('NumpadSubtract')]],
  ['*', [plain('NumpadMultiply')]],
  ['/', [plain('NumpadDivide')]],
  ['\n', [plain('NumpadEnter')]],
]);
for (let d = 0; d <= 9; d++) NUMPAD_STROKES.set(String(d), [plain(`Numpad${d}`)]);

export type Layout = 'main' | 'numpad';

export const strokesFor = (ch: string, layout: Layout = 'main'): Stroke[] | null =>
  (layout === 'numpad' ? NUMPAD_STROKES.get(ch) : undefined) ?? MAIN_STROKES.get(ch) ?? null;

export const fingerOf = (code: string): Finger | undefined => FINGER_OF.get(code);

const isLeft = (f: Finger | undefined) => f === 'lp' || f === 'lr' || f === 'lm' || f === 'li';

const DEAD_NAMES: Record<string, string> = {
  'BracketLeft:false': 'acento agudo (´)',
  'BracketLeft:true': 'crase (`)',
  'Quote:false': 'til (~)',
  'Quote:true': 'circunflexo (^)',
  'Digit6:true': 'trema (¨)',
};

export function describe(ch: string, layout: Layout): { text: string; finger: Finger | null } {
  const strokes = strokesFor(ch, layout);
  if (!strokes) return { text: `Digite “${ch}”`, finger: null };
  const last = strokes[strokes.length - 1] as Stroke;
  const finger = fingerOf(last.code) ?? null;
  const shown = ch === ' ' ? 'espaço' : ch === '\n' ? 'Enter' : ch;
  const fingerText = finger ? `, ${FINGER_NAMES[finger]}` : '';
  if (strokes.length > 1) {
    const dead = strokes[0] as Stroke;
    const name = DEAD_NAMES[`${dead.code}:${dead.shift}`] ?? 'acento';
    const then = last.code === 'Space' ? 'espaço' : last.shift ? `Shift + ${shown.normalize('NFD')[0]?.toUpperCase()}` : shown.normalize('NFD')[0];
    return { text: `“${shown}”: ${name} e depois ${then}${fingerText}`, finger };
  }
  return { text: `“${shown}”${last.shift ? ' com Shift' : ''}${fingerText}`, finger };
}

export class Keyboard {
  private keys = new Map<string, HTMLElement[]>();
  private marked: HTMLElement[] = [];
  layout: Layout = 'main';

  private root: HTMLElement;
  private hint: HTMLElement;

  constructor(root: HTMLElement, hint: HTMLElement) {
    this.root = root;
    this.hint = hint;
    this.render();
  }

  setLayout(layout: Layout) {
    if (layout === this.layout && this.keys.size) return;
    this.layout = layout;
    this.render();
  }

  private add(def: KeyDef, parent: HTMLElement) {
    const node = el(
      'span',
      {
        class: `key${def.mod ? ' mod' : ''}${def.home ? ' home' : ''}${def.cls ? ` ${def.cls}` : ''}`,
        'data-code': def.code,
        style: { '--w': String(def.w ?? 1), '--finger': FINGER_COLORS[def.finger] },
      },
      def.alt ? el('span', { class: 'alt', text: def.alt }) : null,
      el('span', { text: def.label }),
    );
    parent.append(node);
    const list = this.keys.get(def.code) ?? [];
    list.push(node);
    this.keys.set(def.code, list);
  }

  private render() {
    this.root.replaceChildren();
    this.keys.clear();
    this.marked = [];
    this.root.classList.toggle('numpad', this.layout === 'numpad');
    if (this.layout === 'numpad') {
      for (const def of NUMPAD) this.add(def, this.root);
      return;
    }
    for (const row of MAIN) {
      const r = el('div', { class: 'kb-row' });
      for (const def of row) this.add(def, r);
      this.root.append(r);
    }
  }

  showNext(ch: string | null) {
    for (const n of this.marked) n.classList.remove('next', 'then');
    this.marked = [];
    if (ch == null) {
      this.hint.replaceChildren();
      return;
    }
    const strokes = strokesFor(ch, this.layout);
    if (!strokes) {
      this.hint.replaceChildren(el('span', { text: `Digite “${ch}”` }));
      return;
    }
    strokes.forEach((s, i) => {
      for (const n of this.keys.get(s.code) ?? []) {
        n.classList.add(i === 0 ? 'next' : 'then');
        this.marked.push(n);
      }
      if (s.shift) {
        const side = isLeft(fingerOf(s.code)) ? 'ShiftRight' : 'ShiftLeft';
        for (const n of this.keys.get(side) ?? []) {
          n.classList.add(i === 0 ? 'next' : 'then');
          this.marked.push(n);
        }
      }
    });
    const d = describe(ch, this.layout);
    this.hint.replaceChildren(
      el('i', { style: { '--finger': d.finger ? FINGER_COLORS[d.finger] : 'var(--accent)' } }),
      el('span', { text: d.text }),
    );
  }

  press(code: string) {
    for (const n of this.keys.get(code) ?? []) n.classList.add('down');
  }

  release(code: string) {
    for (const n of this.keys.get(code) ?? []) n.classList.remove('down');
  }

  releaseAll() {
    this.root.querySelectorAll('.down').forEach((n) => n.classList.remove('down'));
  }

  flash(code: string, ok: boolean) {
    for (const n of this.keys.get(code) ?? []) {
      if (typeof n.animate === 'function') {
        n.animate(
          ok
            ? [{ transform: 'translateY(2px) scale(0.93)' }, { transform: 'none' }]
            : [{ transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }, { transform: 'none' }],
          { duration: ok ? 240 : 300, easing: 'cubic-bezier(0.22, 1.2, 0.36, 1)' },
        );
      }
      if (!ok) {
        n.classList.add('miss');
        setTimeout(() => n.classList.remove('miss'), 320);
      }
    }
  }
}
