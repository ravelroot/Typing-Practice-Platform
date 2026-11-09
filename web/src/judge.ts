import type { Note } from './chart.ts';

export type Hit = 'perfect' | 'great' | 'good';
export type Grade = Hit | 'miss';
export type Letter = 'S' | 'A' | 'B' | 'C' | 'D';

export const WINDOW: Record<Hit, number> = { perfect: 0.045, great: 0.09, good: 0.14 };
export const POINTS: Record<Grade, number> = { perfect: 300, great: 200, good: 100, miss: 0 };
export const WEIGHT_BP: Record<Grade, number> = { perfect: 10000, great: 7000, good: 4000, miss: 0 };
export const HOLD_TICK = 10;
export const HOLD_BONUS = 100;
export const RELEASE_GRACE = 0.12;
export const COMBO_STEP = 10;
export const MAX_MULTIPLIER = 4;

export const GRADE_LABELS: Record<Grade, string> = { perfect: 'PERFEITO', great: 'ÓTIMO', good: 'BOM', miss: 'ERROU' };

export type JudgeEvent =
  | { type: 'hit'; note: Note; grade: Hit; offset: number; points: number; combo: number }
  | { type: 'miss'; note: Note }
  | { type: 'wrong'; char: string }
  | { type: 'tick'; note: Note; points: number }
  | { type: 'release'; note: Note; full: boolean; points: number };

interface Hold {
  note: Note;
  start: number;
  paid: number;
}

export const multiplierFor = (combo: number): number => Math.min(MAX_MULTIPLIER, 1 + Math.floor(combo / COMBO_STEP));

export const gradeFor = (offset: number): Grade => {
  const d = Math.abs(offset);
  if (d <= WINDOW.perfect) return 'perfect';
  if (d <= WINDOW.great) return 'great';
  if (d <= WINDOW.good) return 'good';
  return 'miss';
};

export const letterFor = (accuracyBp: number): Letter => {
  if (accuracyBp >= 9500) return 'S';
  if (accuracyBp >= 9000) return 'A';
  if (accuracyBp >= 8000) return 'B';
  if (accuracyBp >= 7000) return 'C';
  return 'D';
};

export class Judge {
  readonly notes: readonly Note[];
  readonly grades: (Grade | null)[];
  readonly counts: Record<Grade, number> = { perfect: 0, great: 0, good: 0, miss: 0 };
  readonly missed: Record<string, number> = {};
  private holds = new Map<string, Hold>();
  private head = 0;
  private offsetSum = 0;
  private tick: number;
  score = 0;
  combo = 0;
  maxCombo = 0;
  wrong = 0;
  presses = 0;
  holdsFull = 0;
  holdsBroken = 0;

  constructor(notes: readonly Note[], tick: number) {
    this.notes = notes;
    this.tick = tick;
    this.grades = notes.map(() => null);
  }

  get multiplier(): number {
    return multiplierFor(this.combo);
  }

  get hits(): number {
    return this.counts.perfect + this.counts.great + this.counts.good;
  }

  get judged(): number {
    return this.hits + this.counts.miss;
  }

  get done(): boolean {
    return this.head >= this.notes.length && this.holds.size === 0;
  }

  get accuracyBp(): number {
    const n = this.judged;
    if (!n) return 10000;
    const sum = this.counts.perfect * WEIGHT_BP.perfect + this.counts.great * WEIGHT_BP.great + this.counts.good * WEIGHT_BP.good;
    return Math.round(sum / n);
  }

  get meanOffsetMs(): number | null {
    return this.hits ? Math.round((this.offsetSum / this.hits) * 1000) : null;
  }

  get letter(): Letter {
    return letterFor(this.accuracyBp);
  }

  get fullCombo(): boolean {
    return this.counts.miss === 0 && this.wrong === 0 && this.judged === this.notes.length && this.notes.length > 0;
  }

  next(): Note | null {
    for (let i = this.head; i < this.notes.length; i++) if (this.grades[i] == null) return this.notes[i] as Note;
    return null;
  }

  holding(note: Note): boolean {
    return this.holds.get(note.char)?.note === note;
  }

  press(char: string, t: number): JudgeEvent[] {
    const events = this.update(t);
    this.presses++;
    let pending = false;
    for (let i = this.head; i < this.notes.length; i++) {
      const note = this.notes[i] as Note;
      if (note.time - t > WINDOW.good) break;
      if (this.grades[i] != null || t - note.time > WINDOW.good) continue;
      pending = true;
      if (note.char !== char) continue;
      events.push(this.hit(note, t - note.time, t));
      return events;
    }
    if (pending) {
      this.wrong++;
      this.combo = 0;
      events.push({ type: 'wrong', char });
    }
    return events;
  }

  release(char: string, t: number): JudgeEvent[] {
    const events = this.update(t);
    const hold = this.holds.get(char);
    if (!hold) return events;
    this.holds.delete(char);
    if (t >= hold.note.end - RELEASE_GRACE) events.push(this.finish(hold.note));
    else {
      this.holdsBroken++;
      events.push({ type: 'release', note: hold.note, full: false, points: 0 });
    }
    return events;
  }

  releaseAll(t: number): JudgeEvent[] {
    const events: JudgeEvent[] = [];
    for (const char of [...this.holds.keys()]) events.push(...this.release(char, t));
    return events;
  }

  update(t: number): JudgeEvent[] {
    const events: JudgeEvent[] = [];
    for (const [char, hold] of this.holds) {
      const until = Math.min(t, hold.note.end);
      const due = Math.max(0, Math.floor((until - hold.start) / this.tick + 1e-6));
      const points = (due - hold.paid) * HOLD_TICK * this.multiplier;
      hold.paid = Math.max(hold.paid, due);
      if (points > 0) {
        this.score += points;
        events.push({ type: 'tick', note: hold.note, points });
      }
      if (t >= hold.note.end) {
        this.holds.delete(char);
        events.push(this.finish(hold.note));
      }
    }
    while (this.head < this.notes.length) {
      const note = this.notes[this.head] as Note;
      if (this.grades[this.head] != null) {
        this.head++;
        continue;
      }
      if (t - note.time <= WINDOW.good) break;
      this.grades[this.head] = 'miss';
      this.counts.miss++;
      this.combo = 0;
      this.missed[note.char] = (this.missed[note.char] ?? 0) + 1;
      events.push({ type: 'miss', note });
      this.head++;
    }
    return events;
  }

  private hit(note: Note, offset: number, t: number): JudgeEvent {
    const grade = gradeFor(offset) as Hit;
    this.grades[note.i] = grade;
    this.counts[grade]++;
    this.combo++;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    this.offsetSum += offset;
    const points = POINTS[grade] * this.multiplier;
    this.score += points;
    if (note.hold > 0) this.holds.set(note.char, { note, start: Math.max(note.time, t), paid: 0 });
    while (this.head < this.notes.length && this.grades[this.head] != null) this.head++;
    return { type: 'hit', note, grade, offset, points, combo: this.combo };
  }

  private finish(note: Note): JudgeEvent {
    const points = HOLD_BONUS * this.multiplier;
    this.score += points;
    this.holdsFull++;
    return { type: 'release', note, full: true, points };
  }
}
