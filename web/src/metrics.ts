export const BACKSPACE = '\b';
export const ERROR_PENALTY = 5;
export const IDLE_CAP_MS = 2000;

export type KeyEvent = [t: number, ch: string];

export interface Replay {
  typed: string[];
  keystrokes: number;
  correct: number;
  errors: number;
  backspaces: number;
  uncorrected: number;
  maxStreak: number;
  missed: Record<string, number>;
  completed: boolean;
}

export interface Summary {
  chars: number;
  durationMs: number;
  keystrokes: number;
  correct: number;
  errors: number;
  corrected: number;
  uncorrected: number;
  backspaces: number;
  accuracyBp: number;
  net: number;
  netPerMinX100: number;
  grossPerMinX100: number;
  wpmX100: number;
  rawWpmX100: number;
  consistencyBp: number | null;
  maxStreak: number;
  missed: Record<string, number>;
  completed: boolean;
}

export interface Combined extends Summary {
  texts: number;
}

export interface TimelinePoint {
  second: number;
  wpm: number;
  errors: number;
}

export function roundDiv(num: number, den: number): number {
  if (den <= 0) return 0;
  const n = 2 * num + den;
  const d = 2 * den;
  let q = Math.floor(n / d);
  while (q * d > n) q--;
  while ((q + 1) * d <= n) q++;
  return q;
}

const chars = (target: string | readonly string[]): readonly string[] => (typeof target === 'string' ? Array.from(target) : target);

export function replay(target: string | readonly string[], events: readonly KeyEvent[]): Replay {
  const goal = chars(target);
  const typed: string[] = [];
  let keystrokes = 0;
  let correct = 0;
  let errors = 0;
  let backspaces = 0;
  let streak = 0;
  let maxStreak = 0;
  const missed: Record<string, number> = {};
  for (const [, s] of events) {
    if (s === BACKSPACE) {
      if (typed.length > 0) {
        typed.pop();
        backspaces++;
      }
      continue;
    }
    if (typed.length >= goal.length) continue;
    const expected = goal[typed.length] as string;
    keystrokes++;
    if (s === expected) {
      correct++;
      streak++;
      if (streak > maxStreak) maxStreak = streak;
    } else {
      errors++;
      streak = 0;
      missed[expected] = (missed[expected] ?? 0) + 1;
    }
    typed.push(s);
  }
  let uncorrected = 0;
  for (let i = 0; i < typed.length; i++) if (typed[i] !== goal[i]) uncorrected++;
  return { typed, keystrokes, correct, errors, backspaces, uncorrected, maxStreak, missed, completed: typed.length === goal.length };
}

export function activeDuration(events: readonly KeyEvent[], cap = IDLE_CAP_MS): number {
  let total = 0;
  for (let i = 1; i < events.length; i++) total += Math.min(cap, (events[i] as KeyEvent)[0] - (events[i - 1] as KeyEvent)[0]);
  return total;
}

function consistency(events: readonly KeyEvent[], first: number, durationMs: number): number | null {
  const seconds = Math.floor(durationMs / 1000);
  if (seconds < 3) return null;
  const buckets = new Array<number>(seconds).fill(0);
  for (const [t, s] of events) {
    if (s === BACKSPACE) continue;
    const i = Math.floor((t - first) / 1000);
    if (i < seconds) buckets[i] = (buckets[i] ?? 0) + 1;
  }
  let sum = 0;
  for (const b of buckets) sum += b;
  const mean = sum / seconds;
  if (mean === 0) return 0;
  let sq = 0;
  for (const b of buckets) sq += (b - mean) * (b - mean);
  const sd = Math.sqrt(sq / seconds);
  return Math.round(Math.max(0, 1 - sd / mean) * 10000);
}

function rates(net: number, keystrokes: number, durationMs: number) {
  return {
    netPerMinX100: roundDiv(net * 6_000_000, durationMs),
    grossPerMinX100: roundDiv(keystrokes * 6_000_000, durationMs),
    wpmX100: roundDiv(net * 1_200_000, durationMs),
    rawWpmX100: roundDiv(keystrokes * 1_200_000, durationMs),
  };
}

export function summarize(target: string | readonly string[], events: readonly KeyEvent[], options: { active?: boolean } = {}): Summary {
  const goal = chars(target);
  const r = replay(goal, events);
  const first = events.length ? (events[0] as KeyEvent)[0] : 0;
  const last = events.length ? (events[events.length - 1] as KeyEvent)[0] : 0;
  const durationMs = Math.max(1, options.active ? activeDuration(events) : last - first);
  const net = Math.max(0, r.keystrokes - ERROR_PENALTY * r.uncorrected);
  return {
    chars: goal.length,
    durationMs,
    keystrokes: r.keystrokes,
    correct: r.correct,
    errors: r.errors,
    corrected: r.errors - r.uncorrected,
    uncorrected: r.uncorrected,
    backspaces: r.backspaces,
    accuracyBp: r.keystrokes ? roundDiv(r.correct * 10000, r.keystrokes) : 0,
    net,
    ...rates(net, r.keystrokes, durationMs),
    consistencyBp: consistency(events, first, durationMs),
    maxStreak: r.maxStreak,
    missed: r.missed,
    completed: r.completed,
  };
}

export function combine(parts: readonly Summary[]): Combined {
  let chars = 0;
  let durationMs = 0;
  let keystrokes = 0;
  let correct = 0;
  let errors = 0;
  let corrected = 0;
  let uncorrected = 0;
  let backspaces = 0;
  let maxStreak = 0;
  let consSum = 0;
  let consWeight = 0;
  const missed: Record<string, number> = {};
  for (const p of parts) {
    chars += p.chars;
    durationMs += p.durationMs;
    keystrokes += p.keystrokes;
    correct += p.correct;
    errors += p.errors;
    corrected += p.corrected;
    uncorrected += p.uncorrected;
    backspaces += p.backspaces;
    maxStreak = Math.max(maxStreak, p.maxStreak);
    for (const [c, n] of Object.entries(p.missed)) missed[c] = (missed[c] ?? 0) + n;
    if (p.consistencyBp != null) {
      consSum += p.consistencyBp * p.durationMs;
      consWeight += p.durationMs;
    }
  }
  durationMs = Math.max(1, durationMs);
  const net = Math.max(0, keystrokes - ERROR_PENALTY * uncorrected);
  return {
    texts: parts.length,
    chars,
    durationMs,
    keystrokes,
    correct,
    errors,
    corrected,
    uncorrected,
    backspaces,
    accuracyBp: keystrokes ? roundDiv(correct * 10000, keystrokes) : 0,
    net,
    ...rates(net, keystrokes, durationMs),
    consistencyBp: consWeight > 0 ? Math.round(consSum / consWeight) : null,
    maxStreak,
    missed,
    completed: parts.length > 0 && parts.every((p) => p.completed),
  };
}

export function timeline(target: string | readonly string[], events: readonly KeyEvent[]): TimelinePoint[] {
  const goal = chars(target);
  if (!events.length) return [];
  const first = (events[0] as KeyEvent)[0];
  const last = (events[events.length - 1] as KeyEvent)[0];
  const seconds = Math.max(1, Math.ceil((last - first) / 1000));
  const correct = new Array<number>(seconds).fill(0);
  const wrong = new Array<number>(seconds).fill(0);
  let pos = 0;
  for (const [t, s] of events) {
    const i = Math.min(seconds - 1, Math.floor((t - first) / 1000));
    if (s === BACKSPACE) {
      if (pos > 0) pos--;
      continue;
    }
    if (pos >= goal.length) continue;
    if (s === goal[pos]) correct[i] = (correct[i] ?? 0) + 1;
    else wrong[i] = (wrong[i] ?? 0) + 1;
    pos++;
  }
  const points: TimelinePoint[] = [];
  for (let i = 0; i < seconds; i++) {
    const from = Math.max(0, i - 2);
    let c = 0;
    for (let j = from; j <= i; j++) c += correct[j] ?? 0;
    const span = i - from + 1;
    points.push({ second: i + 1, wpm: (c / 5) * (60 / span), errors: wrong[i] ?? 0 });
  }
  return points;
}

export const formatDuration = (ms: number): string => {
  const total = Math.max(0, Math.round(ms / 10));
  const cs = total % 100;
  const s = Math.floor(total / 100) % 60;
  const m = Math.floor(total / 6000);
  return `${m}:${String(s).padStart(2, '0')},${String(cs).padStart(2, '0')}`;
};

const nf = (digits: number) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const formatX100 = (v: number, digits = 0): string => nf(digits).format(v / 100);
export const formatBp = (v: number | null, digits = 1): string => (v == null ? '—' : `${nf(digits).format(v / 100)}%`);
