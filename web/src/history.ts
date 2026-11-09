import { COMPLEXITY_LABELS, KIND_LABELS, SIZE_LABELS, type Complexity, type Kind, type Size } from './content.ts';
import type { Summary } from './metrics.ts';
import type { Mode } from './prefs.ts';
import { storage } from './ui.ts';

export const MAX_ENTRIES = 500;

export interface Entry {
  id: string;
  at: string;
  mode: Mode;
  kind: Kind;
  size: Size;
  complexity: Complexity;
  seed: number | null;
  phraseId: string | null;
  texts: number;
  chars: number;
  durationMs: number;
  keystrokes: number;
  correct: number;
  errors: number;
  uncorrected: number;
  accuracyBp: number;
  net: number;
  netPerMinX100: number;
  wpmX100: number;
  consistencyBp: number | null;
  maxStreak: number;
  score?: number;
  grade?: string;
  perfect?: number;
  great?: number;
  good?: number;
  miss?: number;
  title?: string;
  bpm?: number;
  track?: string;
}

export interface RhythmStats {
  score: number;
  grade: string;
  perfect: number;
  great: number;
  good: number;
  miss: number;
  wrong: number;
  notes: number;
  hits: number;
  presses: number;
  maxCombo: number;
  accuracyBp: number;
  durationMs: number;
  title: string;
  bpm: number;
  track: string;
  completed: boolean;
}

export interface Context {
  mode: Mode;
  kind: Kind;
  size: Size;
  complexity: Complexity;
  seed: number | null;
  phraseId: string | null;
  texts?: number;
}

const isEntry = (e: unknown): e is Entry =>
  !!e && typeof e === 'object' && typeof (e as Entry).id === 'string' && typeof (e as Entry).netPerMinX100 === 'number' && typeof (e as Entry).at === 'string';

type Category = Pick<Entry, 'kind' | 'size' | 'complexity'> & Partial<Pick<Entry, 'mode' | 'track'>>;

export const categoryKey = (e: Category): string => {
  const base = e.kind === 'custom' ? 'custom' : `${e.kind}/${e.size}/${e.complexity}`;
  return e.mode === 'rhythm' && e.track ? `${e.track}|${base}${e.kind === 'custom' ? `/${e.size}/${e.complexity}` : ''}` : base;
};

export const MODE_LABELS: Record<Mode, string> = { free: 'Livre', test: 'Teste', rhythm: 'Ritmo' };

const metric = (e: Entry): number => (e.mode === 'rhythm' ? (e.score ?? 0) : e.netPerMinX100);

export const categoryLabel = (e: Pick<Entry, 'kind' | 'size' | 'complexity'>): string =>
  e.kind === 'custom' ? KIND_LABELS.custom : `${KIND_LABELS[e.kind]} · ${SIZE_LABELS[e.size]} · ${COMPLEXITY_LABELS[e.complexity]}`;

export class History {
  entries: Entry[];

  constructor() {
    const raw = storage.get<unknown[]>('historico', []);
    this.entries = Array.isArray(raw) ? raw.filter(isEntry).slice(0, MAX_ENTRIES) : [];
  }

  private save() {
    storage.set('historico', this.entries);
  }

  best(cat: string, mode: Mode = 'test'): Entry | null {
    let best: Entry | null = null;
    for (const e of this.entries) {
      if (e.mode !== mode || categoryKey(e) !== cat) continue;
      if (!best || metric(e) > metric(best)) best = e;
    }
    return best;
  }

  add(summary: Summary, ctx: Context): { entry: Entry; record: boolean; previous: Entry | null } {
    const entry: Entry = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      at: new Date().toISOString(),
      mode: ctx.mode,
      kind: ctx.kind,
      size: ctx.size,
      complexity: ctx.complexity,
      seed: ctx.seed,
      phraseId: ctx.phraseId,
      texts: ctx.texts ?? 1,
      chars: summary.chars,
      durationMs: summary.durationMs,
      keystrokes: summary.keystrokes,
      correct: summary.correct,
      errors: summary.errors,
      uncorrected: summary.uncorrected,
      accuracyBp: summary.accuracyBp,
      net: summary.net,
      netPerMinX100: summary.netPerMinX100,
      wpmX100: summary.wpmX100,
      consistencyBp: summary.consistencyBp,
      maxStreak: summary.maxStreak,
    };
    const previous = this.best(categoryKey(entry), entry.mode);
    const record = entry.mode === 'test' && summary.completed && entry.netPerMinX100 > 0 && (!previous || entry.netPerMinX100 > previous.netPerMinX100);
    return this.push(entry, record, previous);
  }

  addRhythm(r: RhythmStats, ctx: Context): { entry: Entry; record: boolean; previous: Entry | null } {
    const minutes = r.durationMs / 60000;
    const perMin = minutes > 0 ? Math.round((r.hits / minutes) * 100) : 0;
    const entry: Entry = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      at: new Date().toISOString(),
      mode: 'rhythm',
      kind: ctx.kind,
      size: ctx.size,
      complexity: ctx.complexity,
      seed: ctx.seed,
      phraseId: null,
      texts: 1,
      chars: r.notes,
      durationMs: r.durationMs,
      keystrokes: r.presses,
      correct: r.hits,
      errors: r.miss + r.wrong,
      uncorrected: r.miss,
      accuracyBp: r.accuracyBp,
      net: r.hits,
      netPerMinX100: perMin,
      wpmX100: Math.round(perMin / 5),
      consistencyBp: null,
      maxStreak: r.maxCombo,
      score: r.score,
      grade: r.grade,
      perfect: r.perfect,
      great: r.great,
      good: r.good,
      miss: r.miss,
      title: r.title,
      bpm: r.bpm,
      track: r.track,
    };
    const previous = this.best(categoryKey(entry), 'rhythm');
    const record = r.completed && r.score > 0 && (!previous || r.score > (previous.score ?? 0));
    return this.push(entry, record, previous);
  }

  private push(entry: Entry, record: boolean, previous: Entry | null) {
    this.entries.unshift(entry);
    if (this.entries.length > MAX_ENTRIES) this.entries.length = MAX_ENTRIES;
    this.save();
    return { entry, record, previous };
  }

  records(mode: Mode = 'test'): Entry[] {
    const map = new Map<string, Entry>();
    for (const e of this.entries) {
      if (e.mode !== mode) continue;
      const key = categoryKey(e);
      const cur = map.get(key);
      if (!cur || metric(e) > metric(cur)) map.set(key, e);
    }
    return [...map.values()].sort((a, b) => metric(b) - metric(a));
  }

  clear() {
    this.entries = [];
    this.save();
  }

  toCsv(): string {
    const head = [
      'data', 'modo', 'tipo', 'tamanho', 'complexidade', 'textos', 'caracteres', 'tempo_ms', 'toques_brutos', 'acertos', 'erros',
      'erros_nao_corrigidos', 'precisao_pct', 'toques_liquidos', 'toques_liquidos_por_minuto', 'palavras_por_minuto', 'consistencia_pct', 'maior_sequencia',
      'pontos', 'nota', 'perfeitos', 'otimos', 'bons', 'perdidas', 'musica', 'bpm',
    ];
    const rows = this.entries.map((e) => [
      e.at, MODE_LABELS[e.mode]?.toLowerCase() ?? e.mode, KIND_LABELS[e.kind], SIZE_LABELS[e.size], COMPLEXITY_LABELS[e.complexity], e.texts, e.chars, e.durationMs,
      e.keystrokes, e.correct, e.errors, e.uncorrected, (e.accuracyBp / 100).toFixed(2), e.net, (e.netPerMinX100 / 100).toFixed(2),
      (e.wpmX100 / 100).toFixed(2), e.consistencyBp == null ? '' : (e.consistencyBp / 100).toFixed(2), e.maxStreak,
      e.score ?? '', e.grade ?? '', e.perfect ?? '', e.great ?? '', e.good ?? '', e.miss ?? '', e.title ?? '', e.bpm ?? '',
    ]);
    const cell = (v: unknown) => {
      const raw = String(v);
      const s = /^[=+\-@\t\r]/.test(raw) && typeof v === 'string' ? `'${raw}` : raw;
      return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return '\ufeff' + [head, ...rows].map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';
  }
}
