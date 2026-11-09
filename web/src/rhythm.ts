import { laneOf, type Note, type Song } from './chart.ts';
import { COMPLEXITY_LABELS } from './content.ts';
import { Judge, type JudgeEvent, type Letter } from './judge.ts';
import { formatDuration } from './metrics.ts';
import { Music } from './music.ts';
import { Stage } from './stage.ts';
import { el, icon } from './ui.ts';

export type Phase = 'empty' | 'ready' | 'count' | 'playing' | 'paused' | 'done';

export interface RhythmResult {
  song: Song;
  score: number;
  letter: Letter;
  accuracyBp: number;
  perfect: number;
  great: number;
  good: number;
  miss: number;
  wrong: number;
  notes: number;
  hits: number;
  presses: number;
  maxCombo: number;
  fullCombo: boolean;
  holdsFull: number;
  holdsBroken: number;
  holds: number;
  offsetMs: number | null;
  missed: Record<string, number>;
  durationMs: number;
}

export interface TrackMeta {
  index: number;
  total: number;
  style: string;
  best: string | null;
}

export interface RhythmHooks {
  browse: (delta: number) => void;
  list: () => void;
  next: (ch: string | null) => void;
  key: (code: string, ok: boolean) => void;
  wrong: () => void;
  finished: (result: RhythmResult) => void;
  phase: (phase: Phase) => void;
}

const LEAD = 0.12;
const RESUME_BEATS = 3;

const nf = new Intl.NumberFormat('pt-BR');
const pct = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

class Clock {
  private ctx: AudioContext | null = null;
  private map: number | null = null;
  base = 0;

  use(ctx: AudioContext | null) {
    this.ctx = ctx;
    this.map = null;
  }

  get audio(): boolean {
    return this.ctx != null;
  }

  now(perf: number): number {
    const ctx = this.ctx;
    if (!ctx) return perf / 1000;
    const ts = typeof ctx.getOutputTimestamp === 'function' ? ctx.getOutputTimestamp() : null;
    const sample =
      ts && ts.contextTime && ts.performanceTime
        ? ts.contextTime - ts.performanceTime / 1000
        : ctx.currentTime - performance.now() / 1000 - (ctx.outputLatency || ctx.baseLatency || 0);
    if (this.map == null || Math.abs(sample - this.map) > 0.03) this.map = sample;
    else this.map += (sample - this.map) * 0.05;
    return perf / 1000 + this.map;
  }

  anchor(): number {
    return this.ctx ? this.ctx.currentTime : performance.now() / 1000;
  }

  song(perf: number): number {
    return this.now(perf) - this.base;
  }
}

const running = (ctx: AudioContext | null): boolean => ctx != null && ctx.state === 'running';

const normalizeKey = (key: string): string | null => {
  if (key.length !== 1) return null;
  const ch = key.toLowerCase();
  return laneOf(ch) >= 0 ? ch : null;
};

export class RhythmGame {
  readonly music = new Music();
  readonly stage: Stage;
  phase: Phase = 'empty';
  song: Song | null = null;
  meta: TrackMeta | null = null;
  judge: Judge | null = null;
  latencyMs = 0;
  musicOn = true;

  private clock = new Clock();
  private hooks: RhythmHooks;
  private raf = 0;
  private frozen = 0;
  private countFrom = 0;
  private countLen = 0;
  private codes = new Map<string, string>();
  private hud: { score: HTMLElement; mult: HTMLElement; acc: HTMLElement; bar: HTMLElement; pct: HTMLElement; title: HTMLElement; artist: HTMLElement; level: HTMLElement };
  private words: HTMLElement;
  private veil: HTMLElement;
  private live: HTMLElement;
  private shown = { word: -2, mask: '', score: -1, mult: -1, acc: -1, pct: -1, next: '' };
  private finishTimer = 0;
  private spans: [number, number][] = [];

  constructor(hooks: RhythmHooks) {
    this.hooks = hooks;
    const q = (id: string) => document.getElementById(id) as HTMLElement;
    this.stage = new Stage(q('rhCanvas') as HTMLCanvasElement, q('rhScreen'));
    this.stage.onLayout = () => this.paint();
    this.hud = {
      score: q('rhScore'),
      mult: q('rhMult'),
      acc: q('rhAcc'),
      bar: q('rhBar'),
      pct: q('rhPct'),
      title: q('rhTitle'),
      artist: q('rhArtist'),
      level: q('rhLevel'),
    };
    this.words = q('rhWords');
    this.veil = q('rhVeil');
    this.live = q('rhLive');
  }

  get active(): boolean {
    return this.phase === 'playing' || this.phase === 'count';
  }

  private is(p: Phase): boolean {
    return this.phase === p;
  }

  private setPhase(p: Phase) {
    this.phase = p;
    this.veil.closest('.rhythm')?.setAttribute('data-phase', p);
    this.hooks.phase(p);
  }

  load(song: Song, meta: TrackMeta | null = this.meta) {
    this.halt();
    this.song = song;
    this.meta = meta;
    this.judge = new Judge(song.notes, song.stepSec);
    this.frozen = 0;
    this.codes.clear();
    this.spans = song.words.map(() => [0, 0]);
    song.notes.forEach((n) => {
      const span = this.spans[n.word];
      if (!span) return;
      if (n.index === 0) span[0] = n.i;
      span[1] = n.i + 1;
    });
    this.stage.setSong(song);
    this.shown = { word: -2, mask: '', score: -1, mult: -1, acc: -1, pct: -1, next: '' };
    this.hud.title.textContent = song.title;
    this.hud.artist.textContent = song.artist;
    this.hud.level.textContent = `${COMPLEXITY_LABELS[song.complexity]} · ${song.bpm} BPM`;
    this.setPhase('ready');
    this.renderVeil();
    this.paint();
  }

  unload() {
    this.halt();
    this.music.stop();
    this.song = null;
    this.judge = null;
    this.stage.setSong(null);
    this.setPhase('empty');
  }

  private halt() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    clearTimeout(this.finishTimer);
    this.music.stop();
  }

  setVolume(v: number) {
    this.music.volume = v;
    this.musicOn = v > 0;
  }

  toggle() {
    if (this.phase === 'ready') void this.start();
    else if (this.phase === 'playing') this.pause();
    else if (this.phase === 'paused') this.resume();
  }

  async start() {
    const song = this.song;
    if (!song || this.phase !== 'ready') return;
    this.setPhase('count');
    let ctx: AudioContext | null = null;
    if (this.musicOn) {
      ctx = this.music.ensure();
      if (ctx && !running(ctx)) {
        await Promise.race([ctx.resume().catch(() => undefined), new Promise((r) => setTimeout(r, 400))]);
        if (!running(ctx)) ctx = null;
      }
    }
    if (this.song !== song || !this.is('count')) return;
    this.clock.use(ctx);
    this.clock.base = this.clock.anchor() + LEAD;
    if (ctx) this.music.start(song, 0, this.clock.base);
    this.countLen = 0;
    this.setPhase('playing');
    this.renderVeil();
    this.announce(`Começou: ${song.title}.`);
    this.loop();
  }

  restart() {
    const song = this.song;
    if (!song) return;
    this.load(song);
    void this.start();
  }

  pause() {
    if (!this.song || !this.judge || (this.phase !== 'playing' && this.phase !== 'count')) return;
    const t = this.phase === 'count' ? this.frozen : this.time(performance.now());
    if (this.phase === 'playing') this.process(this.judge.releaseAll(t), t);
    this.frozen = Math.max(0, t);
    this.halt();
    this.codes.clear();
    this.setPhase('paused');
    this.renderVeil();
    this.paint();
  }

  resume() {
    const song = this.song;
    if (!song || this.phase !== 'paused') return;
    this.setPhase('count');
    const beat = song.stepSec * 4;
    this.countLen = Math.max(0.36, Math.min(0.6, beat)) * RESUME_BEATS;
    this.countFrom = performance.now();
    this.renderVeil();
    if (this.musicOn) this.music.ensure();
    this.loop();
  }

  private go() {
    const song = this.song;
    if (!song) return;
    const ctx = this.musicOn ? this.music.context : null;
    this.clock.use(running(ctx) ? ctx : null);
    this.clock.base = this.clock.anchor() + LEAD - this.frozen;
    if (this.clock.audio) this.music.start(song, this.frozen, this.clock.base + this.frozen);
    this.countLen = 0;
    this.setPhase('playing');
  }

  private time(perf: number): number {
    return this.clock.song(perf);
  }

  private stamp(e: Event): number {
    const now = performance.now();
    return e.timeStamp > 0 && e.timeStamp <= now && now - e.timeStamp < 250 ? e.timeStamp : now;
  }

  keydown(e: KeyboardEvent): boolean {
    const ch = normalizeKey(e.key);
    if (!ch) return false;
    if (e.repeat || this.phase !== 'playing' || !this.judge) return true;
    if (e.code) this.codes.set(e.code, ch);
    this.press(ch, this.stamp(e), e.code);
    return true;
  }

  keyup(e: KeyboardEvent) {
    const ch = this.codes.get(e.code);
    if (!ch) return;
    this.codes.delete(e.code);
    if (this.phase !== 'playing' || !this.judge) return;
    const t = this.time(this.stamp(e)) - this.latencyMs / 1000;
    this.process(this.judge.release(ch, t), t);
  }

  typed(text: string) {
    if (this.phase !== 'playing') return;
    for (const raw of Array.from(text)) {
      const ch = normalizeKey(raw);
      if (ch) this.press(ch, performance.now(), '');
    }
  }

  private press(ch: string, perf: number, code: string) {
    const judge = this.judge;
    if (!judge) return;
    const t = this.time(perf) - this.latencyMs / 1000;
    const events = judge.press(ch, t);
    const ok = events.some((ev) => ev.type === 'hit');
    if (code) this.hooks.key(code, ok);
    if (!ok && !events.some((ev) => ev.type === 'wrong')) this.stage.flash(laneOf(ch));
    this.process(events, t);
  }

  private process(events: JudgeEvent[], t: number) {
    for (const ev of events) {
      if (ev.type === 'hit') {
        this.stage.flash(ev.note.lane);
        this.stage.pop(ev.note.lane, ev.grade);
        this.stage.burst(ev.note.lane, ev.grade === 'perfect' ? 14 : ev.grade === 'great' ? 10 : 6);
        this.music.duck(false);
      } else if (ev.type === 'miss') {
        this.stage.pop(ev.note.lane, 'miss');
        this.music.duck(true);
      } else if (ev.type === 'wrong') {
        this.stage.flash(laneOf(ev.char), true);
        this.hooks.wrong();
      } else if (ev.type === 'tick') {
        this.stage.burst(ev.note.lane, 2);
      } else if (ev.type === 'release') {
        this.stage.snap(ev.note, t, !ev.full);
        if (ev.full) this.stage.burst(ev.note.lane, 12);
      }
    }
  }

  private loop() {
    cancelAnimationFrame(this.raf);
    const frame = () => {
      this.raf = 0;
      if (!this.active) return;
      this.tick();
      if (this.active) this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  private tick() {
    const song = this.song;
    const judge = this.judge;
    if (!song || !judge) return;
    if (this.phase === 'count') {
      const age = (performance.now() - this.countFrom) / 1000;
      if (age >= this.countLen) this.go();
      else {
        this.paint();
        return;
      }
    }
    const t = this.time(performance.now());
    this.frozen = Math.max(0, t);
    this.process(judge.update(t - this.latencyMs / 1000), t);
    this.paint();
    if (t >= song.duration && judge.done) this.finish();
  }

  private finish() {
    const song = this.song;
    const judge = this.judge;
    if (!song || !judge || this.phase === 'done') return;
    this.process(judge.update(song.duration + 1), song.duration);
    this.setPhase('done');
    this.halt();
    this.paint();
    const result: RhythmResult = {
      song,
      score: judge.score,
      letter: judge.letter,
      accuracyBp: judge.accuracyBp,
      perfect: judge.counts.perfect,
      great: judge.counts.great,
      good: judge.counts.good,
      miss: judge.counts.miss,
      wrong: judge.wrong,
      notes: song.notes.length,
      hits: judge.hits,
      presses: judge.presses,
      maxCombo: judge.maxCombo,
      fullCombo: judge.fullCombo,
      holdsFull: judge.holdsFull,
      holdsBroken: judge.holdsBroken,
      holds: song.notes.filter((n) => n.hold > 0).length,
      offsetMs: judge.meanOffsetMs,
      missed: { ...judge.missed },
      durationMs: Math.round(song.duration * 1000),
    };
    this.announce(`Fim da música. ${nf.format(result.score)} pontos, nota ${result.letter}.`);
    this.finishTimer = window.setTimeout(() => this.hooks.finished(result), 450);
  }

  private announce(text: string) {
    this.live.textContent = text;
  }

  private banner(t: number): { text: string | null; age: number } {
    const song = this.song;
    if (!song) return { text: null, age: 0 };
    if (this.phase === 'count' && this.countLen) {
      const age = (performance.now() - this.countFrom) / 1000;
      const each = this.countLen / RESUME_BEATS;
      const k = Math.min(RESUME_BEATS - 1, Math.floor(age / each));
      return { text: String(RESUME_BEATS - k), age: (age - k * each) / each };
    }
    if (this.phase !== 'playing') return { text: null, age: 0 };
    const beat = song.stepSec * 4;
    const b = Math.floor(t / beat);
    if (t >= 0 && b < 4) return { text: b === 3 ? 'Já!' : String(3 - b), age: (t - b * beat) / beat };
    return { text: null, age: 0 };
  }

  paint() {
    const song = this.song;
    const judge = this.judge;
    if (!song || !judge) {
      this.stage.draw({ t: 0, grades: [], holding: () => false, combo: 0, banner: null, bannerAge: 0 });
      return;
    }
    const t = this.phase === 'playing' ? this.time(performance.now()) : this.phase === 'ready' ? 0 : this.frozen;
    const b = this.banner(t);
    this.stage.draw({ t, grades: judge.grades, holding: (n) => judge.holding(n), combo: judge.combo, banner: b.text, bannerAge: b.age });
    this.renderHud(t);
    this.renderWords();
  }

  private renderHud(t: number) {
    const song = this.song;
    const judge = this.judge;
    if (!song || !judge) return;
    const s = this.shown;
    if (s.score !== judge.score) {
      s.score = judge.score;
      this.hud.score.textContent = nf.format(judge.score);
    }
    if (s.mult !== judge.multiplier) {
      s.mult = judge.multiplier;
      this.hud.mult.textContent = `×${judge.multiplier}`;
      this.hud.mult.dataset.level = String(judge.multiplier);
    }
    if (s.acc !== judge.accuracyBp) {
      s.acc = judge.accuracyBp;
      this.hud.acc.textContent = `${pct.format(judge.accuracyBp / 100)}%`;
    }
    const p = Math.max(0, Math.min(100, Math.floor((t / song.duration) * 100)));
    if (s.pct !== p) {
      s.pct = p;
      this.hud.pct.textContent = `${p}%`;
      this.hud.bar.style.transform = `scaleX(${p / 100})`;
    }
    const next = judge.next();
    const key = next ? next.char : '';
    if (s.next !== key) {
      s.next = key;
      this.hooks.next(next ? next.char : null);
    }
  }

  private renderWords() {
    const song = this.song;
    const judge = this.judge;
    if (!song || !judge) return;
    const next = judge.next();
    const current = next ? next.word : song.words.length;
    const span = this.spans[current];
    const cur: Note[] = span ? song.notes.slice(span[0], span[1]) : [];
    const mask = cur.map((n) => judge.grades[n.i] ?? '-').join(',') + (next ? `@${next.i}` : '');
    if (this.shown.word === current && this.shown.mask === mask) return;
    const moved = this.shown.word !== current;
    this.shown.word = current;
    this.shown.mask = mask;
    const rows: HTMLElement[] = [];
    if (current > 0 && current - 1 < song.words.length) rows.push(el('div', { class: 'rh-row prev', text: song.words[current - 1] }));
    if (cur.length) {
      const row = el('div', { class: 'rh-row cur' });
      for (const n of cur) {
        const g = judge.grades[n.i];
        const cls = g === 'miss' ? 'x' : g ? 'd' : next && n.i === next.i ? 'n' : '';
        row.append(el('span', { class: cls, text: n.char }));
      }
      rows.push(row);
    }
    for (let k = 1; k <= 3; k++) {
      const w = song.words[current + k];
      if (w) rows.push(el('div', { class: `rh-row up${k}`, text: w }));
    }
    this.words.replaceChildren(...rows);
    if (moved) {
      this.words.classList.remove('shift');
      void this.words.offsetWidth;
      this.words.classList.add('shift');
    }
  }

  private renderVeil() {
    const song = this.song;
    const v = this.veil;
    v.replaceChildren();
    if (!song || this.phase === 'playing' || this.phase === 'done' || (this.phase === 'count' && !this.countLen)) {
      v.hidden = true;
      return;
    }
    v.hidden = false;
    if (this.phase === 'count') {
      v.hidden = true;
      return;
    }
    const paused = this.phase === 'paused';
    const holds = song.notes.filter((n) => n.hold > 0).length;
    const button = (cls: string, label: string, run: () => void, ...children: (Node | string)[]) => {
      const b = el('button', { class: cls, type: 'button', 'aria-label': label, title: label }, ...children);
      b.addEventListener('pointerdown', (e) => e.preventDefault());
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        run();
      });
      return b;
    };
    const btn = button('btn primary rh-go', paused ? 'Continuar' : 'Começar', () => this.toggle(), icon(paused ? 'play' : 'music', 16), paused ? 'Continuar' : 'Começar', el('kbd', { text: 'Espaço' }));
    const meta = this.meta;
    const kicker = paused ? 'Pausado' : meta ? `Faixa ${meta.index + 1} de ${meta.total} · ${meta.style}` : 'Modo Ritmo';
    const row = paused
      ? btn
      : el(
          'div',
          { class: 'rh-nav' },
          button('btn icon rh-step', 'Música anterior (←)', () => this.hooks.browse(-1), icon('prev', 16)),
          btn,
          button('btn icon rh-step', 'Próxima música (→)', () => this.hooks.browse(1), icon('next', 16)),
        );
    const card = el(
      'div',
      { class: 'rh-card' },
      el('span', { class: 'rh-kicker', text: kicker }),
      el('h3', { text: song.title }),
      el('p', { class: 'rh-meta', text: `${song.artist} · ${COMPLEXITY_LABELS[song.complexity]} · ${song.bpm} BPM · ${formatDuration(song.duration * 1000).replace(/,\d+$/, '')} · ${nf.format(song.notes.length)} notas` }),
      paused
        ? el('p', { text: 'A música para enquanto você não volta. Ao continuar, há uma contagem de 3 tempos.' })
        : el('p', { text: `Digite cada letra quando ela encostar no círculo. ${holds ? 'Nas notas com rastro, segure a tecla até o fim do rastro.' : ''}`.trim() }),
      !paused && meta?.best ? el('p', { class: 'rh-best', text: meta.best }) : null,
      row,
      paused ? null : button('rh-link', 'Ver todas as músicas', () => this.hooks.list(), icon('music', 14), meta ? `Ver as ${meta.total} músicas` : 'Ver as músicas'),
      paused ? null : el('small', { text: `← → trocam a música · Tab sorteia outra${this.musicOn ? ' · use fones para sentir melhor o tempo' : ''}` }),
      !this.musicOn ? el('small', { text: 'Música desligada nas preferências: siga as linhas do compasso.' }) : null,
    );
    v.append(card);
  }
}
