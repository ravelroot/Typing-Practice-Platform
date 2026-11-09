import { LANES, STEPS_PER_BAR, type Note, type Song } from './chart.ts';
import { GRADE_LABELS, type Grade } from './judge.ts';
import { reducedMotion } from './ui.ts';

export interface Frame {
  t: number;
  grades: readonly (Grade | null)[];
  holding: (note: Note) => boolean;
  combo: number;
  banner: string | null;
  bannerAge: number;
}

interface Palette {
  bg: string;
  lanes: string[];
  line: string;
  grid: string;
  text: string;
  miss: string;
  mono: string;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
}

interface Pop {
  lane: number;
  text: string;
  color: string;
  born: number;
}

interface Snap {
  x: number;
  top: number;
  bottom: number;
  color: string;
  born: number;
}

const POP_MS = 650;
const SNAP_MS = 320;
const MAX_SPARKS = 320;

export class Stage {
  private ctx: CanvasRenderingContext2D | null;
  private canvas: HTMLCanvasElement;
  private host: HTMLElement;
  private song: Song | null = null;
  private colors: Palette | null = null;
  private dpr = 1;
  private sparks: Spark[] = [];
  private pops: Pop[] = [];
  private snaps: Snap[] = [];
  private flashes = new Float32Array(LANES);
  private flashMiss = new Uint8Array(LANES);
  private comboBump = 0;
  private lastCombo = 0;
  private last = 0;
  width = 0;
  height = 0;
  hitY = 0;
  radius = 18;
  lanesX: number[] = [];
  onLayout: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement, host: HTMLElement) {
    this.canvas = canvas;
    this.host = host;
    this.ctx = canvas.getContext('2d');
    new ResizeObserver(() => this.resize()).observe(host);
    new MutationObserver(() => (this.colors = null)).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-palette'] });
    this.resize();
  }

  setSong(song: Song | null) {
    this.song = song;
    this.clearFx();
  }

  clearFx() {
    this.sparks = [];
    this.pops = [];
    this.snaps = [];
    this.flashes.fill(0);
    this.comboBump = 0;
    this.lastCombo = 0;
  }

  private resize() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.width = w;
    this.height = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    const spacing = Math.min(w / 4.4, 170);
    this.radius = Math.max(13, Math.min(21, spacing * 0.13));
    this.lanesX = Array.from({ length: LANES }, (_, i) => w / 2 + (i - (LANES - 1) / 2) * spacing);
    this.hitY = Math.round(h - Math.max(104, Math.min(150, h * 0.3)));
    this.host.style.setProperty('--hit', `${this.hitY}px`);
    this.onLayout?.();
  }

  private palette(): Palette {
    if (this.colors) return this.colors;
    const cs = getComputedStyle(this.host);
    const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
    const hot = v('--rh-hot', '#ee7d32');
    this.colors = {
      bg: v('--rh-bg', '#121112'),
      lanes: [hot, hot, v('--rh-cool', '#7d9cc9'), v('--rh-cold', '#e6ddce')],
      line: v('--rh-line', 'rgba(230, 225, 215, 0.55)'),
      grid: v('--rh-grid', 'rgba(255, 255, 255, 0.05)'),
      text: v('--rh-text', '#efe6d8'),
      miss: v('--rh-miss', '#e5655b'),
      mono: cs.getPropertyValue('--mono').trim() || 'monospace',
    };
    return this.colors;
  }

  laneColor(lane: number): string {
    return this.palette().lanes[lane] ?? this.palette().text;
  }

  gradeColor(grade: Grade): string {
    const p = this.palette();
    return grade === 'perfect' ? (p.lanes[0] as string) : grade === 'great' ? (p.lanes[2] as string) : grade === 'good' ? p.text : p.miss;
  }

  flash(lane: number, miss = false) {
    if (lane < 0 || lane >= LANES) return;
    this.flashes[lane] = 1;
    this.flashMiss[lane] = miss ? 1 : 0;
  }

  pop(lane: number, grade: Grade) {
    this.pops = this.pops.filter((p) => p.lane !== lane || performance.now() - p.born > 120);
    this.pops.push({ lane, text: GRADE_LABELS[grade], color: this.gradeColor(grade), born: performance.now() });
  }

  burst(lane: number, count: number, color?: string) {
    if (reducedMotion() || lane < 0) return;
    const x = this.lanesX[lane] ?? 0;
    const base = color ?? this.laneColor(lane);
    const p = this.palette();
    for (let i = 0; i < count && this.sparks.length < MAX_SPARKS; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 0.8 + Math.random() * 2.6;
      this.sparks.push({
        x: x + Math.cos(a) * this.radius * 0.5,
        y: this.hitY + Math.sin(a) * this.radius * 0.5,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 0.6,
        life: 0,
        max: 380 + Math.random() * 360,
        size: Math.random() < 0.35 ? 3 : 2,
        color: i % 3 === 0 ? p.text : base,
      });
    }
  }

  snap(note: Note, t: number, broken: boolean) {
    const song = this.song;
    if (!song || reducedMotion()) return;
    const top = this.yAt(note.end, t, song);
    if (top >= this.hitY - 2) return;
    this.snaps.push({ x: this.lanesX[note.lane] ?? 0, top: Math.max(0, top), bottom: this.hitY, color: broken ? this.palette().miss : this.laneColor(note.lane), born: performance.now() });
  }

  private yAt(time: number, t: number, song: Song): number {
    return this.hitY - ((time - t) / song.approach) * (this.hitY + this.radius * 2);
  }

  draw(frame: Frame) {
    const ctx = this.ctx;
    const song = this.song;
    if (!ctx || !this.width) return;
    const now = performance.now();
    const dt = this.last ? Math.min(50, now - this.last) : 16;
    this.last = now;
    const p = this.palette();
    const { width: w, height: h, hitY, radius: r } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = 'round';

    const spacing = (this.lanesX[1] ?? 0) - (this.lanesX[0] ?? 0);
    ctx.strokeStyle = p.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= LANES; i++) {
      const x = Math.round((this.lanesX[0] ?? 0) - spacing / 2 + i * spacing) + 0.5;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    ctx.stroke();

    if (song) this.drawBeats(ctx, song, frame.t, p);

    if (frame.combo !== this.lastCombo) {
      if (frame.combo > this.lastCombo) this.comboBump = 1;
      this.lastCombo = frame.combo;
    }
    this.comboBump = Math.max(0, this.comboBump - dt / 260);
    if (frame.combo >= 2) {
      const size = Math.round(Math.min(84, hitY * 0.26) * (1 + (reducedMotion() ? 0 : this.comboBump * 0.12)));
      ctx.font = `700 ${size}px ${p.mono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = 0.14 + this.comboBump * 0.1;
      ctx.fillStyle = p.text;
      ctx.fillText(String(frame.combo), w / 2, hitY * 0.55);
      ctx.globalAlpha = 1;
    }

    ctx.strokeStyle = p.line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, hitY);
    ctx.lineTo(w, hitY);
    ctx.stroke();

    for (let i = 0; i < LANES; i++) {
      const x = this.lanesX[i] ?? 0;
      const f = this.flashes[i] ?? 0;
      const color = this.flashMiss[i] ? p.miss : this.laneColor(i);
      const rr = r * (1 + f * 0.14);
      ctx.beginPath();
      ctx.arc(x, hitY, rr, 0, Math.PI * 2);
      ctx.fillStyle = p.bg;
      ctx.fill();
      if (f > 0) {
        ctx.globalAlpha = f * 0.45;
        ctx.fillStyle = color;
        ctx.fill();
      }
      ctx.globalAlpha = 0.55 + f * 0.45;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;
      this.flashes[i] = Math.max(0, f - dt / 220);
    }

    if (song) this.drawNotes(ctx, song, frame, p);

    this.drawSnaps(ctx, now);
    this.drawSparks(ctx, dt);
    this.drawPops(ctx, now, p);

    if (frame.banner) {
      const age = Math.min(1, frame.bannerAge);
      const scale = reducedMotion() ? 1 : 1.25 - 0.25 * Math.min(1, age * 3);
      ctx.save();
      ctx.translate(w / 2, hitY * 0.5);
      ctx.scale(scale, scale);
      ctx.font = `700 ${Math.round(Math.min(72, hitY * 0.3))}px ${p.mono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = Math.max(0, 1 - age * 0.85);
      ctx.fillStyle = p.lanes[0] as string;
      ctx.fillText(frame.banner, 0, 0);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  private drawBeats(ctx: CanvasRenderingContext2D, song: Song, t: number, p: Palette) {
    const beat = song.stepSec * 4;
    const first = Math.max(0, Math.floor((t - 0.4) / beat));
    const last = Math.min(song.steps / 4, Math.ceil((t + song.approach) / beat));
    for (let b = first; b <= last; b++) {
      const y = this.yAt(b * beat, t, song);
      if (y < -2 || y > this.hitY) continue;
      const bar = b % (STEPS_PER_BAR / 4) === 0;
      ctx.globalAlpha = bar ? 1 : 0.45;
      ctx.strokeStyle = p.grid;
      ctx.lineWidth = bar ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(this.width, Math.round(y) + 0.5);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private drawNotes(ctx: CanvasRenderingContext2D, song: Song, frame: Frame, p: Palette) {
    const { t, grades } = frame;
    const notes = song.notes;
    const r = this.radius;
    const from = t - 0.6;
    const to = t + song.approach + 0.1;
    let lo = 0;
    let hi = notes.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((notes[mid] as Note).end + 0.2 < from) lo = mid + 1;
      else hi = mid;
    }
    const start = Math.max(0, lo - 6);
    const visible: Note[] = [];
    for (let i = start; i < notes.length; i++) {
      const n = notes[i] as Note;
      if (n.time > to) break;
      if (n.end + 0.6 < t) continue;
      visible.push(n);
    }
    const pos = (n: Note) => ({ x: this.lanesX[n.lane] ?? 0, y: this.yAt(n.time, t, song) });

    for (const n of visible) {
      if (n.hold <= 0) continue;
      const g = grades[n.i];
      const held = frame.holding(n);
      if (g && g !== 'miss' && !held) continue;
      const x = this.lanesX[n.lane] ?? 0;
      const head = held ? this.hitY : this.yAt(n.time, t, song);
      const tail = Math.max(-r, this.yAt(n.end, t, song));
      const bottom = g === 'miss' ? Math.min(head, this.hitY + r) : head;
      if (bottom <= tail) continue;
      ctx.globalAlpha = g === 'miss' ? 0.22 : held ? 1 : 0.85;
      ctx.fillStyle = g === 'miss' ? p.miss : this.laneColor(n.lane);
      if (held && !reducedMotion()) {
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 14;
      }
      ctx.fillRect(x - 3, tail, 6, bottom - tail);
      ctx.shadowBlur = 0;
      if (held) {
        ctx.beginPath();
        ctx.arc(x, this.hitY, r * 0.42, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    ctx.strokeStyle = p.text;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.24;
    ctx.beginPath();
    for (let k = 0; k + 1 < visible.length; k++) {
      const a = visible[k] as Note;
      const b = visible[k + 1] as Note;
      if (a.word !== b.word || grades[a.i] != null || grades[b.i] != null) continue;
      const pa = pos(a);
      const pb = pos(b);
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const len = Math.hypot(dx, dy);
      if (len <= r * 2) continue;
      const ux = dx / len;
      const uy = dy / len;
      ctx.moveTo(pa.x + ux * r, pa.y + uy * r);
      ctx.lineTo(pb.x - ux * r, pb.y - uy * r);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 ${Math.round(r * 0.95)}px ${p.mono}`;
    for (let k = visible.length - 1; k >= 0; k--) {
      const n = visible[k] as Note;
      const g = grades[n.i];
      if (g && g !== 'miss') continue;
      const { x, y } = pos(n);
      if (y < -r * 2 || y > this.height + r) continue;
      let alpha = 1;
      let color = this.laneColor(n.lane);
      if (g === 'miss') {
        const below = y - this.hitY;
        alpha = Math.max(0, 0.5 - (t - n.time) * 1.2) * (below > 0 ? Math.max(0, 1 - below / (r * 1.6)) : 1);
        color = p.miss;
        if (alpha <= 0.02) continue;
      } else if (y < r * 3) {
        alpha = Math.max(0.15, Math.min(1, (y + r * 2) / (r * 5)));
      }
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = p.bg;
      ctx.fill();
      ctx.globalAlpha = alpha * 0.2;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.fillText(n.char.toUpperCase(), x, y + 1);
    }
    ctx.globalAlpha = 1;
  }

  private drawSnaps(ctx: CanvasRenderingContext2D, now: number) {
    this.snaps = this.snaps.filter((s) => now - s.born < SNAP_MS);
    for (const s of this.snaps) {
      const k = (now - s.born) / SNAP_MS;
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      const amp = 7 * (1 - k);
      for (let y = s.top; y <= s.bottom; y += 6) {
        const x = s.x + Math.sin(y / 14 + k * 18) * amp;
        if (y === s.top) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private drawSparks(ctx: CanvasRenderingContext2D, dt: number) {
    const f = dt / 16.67;
    this.sparks = this.sparks.filter((s) => (s.life += dt) < s.max);
    for (const s of this.sparks) {
      s.vy += 0.05 * f;
      s.vx *= 0.97;
      s.x += s.vx * f;
      s.y += s.vy * f;
      ctx.globalAlpha = Math.max(0, 1 - (s.life / s.max) ** 2);
      ctx.fillStyle = s.color;
      ctx.fillRect(Math.round(s.x), Math.round(s.y), s.size, s.size);
    }
    ctx.globalAlpha = 1;
  }

  private drawPops(ctx: CanvasRenderingContext2D, now: number, p: Palette) {
    this.pops = this.pops.filter((s) => now - s.born < POP_MS);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `600 ${Math.max(11, Math.round(this.radius * 0.62))}px ${p.mono}`;
    for (const s of this.pops) {
      const k = (now - s.born) / POP_MS;
      const rise = reducedMotion() ? 0 : k * 14;
      ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      ctx.fillStyle = s.color;
      ctx.fillText(s.text, this.lanesX[s.lane] ?? 0, this.hitY - this.radius - 14 - rise);
    }
    ctx.globalAlpha = 1;
  }
}
