import { Rng, type Complexity, type Size } from './content.ts';
import { GROOVE_IDS, type GrooveId } from './grooves.ts';
import { fingerOf, strokesFor, type Finger } from './keyboard.ts';

export const LANES = 4;
export const STEPS_PER_BAR = 16;
export const FIRST_NOTE_BAR = 2;
export const MAX_WORD = 10;
export const MIN_BPM = 60;
export const MAX_BPM = 200;

const LANE_OF: Record<Finger, number> = { lp: 0, lr: 0, lm: 1, li: 1, ri: 2, rm: 3, rr: 3, rp: 3, th: -1 };

export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
} as const;
export type ScaleId = keyof typeof SCALES;

export const LEADS = ['pulse12', 'pulse25', 'square', 'triangle', 'saw'] as const;
export type LeadId = (typeof LEADS)[number];
export const ARPS = ['none', 'up', 'down', 'updown'] as const;
export type ArpId = (typeof ARPS)[number];

export const KEY_NAMES: Record<string, number> = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };

export type Section = 'count' | 'intro' | 'verse' | 'chorus' | 'outro';

export interface Track {
  id: string;
  title: string;
  artist: string;
  groove: GrooveId;
  bpm: number;
  key: string;
  scale: ScaleId;
  verse: number[];
  chorus: number[];
  lead: LeadId;
  arp: ArpId;
  swing: number;
}

export interface Level {
  approach: number;
  spacing: [steps: number, weight: number][];
  gap: [min: number, max: number];
  align: number;
  hold: number;
}

export const LEVELS: Record<Complexity, Level> = {
  easy: { approach: 1.75, spacing: [[2, 6], [4, 4]], gap: [4, 6], align: 4, hold: 0.2 },
  medium: { approach: 1.5, spacing: [[2, 17], [1, 2], [4, 1]], gap: [2, 4], align: 2, hold: 0.22 },
  hard: { approach: 1.3, spacing: [[2, 11], [1, 9]], gap: [2, 3], align: 2, hold: 0.2 },
};

export const SONG_SECONDS: Record<Size, number> = { short: 45, medium: 90, long: 150 };

export interface Note {
  i: number;
  step: number;
  time: number;
  char: string;
  lane: number;
  word: number;
  index: number;
  last: boolean;
  holdSteps: number;
  hold: number;
  end: number;
  pitch: number;
}

export interface Chord {
  bass: number;
  tones: number[];
}

export interface Song {
  seed: number;
  track: Track;
  title: string;
  artist: string;
  complexity: Complexity;
  size: Size;
  bpm: number;
  stepSec: number;
  swing: number;
  approach: number;
  bars: number;
  steps: number;
  duration: number;
  root: number;
  chords: Chord[];
  sections: Section[];
  fills: boolean[];
  words: string[];
  notes: Note[];
}

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const oneOf = <T extends string>(v: unknown, list: readonly T[]): v is T => (list as readonly unknown[]).includes(v);
const degrees = (v: unknown): v is number[] => Array.isArray(v) && v.length >= 1 && v.length <= 16 && v.every((d) => isInt(d) && d >= 0 && d <= 6);
const SCALE_IDS = Object.keys(SCALES) as ScaleId[];

export function parseTracks(raw: unknown): Track[] {
  const list = raw && typeof raw === 'object' ? (raw as { tracks?: unknown }).tracks : null;
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: Track[] = [];
  for (const t of list as Record<string, unknown>[]) {
    if (!t || typeof t !== 'object') continue;
    const { id, title, artist, groove, bpm, key, scale, verse, chorus, lead, arp, swing } = t;
    if (typeof id !== 'string' || !/^[a-z0-9-]{2,60}$/.test(id) || seen.has(id)) continue;
    if (typeof title !== 'string' || !title.trim() || typeof artist !== 'string' || !artist.trim()) continue;
    if (!oneOf(groove, GROOVE_IDS) || !oneOf(scale, SCALE_IDS) || !oneOf(lead, LEADS) || !oneOf(arp, ARPS)) continue;
    if (!isInt(bpm) || bpm < MIN_BPM || bpm > MAX_BPM || typeof key !== 'string' || !(key in KEY_NAMES)) continue;
    if (!degrees(verse) || !degrees(chorus) || typeof swing !== 'number' || swing < 0 || swing > 0.4) continue;
    seen.add(id);
    out.push({ id, title: title.slice(0, 80), artist: artist.slice(0, 60), groove, bpm, key, scale, verse, chorus, lead, arp, swing });
  }
  return out;
}

export function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function warp(step: number, swing: number): number {
  const beat = Math.floor(step / 4);
  const p = step - beat * 4;
  const mid = 2 + 2 * swing;
  return beat * 4 + (p <= 2 ? (p / 2) * mid : mid + ((p - 2) / 2) * (4 - mid));
}

export const stepTime = (song: Pick<Song, 'stepSec' | 'swing'>, step: number): number => warp(step, song.swing) * song.stepSec;

export function laneOf(ch: string): number {
  if (!/^[a-z0-9ç]$/.test(ch)) return -1;
  const strokes = strokesFor(ch);
  if (!strokes || strokes.length !== 1) return -1;
  const s = strokes[0];
  if (!s || s.shift) return -1;
  const f = fingerOf(s.code);
  return f ? LANE_OF[f] : -1;
}

export function rhythmWords(text: string, max = MAX_WORD): string[] {
  const clean = String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/ç/g, 'ç')
    .replace(/[̀-ͯ]/g, '');
  const out: string[] = [];
  for (const raw of clean.split(/[^a-z0-9ç]+/)) {
    if (!raw) continue;
    const parts = Math.ceil(raw.length / max);
    const size = Math.ceil(raw.length / parts);
    for (let i = 0; i < raw.length; i += size) out.push(raw.slice(i, i + size));
  }
  return out;
}

const chordOf = (root: number, scale: readonly number[], degree: number): Chord => {
  const tone = (d: number) => root + (scale[d % 7] as number) + 12 * Math.floor(d / 7);
  const base = tone(degree);
  return { bass: 36 + (((base % 12) + 12) % 12), tones: [tone(degree) % 12, tone(degree + 2) % 12, tone(degree + 4) % 12] };
};

function weighted<T>(rng: Rng, items: [T, number][]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = (rng.next() / 4294967296) * total;
  for (const [v, w] of items) {
    r -= w;
    if (r < 0) return v;
  }
  return (items[items.length - 1] as [T, number])[0];
}

function motif(progression: number[], root: number, scale: readonly number[], lo: number, rng: Rng): number[] {
  const hi = lo + 17;
  const pcs = scale.map((s) => (root + s) % 12);
  const out: number[] = [];
  let prev = lo + 8;
  let repeats = 0;
  for (let i = 0; i < progression.length * STEPS_PER_BAR; i++) {
    const chord = chordOf(root, scale, progression[Math.floor(i / STEPS_PER_BAR)] as number);
    const allowed = i % 4 === 0 ? chord.tones : pcs;
    const options: [number, number][] = [];
    for (let m = lo; m <= hi; m++) {
      if (!allowed.includes(((m % 12) + 12) % 12)) continue;
      const dist = Math.abs(m - prev);
      let w = 1 / (1 + dist) ** 1.5;
      if (dist === 0) w *= repeats >= 1 ? 0.1 : 0.7;
      if (dist > 7) w *= 0.2;
      options.push([m, w]);
    }
    const pitch = options.length ? weighted(rng, options) : prev;
    repeats = pitch === prev ? repeats + 1 : 0;
    prev = pitch;
    out.push(pitch);
  }
  return out;
}

export interface ComposeOptions {
  size: Size;
  complexity: Complexity;
  seed: number;
  track: Track;
}

export function compose(source: readonly string[], options: ComposeOptions): Song {
  const { track } = options;
  const rng = new Rng(options.seed);
  const tune = new Rng(hashId(track.id));
  const level = LEVELS[options.complexity];
  const bpm = track.bpm;
  const stepSec = 60 / bpm / 4;
  const unit = stepSec < 0.105 ? 2 : 1;
  const barSec = stepSec * STEPS_PER_BAR;
  const body = Math.max(8, Math.round(SONG_SECONDS[options.size] / barSec / 4) * 4);
  const bars = body + FIRST_NOTE_BAR + 1;
  const steps = bars * STEPS_PER_BAR;
  const root = KEY_NAMES[track.key] ?? 0;
  const scale = SCALES[track.scale];
  const lo = 62 + (root >= 6 ? root - 12 : root);
  const motifs = { verse: motif(track.verse, root, scale, lo, tune), chorus: motif(track.chorus, root, scale, lo + 3, tune) };

  const sections: Section[] = [];
  const fills: boolean[] = [];
  const chords: Chord[] = [];
  for (let b = 0; b < bars; b++) {
    const k = b - FIRST_NOTE_BAR;
    const section: Section = b === 0 ? 'count' : b < FIRST_NOTE_BAR ? 'intro' : b === bars - 1 ? 'outro' : Math.floor(k / 8) % 2 === 0 ? 'verse' : 'chorus';
    sections.push(section);
    fills.push(k >= 0 && b < bars - 1 && k % 4 === 3);
    const prog = section === 'chorus' ? track.chorus : track.verse;
    chords.push(chordOf(root, scale, section === 'verse' || section === 'chorus' ? (prog[k % prog.length] as number) : (track.verse[0] as number)));
  }

  const pool = source.map((w) => Array.from(w).filter((c) => laneOf(c) >= 0).join('')).filter(Boolean);
  const words = pool.length ? pool : ['pluma'];
  const limit = (bars - 1) * STEPS_PER_BAR - 2;
  const notes: Note[] = [];
  const used: string[] = [];
  const at = (s: number) => warp(s, track.swing) * stepSec;
  let step = FIRST_NOTE_BAR * STEPS_PER_BAR;
  for (let w = 0; ; w++) {
    const word = words[w % words.length] as string;
    const chars = Array.from(word);
    const gaps = chars.slice(1).map(() => weighted(rng, level.spacing) * unit);
    const holdSteps = rng.next() / 4294967296 < level.hold ? weighted(rng, [[4, 3], [6, 1], [8, 2]]) * unit : 0;
    const span = gaps.reduce((s, g) => s + g, 0) + holdSteps;
    if (step + span > limit) break;
    const wi = used.length;
    used.push(word);
    let pos = step;
    chars.forEach((char, index) => {
      if (index > 0) pos += gaps[index - 1] as number;
      const last = index === chars.length - 1;
      const hs = last ? holdSteps : 0;
      const bar = Math.floor(pos / STEPS_PER_BAR);
      const chorus = sections[bar] === 'chorus';
      const prog = chorus ? track.chorus : track.verse;
      const line = chorus ? motifs.chorus : motifs.verse;
      const offset = ((bar - FIRST_NOTE_BAR) % prog.length) * STEPS_PER_BAR + (pos % STEPS_PER_BAR);
      notes.push({
        i: notes.length,
        step: pos,
        time: at(pos),
        char,
        lane: laneOf(char),
        word: wi,
        index,
        last,
        holdSteps: hs,
        hold: at(pos + hs) - at(pos),
        end: at(pos + hs),
        pitch: line[offset] ?? lo + 8,
      });
    });
    const after = pos + holdSteps + rng.range(level.gap[0], level.gap[1]) * unit;
    const align = level.align * unit;
    step = Math.ceil(after / align) * align;
  }

  return {
    seed: options.seed,
    track,
    title: track.title,
    artist: track.artist,
    complexity: options.complexity,
    size: options.size,
    bpm,
    stepSec,
    swing: track.swing,
    approach: level.approach,
    bars,
    steps,
    duration: at(steps),
    root,
    chords,
    sections,
    fills,
    words: used,
    notes,
  };
}
