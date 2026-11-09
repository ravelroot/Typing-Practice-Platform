import { STEPS_PER_BAR, stepTime, type Chord, type LeadId, type Note, type Song } from './chart.ts';
import { GROOVES, hitAt, hitIndex, type Groove, type Pattern } from './grooves.ts';

const LOOKAHEAD = 0.14;
const INTERVAL = 25;

const midiHz = (m: number) => 440 * 2 ** ((m - 69) / 12);

function pulseWave(ctx: AudioContext, duty: number): PeriodicWave {
  const n = 48;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  for (let k = 1; k < n; k++) real[k] = (2 * Math.sin(k * Math.PI * duty)) / (k * Math.PI);
  return ctx.createPeriodicWave(real, imag);
}

type Wave = PeriodicWave | OscillatorType;

const LEAD_PEAK: Record<LeadId, number> = { pulse12: 0.13, pulse25: 0.13, square: 0.09, triangle: 0.2, saw: 0.075 };

export class Music {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bus: GainNode | null = null;
  private lead: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private waves: Record<'p12' | 'p25', PeriodicWave> | null = null;
  private timer = 0;
  private song: Song | null = null;
  private groove: Groove | null = null;
  private byStep = new Map<number, Note>();
  private base = 0;
  private step = 0;
  private level = 0.7;

  get context(): AudioContext | null {
    return this.ctx;
  }

  get volume(): number {
    return this.level;
  }

  set volume(v: number) {
    this.level = Math.max(0, Math.min(1, v));
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.level * 0.9, this.ctx.currentTime, 0.05);
  }

  ensure(): AudioContext | null {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      const ctx = new Ctor({ latencyHint: 'interactive' });
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      comp.attack.value = 0.004;
      comp.release.value = 0.2;
      const master = ctx.createGain();
      master.gain.value = this.level * 0.9;
      master.connect(comp).connect(ctx.destination);
      const len = Math.floor(ctx.sampleRate * 1.2);
      const noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.ctx = ctx;
      this.master = master;
      this.noise = noise;
      this.waves = { p12: pulseWave(ctx, 0.125), p25: pulseWave(ctx, 0.25) };
      if (ctx.state === 'suspended') void ctx.resume();
      return ctx;
    } catch {
      return null;
    }
  }

  start(song: Song, from: number, at: number) {
    this.stop();
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    this.song = song;
    this.groove = GROOVES[song.track.groove];
    this.byStep = new Map(song.notes.map((n) => [n.step, n]));
    this.base = at - from;
    let step = 0;
    while (step < song.steps && stepTime(song, step) < from - 1e-6) step++;
    this.step = step;
    this.bus = ctx.createGain();
    this.bus.connect(this.master);
    this.lead = ctx.createGain();
    this.lead.connect(this.bus);
    this.pump();
    this.timer = window.setInterval(() => this.pump(), INTERVAL);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = 0;
    const ctx = this.ctx;
    const bus = this.bus;
    this.bus = null;
    this.lead = null;
    if (ctx && bus) {
      bus.gain.setTargetAtTime(0, ctx.currentTime, 0.015);
      setTimeout(() => bus.disconnect(), 200);
    }
  }

  duck(on: boolean) {
    if (!this.ctx || !this.lead) return;
    this.lead.gain.setTargetAtTime(on ? 0.18 : 1, this.ctx.currentTime, on ? 0.02 : 0.05);
  }

  close() {
    this.stop();
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
  }

  private pump() {
    const ctx = this.ctx;
    const song = this.song;
    if (!ctx || !song || !this.bus) return;
    const horizon = ctx.currentTime + LOOKAHEAD;
    while (this.step < song.steps) {
      const at = this.base + stepTime(song, this.step);
      if (at > horizon) break;
      if (at >= ctx.currentTime - 0.01) this.play(song, this.step, at);
      this.step++;
    }
    if (this.step >= song.steps) {
      clearInterval(this.timer);
      this.timer = 0;
    }
  }

  private wave(id: LeadId): Wave {
    const w = this.waves;
    if (id === 'pulse12') return w ? w.p12 : 'square';
    if (id === 'pulse25') return w ? w.p25 : 'square';
    return id === 'saw' ? 'sawtooth' : id;
  }

  private play(song: Song, i: number, at: number) {
    const groove = this.groove;
    const bar = Math.floor(i / STEPS_PER_BAR);
    const s = i % STEPS_PER_BAR;
    const section = song.sections[bar] ?? 'verse';
    const chord = song.chords[bar] ?? song.chords[0];
    const next = song.chords[bar + 1] ?? chord;
    const len = song.stepSec;
    if (!chord || !next || !groove) return;
    if (section === 'count') {
      if (s % 4 === 0) this.stick(at, s === 0);
      return;
    }
    if (section === 'outro') {
      if (s === 0) {
        this.kick(at, 1);
        this.crash(at);
        this.bass(at, chord.bass, len * 12, 1);
        this.chord(at, chord, len * 12, 0.05);
        this.tone(at, 72 + (chord.tones[0] as number), len * 12, this.wave(song.track.lead), LEAD_PEAK[song.track.lead], this.lead);
      }
      return;
    }
    const chorus = section === 'chorus';
    const p: Pattern = chorus ? groove.chorus : groove.verse;
    const fill = song.fills[bar] && s >= 12;
    if (s === 0 && (section === 'intro' || (song.fills[bar - 1] && chorus !== (song.sections[bar - 1] === 'chorus')))) this.crash(at);
    this.kick(at, hitAt(p.kick, s));
    if (fill) this.fill(at, s, groove.fill);
    else {
      this.snare(at, hitAt(p.snare, s));
      this.clap(at, hitAt(p.clap, s));
    }
    this.hat(at, hitAt(p.hat, s), false);
    this.hat(at, hitAt(p.open, s), true);
    this.rim(at, hitAt(p.rim, s));
    this.shaker(at, hitAt(p.shaker, s));
    this.bell(at, hitAt(p.bell, s), s);
    const b = hitAt(p.bass, s);
    if (b) {
      const n = hitIndex(p.bass, s);
      let gap = 1;
      while (s + gap < STEPS_PER_BAR && !hitAt(p.bass, s + gap)) gap++;
      this.bass(at, this.bassNote(groove, chord, next, n, s), len * Math.min(4, gap) * (groove.move === 'pulse' ? 0.7 : 0.92), b);
    }
    const stab = hitAt(p.stab, s);
    if (stab) this.chord(at, chord, len * 1.2, 0.035 * stab);
    if (section === 'intro' && s % 8 === 0 && !p.stab) this.chord(at, chord, len * 6, 0.03);
    if (chorus && song.track.arp !== 'none' && s % (song.stepSec < 0.105 ? 2 : 1) === 0) {
      const tones = [...chord.tones, (chord.tones[0] as number) + 12];
      const k = song.track.arp === 'down' ? tones.length - 1 - (s % tones.length) : song.track.arp === 'updown' ? [0, 1, 2, 3, 2, 1][s % 6] ?? 0 : s % tones.length;
      this.tone(at, 84 + (tones[k] as number) - 12, len * 0.8, this.wave('pulse12'), 0.028, this.bus);
    }
    const note = this.byStep.get(i);
    if (note) {
      const following = this.byStep.get(i + 1) ? 1 : this.byStep.get(i + 2) ? 2 : 4;
      const dur = note.holdSteps ? note.hold : len * following * 0.92;
      this.tone(at, note.pitch, dur, this.wave(song.track.lead), LEAD_PEAK[song.track.lead], this.lead, note.holdSteps > 0);
    }
  }

  private bassNote(groove: Groove, chord: Chord, next: Chord, n: number, s: number): number {
    const root = chord.bass;
    const rel = (pc: number | undefined) => root + ((((pc ?? 0) - root) % 12) + 12) % 12;
    switch (groove.move) {
      case 'octave':
        return root + (n % 2 ? 12 : 0);
      case 'fifth':
        return n % 2 ? rel(chord.tones[2]) : root;
      case 'walk': {
        const beat = Math.floor(s / 4);
        if (beat === 0) return root;
        if (beat === 1) return rel(chord.tones[1]);
        if (beat === 2) return rel(chord.tones[2]);
        return next.bass - 1 > root ? next.bass - 1 : next.bass + 1;
      }
      case 'boogie':
        return root + ([0, 4, 7, 9, 10, 9, 7, 4][n % 8] as number);
      default:
        return root;
    }
  }

  private env(at: number, peak: number, dur: number, attack = 0.004): GainNode {
    const ctx = this.ctx as AudioContext;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
    g.gain.setValueAtTime(Math.max(0.0002, peak), at + Math.max(attack, dur * 0.6));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur + 0.04);
    return g;
  }

  private tone(at: number, midi: number, dur: number, wave: Wave, peak: number, out: GainNode | null, vibrato = false) {
    const ctx = this.ctx as AudioContext;
    if (!out) return;
    const o = ctx.createOscillator();
    if (typeof wave === 'string') o.type = wave as OscillatorType;
    else o.setPeriodicWave(wave);
    o.frequency.setValueAtTime(midiHz(midi), at);
    if (vibrato && dur > 0.2) {
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = 5.5;
      depth.gain.setValueAtTime(0, at);
      depth.gain.linearRampToValueAtTime(midiHz(midi) * 0.012, at + 0.18);
      lfo.connect(depth).connect(o.frequency);
      lfo.start(at);
      lfo.stop(at + dur + 0.06);
    }
    const g = this.env(at, peak, dur);
    o.connect(g).connect(out);
    o.start(at);
    o.stop(at + dur + 0.06);
  }

  private chord(at: number, chord: Chord, dur: number, peak: number) {
    for (const pc of chord.tones) this.tone(at, 60 + pc, dur, 'triangle', peak, this.bus);
  }

  private bass(at: number, midi: number, dur: number, vel: number) {
    const ctx = this.ctx as AudioContext;
    if (!this.bus) return;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(midiHz(midi), at);
    const g = this.env(at, 0.32 * vel, dur, 0.003);
    o.connect(g).connect(this.bus);
    o.start(at);
    o.stop(at + dur + 0.06);
  }

  private burst(at: number, dur: number, peak: number, type: BiquadFilterType, freq: number, q = 0.7) {
    const ctx = this.ctx as AudioContext;
    if (!this.bus || !this.noise || peak <= 0) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(this.bus);
    src.start(at, Math.random() * 0.8);
    src.stop(at + dur + 0.02);
  }

  private drum(at: number, vel: number, from: number, to: number, decay: number, peak: number, type: OscillatorType = 'sine') {
    const ctx = this.ctx as AudioContext;
    if (!this.bus || vel <= 0) return;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(from, at);
    o.frequency.exponentialRampToValueAtTime(to, at + decay * 0.55);
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak * vel, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    o.connect(g).connect(this.bus);
    o.start(at);
    o.stop(at + decay + 0.02);
  }

  private kick(at: number, vel: number) {
    this.drum(at, vel, 150, 42, 0.2, 0.85);
  }

  private snare(at: number, vel: number) {
    if (!vel) return;
    this.burst(at, 0.14, 0.34 * vel, 'highpass', 1400);
    this.drum(at, vel, 210, 150, 0.07, 0.2, 'triangle');
  }

  private clap(at: number, vel: number) {
    if (!vel) return;
    for (let k = 0; k < 3; k++) this.burst(at + k * 0.011, 0.05 + k * 0.03, 0.2 * vel, 'bandpass', 1500, 1.2);
  }

  private hat(at: number, vel: number, open: boolean) {
    this.burst(at, open ? 0.14 : 0.035, (open ? 0.06 : 0.065) * vel, 'highpass', 7200);
  }

  private rim(at: number, vel: number) {
    this.burst(at, 0.035, 0.22 * vel, 'bandpass', 2400, 4);
  }

  private shaker(at: number, vel: number) {
    this.burst(at, 0.05, 0.05 * vel, 'bandpass', 5200, 1.5);
  }

  private bell(at: number, vel: number, s: number) {
    if (!vel) return;
    this.tone(at, s % 8 < 4 ? 88 : 83, 0.07, 'square', 0.03 * vel, this.bus);
  }

  private fill(at: number, s: number, kind: Groove['fill']) {
    if (kind === 'tom') this.drum(at, 0.9, [220, 180, 150, 120][s - 12] ?? 140, 70, 0.16, 0.5);
    else if (kind === 'soft') this.rim(at, s % 2 === 0 ? 0.8 : 0.5);
    else this.snare(at, s % 2 === 0 ? 0.95 : 0.6);
  }

  private crash(at: number) {
    this.burst(at, 1.1, 0.12, 'highpass', 5200);
  }

  private stick(at: number, accent: boolean) {
    this.burst(at, 0.04, accent ? 0.3 : 0.2, 'bandpass', accent ? 2600 : 2000, 3);
  }
}
