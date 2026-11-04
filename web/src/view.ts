import { el, reducedMotion } from './ui.ts';
import type { Caret } from './prefs.ts';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  line: number;
}

interface Spring {
  v: number;
  t: number;
}

const spring = (v = 0): Spring => ({ v, t: v });

const MAX_LINES = 3;

export class TextView {
  private spans: HTMLSpanElement[] = [];
  private base: string[] = [];
  private boxes: Box[] = [];
  private lineTops: number[] = [];
  private target: string[] = [];
  private pos = 0;
  private caretMode: Caret = 'line';
  private cx = spring();
  private cy = spring();
  private cw = spring(2.5);
  private gx = spring();
  private gy = spring();
  private gw = spring();
  private go = spring();
  private sy = spring();
  private raf = 0;
  private last = 0;
  private idleTimer = 0;
  private caretHeight = 32;
  private glowHeight = 38;
  private visibleLines = MAX_LINES;
  private fontSize = 26;
  private missTimer = 0;

  private viewport: HTMLElement;
  private scroller: HTMLElement;
  private text: HTMLElement;
  private caret: HTMLElement;
  private glow: HTMLElement;

  constructor(viewport: HTMLElement, scroller: HTMLElement, text: HTMLElement, caret: HTMLElement, glow: HTMLElement) {
    this.viewport = viewport;
    this.scroller = scroller;
    this.text = text;
    this.caret = caret;
    this.glow = glow;
    new ResizeObserver(() => {
      if (!this.target.length) return;
      this.measure();
      this.place(true);
    }).observe(this.viewport);
  }

  render(value: string, options: { numpad: boolean; enter: boolean }) {
    this.target = Array.from(value);
    this.spans = [];
    this.base = [];
    const frag = document.createDocumentFragment();
    let word: HTMLSpanElement | null = null;
    this.target.forEach((ch, i) => {
      let cls = 'c';
      let shown = ch;
      if (ch === ' ') cls = 'c sp';
      else if (ch === '\n') {
        cls = 'c nl';
        shown = '↵';
      }
      const span = el('span', { class: cls, text: shown });
      if (options.enter && i < 120) span.style.setProperty('--i', String(i));
      this.spans.push(span);
      this.base.push(cls);
      if (ch === ' ' || ch === '\n') {
        if (word) word.append(span);
        else frag.append(span);
        word = null;
        frag.append(ch === '\n' && !options.numpad ? el('br') : '\u200b');
      } else {
        if (!word) {
          word = el('span', { class: 'w' });
          frag.append(word);
        }
        word.append(span);
      }
    });
    this.text.classList.remove('leave');
    this.text.classList.toggle('enter', options.enter && !reducedMotion());
    this.text.replaceChildren(frag);
    if (options.enter) setTimeout(() => this.text.classList.remove('enter'), 1000);
    this.pos = 0;
    this.measure();
    this.sy.v = this.sy.t = 0;
    this.place(true);
  }

  leave(): Promise<void> {
    if (reducedMotion() || !this.spans.length) return Promise.resolve();
    this.text.classList.add('leave');
    this.caret.classList.add('hide');
    this.glow.style.opacity = '0';
    return new Promise((r) => setTimeout(r, 170));
  }

  private measure() {
    const style = getComputedStyle(this.text);
    const size = parseFloat(style.fontSize) || 26;
    this.fontSize = size;
    this.caretHeight = this.caretMode === 'underline' ? 3 : Math.round(size * 1.25);
    this.glowHeight = Math.round(size * 1.45);
    const tops: number[] = [];
    this.boxes = this.spans.map((s) => {
      const b = { x: s.offsetLeft, y: s.offsetTop, w: s.offsetWidth, h: s.offsetHeight, line: 0 };
      if (!tops.length || Math.abs((tops[tops.length - 1] as number) - b.y) > 2) {
        if (!tops.some((t) => Math.abs(t - b.y) <= 2)) tops.push(b.y);
      }
      return b;
    });
    tops.sort((a, b) => a - b);
    this.lineTops = tops;
    for (const b of this.boxes) {
      let line = 0;
      for (let i = 0; i < tops.length; i++) if (Math.abs((tops[i] as number) - b.y) <= 2) line = i;
      b.line = line;
    }
    const lines = Math.max(1, Math.min(MAX_LINES, tops.length));
    if (lines !== this.visibleLines) {
      this.visibleLines = lines;
      this.viewport.style.setProperty('--lines', String(lines));
    }
  }

  setCaretMode(mode: Caret) {
    this.caretMode = mode;
    this.caret.classList.toggle('block', mode === 'block');
    this.caret.classList.toggle('underline', mode === 'underline');
    if (this.target.length) {
      this.measure();
      this.place(true);
    }
  }

  mark(i: number, status: 'ok' | 'err' | 'pending') {
    const s = this.spans[i];
    if (!s) return;
    const base = this.base[i] as string;
    s.className = status === 'pending' ? base : `${base} ${status}`;
  }

  markAll(statuses: ('ok' | 'err' | 'pending')[]) {
    statuses.forEach((st, i) => this.mark(i, st));
  }

  setPosition(pos: number, immediate = false) {
    this.pos = Math.max(0, Math.min(pos, this.target.length));
    this.place(immediate);
    this.activity();
  }

  miss() {
    this.caret.classList.add('miss');
    clearTimeout(this.missTimer);
    this.missTimer = window.setTimeout(() => this.caret.classList.remove('miss'), 260);
  }

  hideCaret(hidden: boolean) {
    this.caret.classList.toggle('hide', hidden);
  }

  private activity() {
    this.caret.classList.remove('idle');
    clearTimeout(this.idleTimer);
    this.idleTimer = window.setTimeout(() => this.caret.classList.add('idle'), 650);
  }

  private wordRange(pos: number): [number, number] | null {
    const sep = (c: string | undefined) => c === ' ' || c === '\n';
    let p = pos;
    if (p >= this.target.length) return null;
    if (sep(this.target[p])) p++;
    if (p >= this.target.length || sep(this.target[p])) return null;
    let s = p;
    while (s > 0 && !sep(this.target[s - 1])) s--;
    let e = p;
    while (e < this.target.length && !sep(this.target[e])) e++;
    return [s, e];
  }

  private place(immediate: boolean) {
    if (!this.boxes.length) {
      this.caret.classList.add('hide');
      return;
    }
    this.caret.classList.remove('hide');
    const atEnd = this.pos >= this.boxes.length;
    const b = (atEnd ? this.boxes[this.boxes.length - 1] : this.boxes[this.pos]) as Box;
    const x = atEnd ? b.x + b.w : b.x;
    const width = this.caretMode === 'line' ? 2.5 : Math.max(8, atEnd ? b.w * 0.6 : b.w);
    const y = this.caretMode === 'underline' ? b.y + b.h / 2 + this.fontSize * 0.55 : b.y + (b.h - this.caretHeight) / 2;
    this.cx.t = x - (this.caretMode === 'line' ? 1 : 0);
    this.cy.t = y;
    this.cw.t = width;
    this.caret.style.height = `${this.caretHeight}px`;

    const range = this.wordRange(this.pos);
    if (range) {
      const first = this.boxes[range[0]] as Box;
      const lastBox = this.boxes[range[1] - 1] as Box;
      const sameLine = first.line === lastBox.line;
      const right = sameLine ? lastBox.x + lastBox.w : first.x + first.w;
      this.gx.t = first.x - 5;
      this.gy.t = first.y + (first.h - this.glowHeight) / 2;
      this.gw.t = right - first.x + 10;
      this.go.t = 1;
      if (this.go.v < 0.05) {
        this.gx.v = this.gx.t;
        this.gy.v = this.gy.t;
        this.gw.v = this.gw.t;
      }
    } else {
      this.go.t = 0;
    }
    this.glow.style.height = `${this.glowHeight}px`;

    const line = b.line;
    const maxLine = Math.max(0, this.lineTops.length - this.visibleLines);
    const scrollLine = Math.max(0, Math.min(line - 1, maxLine));
    const top0 = this.lineTops[0] ?? 0;
    this.sy.t = (this.lineTops[scrollLine] ?? top0) - top0;

    if (immediate || reducedMotion()) {
      for (const s of [this.cx, this.cy, this.cw, this.gx, this.gy, this.gw, this.go, this.sy]) s.v = s.t;
      this.apply();
      return;
    }
    this.kick();
  }

  private kick() {
    if (this.raf) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    const dt = Math.min(64, Math.max(1, now - this.last));
    this.last = now;
    const k = (tau: number) => 1 - Math.exp(-dt / tau);
    const step = (s: Spring, tau: number) => {
      s.v += (s.t - s.v) * k(tau);
      if (Math.abs(s.t - s.v) < 0.05) s.v = s.t;
      return s.v !== s.t;
    };
    let moving = false;
    moving = step(this.cx, 26) || moving;
    moving = step(this.cy, 34) || moving;
    moving = step(this.cw, 40) || moving;
    moving = step(this.gx, 55) || moving;
    moving = step(this.gy, 55) || moving;
    moving = step(this.gw, 55) || moving;
    moving = step(this.go, 70) || moving;
    moving = step(this.sy, 120) || moving;
    this.apply();
    this.raf = moving ? requestAnimationFrame(this.frame) : 0;
  };

  private apply() {
    this.caret.style.transform = `translate3d(${this.cx.v}px, ${this.cy.v}px, 0)`;
    this.caret.style.width = `${this.cw.v}px`;
    this.glow.style.transform = `translate3d(${this.gx.v}px, ${this.gy.v}px, 0)`;
    this.glow.style.width = `${Math.max(0, this.gw.v)}px`;
    this.glow.style.opacity = String(0.75 * this.go.v);
    this.scroller.style.transform = `translate3d(0, ${-this.sy.v}px, 0)`;
  }

  caretPoint(): { x: number; y: number } {
    return {
      x: this.viewport.offsetLeft + this.cx.t + this.cw.t / 2,
      y: this.viewport.offsetTop + this.cy.t - this.sy.t + this.caretHeight / 2,
    };
  }

  charPoint(i: number): { x: number; y: number } | null {
    const b = this.boxes[i];
    if (!b) return null;
    return { x: this.viewport.offsetLeft + b.x + b.w / 2, y: this.viewport.offsetTop + b.y - this.sy.t + b.h / 2 };
  }

  get length(): number {
    return this.target.length;
  }
}
