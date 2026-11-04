import { featherPixels, reducedMotion } from './ui.ts';

interface Particle {
  kind: 'spark' | 'feather';
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  rot: number;
  vr: number;
  phase: number;
}

const PIXELS = featherPixels();
const SPRITE_W = 13;
const SPRITE_H = 18;
const PAD = 40;

export class Effects {
  private ctx: CanvasRenderingContext2D | null;
  private parts: Particle[] = [];
  private raf = 0;
  private last = 0;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private sprites = new Map<string, HTMLCanvasElement>();

  private canvas: HTMLCanvasElement;
  private host: HTMLElement;

  constructor(canvas: HTMLCanvasElement, host: HTMLElement) {
    this.canvas = canvas;
    this.host = host;
    this.ctx = canvas.getContext('2d');
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
  }

  private resize() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.width = this.host.clientWidth + PAD * 2;
    this.height = this.host.clientHeight + PAD * 2;
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
  }

  private color(name: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#5d1c16';
  }

  private sprite(color: string): HTMLCanvasElement {
    const cached = this.sprites.get(color);
    if (cached) return cached;
    const c = document.createElement('canvas');
    c.width = SPRITE_W;
    c.height = SPRITE_H;
    const g = c.getContext('2d');
    if (g) {
      g.fillStyle = color;
      for (const [x, y] of PIXELS) g.fillRect(x, y, 1, 1);
    }
    this.sprites.set(color, c);
    return c;
  }

  sparks(x: number, y: number, count: number, tone: 'accent' | 'danger' | 'mix' = 'accent') {
    if (reducedMotion() || !this.ctx) return;
    const colors =
      tone === 'danger' ? [this.color('--danger')] : tone === 'mix' ? [this.color('--accent'), this.color('--highlight'), this.color('--secondary')] : [this.color('--accent'), this.color('--highlight')];
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
      const speed = 1.6 + Math.random() * 3.2;
      this.parts.push({
        kind: 'spark',
        x: x + PAD,
        y: y + PAD,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: 0,
        max: 520 + Math.random() * 380,
        size: Math.random() < 0.3 ? 4 : 3,
        color: colors[i % colors.length] as string,
        rot: 0,
        vr: 0,
        phase: 0,
      });
    }
    this.kick();
  }

  feathers(count: number) {
    if (reducedMotion() || !this.ctx) return;
    const colors = [this.color('--accent'), this.color('--secondary'), this.color('--text-muted')];
    for (let i = 0; i < count; i++) {
      this.parts.push({
        kind: 'feather',
        x: PAD + Math.random() * (this.width - PAD * 2),
        y: PAD - 30 - Math.random() * 80,
        vx: (Math.random() - 0.5) * 0.4,
        vy: 0.45 + Math.random() * 0.55,
        life: 0,
        max: 2000 + Math.random() * 900,
        size: Math.random() < 0.5 ? 2 : 3,
        color: colors[i % colors.length] as string,
        rot: (Math.random() - 0.5) * 0.8,
        vr: (Math.random() - 0.5) * 0.002,
        phase: Math.random() * Math.PI * 2,
      });
    }
    this.kick();
  }

  clear() {
    this.parts = [];
    this.ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private kick() {
    if (this.raf) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    const ctx = this.ctx;
    if (!ctx) return;
    const dt = Math.min(48, now - this.last);
    this.last = now;
    const f = dt / 16.67;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.imageSmoothingEnabled = false;
    this.parts = this.parts.filter((p) => (p.life += dt) < p.max);
    for (const p of this.parts) {
      const t = p.life / p.max;
      if (p.kind === 'spark') {
        p.vy += 0.16 * f;
        p.vx *= 0.985;
        p.x += p.vx * f;
        p.y += p.vy * f;
        ctx.globalAlpha = Math.max(0, 1 - t * t);
        ctx.fillStyle = p.color;
        const s = p.size * (1 - t * 0.4);
        ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), Math.round(s), Math.round(s));
      } else {
        p.phase += 0.045 * f;
        p.x += (p.vx + Math.sin(p.phase) * 0.7) * f;
        p.y += p.vy * f;
        p.rot += p.vr * dt + Math.sin(p.phase) * 0.004 * f;
        ctx.globalAlpha = t < 0.12 ? t / 0.12 : Math.max(0, 1 - (t - 0.6) / 0.4);
        ctx.save();
        ctx.translate(Math.round(p.x), Math.round(p.y));
        ctx.rotate(p.rot);
        ctx.drawImage(this.sprite(p.color), (-SPRITE_W * p.size) / 2, (-SPRITE_H * p.size) / 2, SPRITE_W * p.size, SPRITE_H * p.size);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    this.raf = this.parts.length ? requestAnimationFrame(this.frame) : 0;
  };
}
