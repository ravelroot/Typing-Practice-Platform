import { BACKSPACE, type KeyEvent } from './metrics.ts';

export type Step =
  | { type: 'char'; index: number; ok: boolean; char: string; expected: string; streak: number; done: boolean }
  | { type: 'reject'; index: number; char: string; expected: string }
  | { type: 'back'; index: number }
  | { type: 'ignored' };

export interface Diff {
  deletes: number;
  inserts: string[];
}

export function diffInput(prev: string, next: string): Diff {
  const a = Array.from(prev);
  const b = Array.from(next);
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return { deletes: a.length - i, inserts: b.slice(i) };
}

export class Session {
  readonly target: string[];
  readonly typed: string[] = [];
  readonly events: KeyEvent[] = [];
  readonly stopOnError: boolean;
  private origin = -1;
  private lastAt = 0;
  streak = 0;
  bestStreak = 0;
  correct = 0;
  errors = 0;
  keystrokes = 0;

  constructor(text: string, options: { stopOnError?: boolean } = {}) {
    this.target = Array.from(text);
    this.stopOnError = Boolean(options.stopOnError);
  }

  get started(): boolean {
    return this.origin >= 0;
  }

  get done(): boolean {
    return this.typed.length >= this.target.length;
  }

  get position(): number {
    return this.typed.length;
  }

  get value(): string {
    return this.typed.join('');
  }

  get expected(): string | undefined {
    return this.target[this.typed.length];
  }

  elapsed(now: number): number {
    if (this.origin < 0) return 0;
    return Math.max(0, (this.done ? this.lastAt : now) - this.origin);
  }

  lastEventAt(): number {
    return this.lastAt;
  }

  private stamp(now: number): number {
    if (this.origin < 0) this.origin = now;
    this.lastAt = now;
    return Math.max(0, Math.round(now - this.origin));
  }

  private push(t: number, ch: string) {
    const prev = this.events[this.events.length - 1];
    this.events.push([prev && prev[0] > t ? prev[0] : t, ch]);
  }

  type(ch: string, now: number): Step {
    if (this.done) return { type: 'ignored' };
    const index = this.typed.length;
    const expected = this.target[index] as string;
    const t = this.stamp(now);
    const ok = ch === expected;
    this.keystrokes++;
    if (!ok && this.stopOnError) {
      this.errors++;
      this.streak = 0;
      this.push(t, ch);
      this.push(t, BACKSPACE);
      return { type: 'reject', index, char: ch, expected };
    }
    this.push(t, ch);
    this.typed.push(ch);
    if (ok) {
      this.correct++;
      this.streak++;
      if (this.streak > this.bestStreak) this.bestStreak = this.streak;
    } else {
      this.errors++;
      this.streak = 0;
    }
    return { type: 'char', index, ok, char: ch, expected, streak: this.streak, done: this.done };
  }

  backspace(now: number): Step {
    if (this.typed.length === 0 || this.done) return { type: 'ignored' };
    const t = this.stamp(now);
    this.typed.pop();
    this.push(t, BACKSPACE);
    return { type: 'back', index: this.typed.length };
  }

  apply(diff: Diff, now: number): Step[] {
    const steps: Step[] = [];
    for (let i = 0; i < diff.deletes; i++) steps.push(this.backspace(now));
    for (const ch of diff.inserts) {
      if (this.done) break;
      steps.push(this.type(ch, now));
    }
    return steps.filter((s) => s.type !== 'ignored');
  }

  statusAt(i: number): 'ok' | 'err' | 'pending' {
    if (i >= this.typed.length) return 'pending';
    return this.typed[i] === this.target[i] ? 'ok' : 'err';
  }

  liveNetPerMin(now: number): number {
    const ms = this.elapsed(now);
    if (ms < 800) return 0;
    let uncorrected = 0;
    for (let i = 0; i < this.typed.length; i++) if (this.typed[i] !== this.target[i]) uncorrected++;
    const net = Math.max(0, this.keystrokes - 5 * uncorrected);
    return (net * 60000) / ms;
  }

  liveAccuracy(): number {
    return this.keystrokes ? this.correct / this.keystrokes : 1;
  }
}
