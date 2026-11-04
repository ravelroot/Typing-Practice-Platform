import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BACKSPACE,
  activeDuration,
  combine,
  formatBp,
  formatDuration,
  formatX100,
  replay,
  roundDiv,
  summarize,
  timeline,
  type KeyEvent,
} from '../../web/src/metrics.ts';
import { Session, diffInput } from '../../web/src/session.ts';

const typeAll = (text: string, step = 200, start = 0): KeyEvent[] => Array.from(text, (c, i) => [start + i * step, c] as KeyEvent);

test('arredondamento inteiro exato', () => {
  assert.equal(roundDiv(1, 2), 1);
  assert.equal(roundDiv(1, 3), 0);
  assert.equal(roundDiv(2, 3), 1);
  assert.equal(roundDiv(5, 0), 0);
  assert.equal(roundDiv(999_999_999_999, 7), Math.round(999_999_999_999 / 7));
});

test('texto digitado sem erros', () => {
  const s = summarize('casa azul', typeAll('casa azul', 250));
  assert.equal(s.chars, 9);
  assert.equal(s.durationMs, 2000);
  assert.equal(s.keystrokes, 9);
  assert.equal(s.correct, 9);
  assert.equal(s.errors, 0);
  assert.equal(s.accuracyBp, 10000);
  assert.equal(s.net, 9);
  assert.equal(s.netPerMinX100, 27000);
  assert.equal(s.wpmX100, 5400);
  assert.equal(s.maxStreak, 9);
  assert.equal(s.completed, true);
});

test('erro corrigido conta como erro, mas não desconta toques líquidos', () => {
  const ev: KeyEvent[] = [
    [0, 'c'],
    [100, 'x'],
    [200, BACKSPACE],
    [300, 'a'],
    [400, 's'],
    [500, 'a'],
  ];
  const s = summarize('casa', ev);
  assert.equal(s.keystrokes, 5);
  assert.equal(s.correct, 4);
  assert.equal(s.errors, 1);
  assert.equal(s.corrected, 1);
  assert.equal(s.uncorrected, 0);
  assert.equal(s.backspaces, 1);
  assert.equal(s.net, 5);
  assert.equal(s.accuracyBp, 8000);
  assert.deepEqual(s.missed, { a: 1 });
  assert.equal(s.maxStreak, 3);
});

test('erro não corrigido desconta cinco toques líquidos', () => {
  const s = summarize('casa', [
    [0, 'c'],
    [100, 'o'],
    [200, 's'],
    [300, 'a'],
  ]);
  assert.equal(s.uncorrected, 1);
  assert.equal(s.net, 0);
  const t = summarize('casa grande', typeAll('casa grando', 100));
  assert.equal(t.uncorrected, 1);
  assert.equal(t.net, 6);
  assert.equal(t.netPerMinX100, roundDiv(6 * 6_000_000, 1000));
});

test('toques além do fim e retrocesso no início são ignorados', () => {
  const r = replay('ab', [
    [0, BACKSPACE],
    [10, 'a'],
    [20, 'b'],
    [30, 'c'],
  ]);
  assert.equal(r.keystrokes, 2);
  assert.equal(r.backspaces, 0);
  assert.equal(r.completed, true);
});

test('caracteres compostos e quebras de linha contam como um toque', () => {
  const s = summarize('pé\nmão', typeAll('pé\nmão', 100));
  assert.equal(s.chars, 6);
  assert.equal(s.keystrokes, 6);
  assert.equal(s.correct, 6);
});

test('consistência só aparece com pelo menos três segundos', () => {
  assert.equal(summarize('abc', typeAll('abc', 100)).consistencyBp, null);
  const steady = summarize('a'.repeat(41), typeAll('a'.repeat(41), 100));
  assert.equal(steady.consistencyBp, 10000);
  const uneven: KeyEvent[] = [...typeAll('a'.repeat(30), 33), ...typeAll('a'.repeat(5), 900, 1000)];
  const u = summarize('a'.repeat(35), uneven);
  assert.ok((u.consistencyBp ?? 0) < 6000);
});

test('tempo ativo limita as pausas longas', () => {
  const ev: KeyEvent[] = [
    [0, 'a'],
    [500, 'b'],
    [30_500, 'c'],
  ];
  assert.equal(activeDuration(ev), 2500);
  assert.equal(summarize('abc', ev, { active: true }).durationMs, 2500);
  assert.equal(summarize('abc', ev).durationMs, 30_500);
});

test('combinar sessões soma os toques e recalcula as taxas', () => {
  const a = summarize('casa', typeAll('casa', 250));
  const b = summarize('mesa', typeAll('mesu', 250));
  const c = combine([a, b]);
  assert.equal(c.texts, 2);
  assert.equal(c.keystrokes, 8);
  assert.equal(c.uncorrected, 1);
  assert.equal(c.net, 3);
  assert.equal(c.durationMs, 1500);
  assert.equal(c.accuracyBp, 8750);
  assert.equal(c.completed, true);
});

test('linha do tempo mostra velocidade e erros por segundo', () => {
  const points = timeline('a'.repeat(20), typeAll('a'.repeat(10) + 'b' + 'a'.repeat(9), 150));
  assert.equal(points.length, 3);
  assert.ok(points.every((p) => p.wpm > 0));
  assert.equal(points.reduce((s, p) => s + p.errors, 0), 1);
});

test('formatos em português', () => {
  assert.equal(formatDuration(83_456), '1:23,46');
  assert.equal(formatDuration(0), '0:00,00');
  assert.equal(formatX100(123456, 1), '1.234,6');
  assert.equal(formatBp(9875), '98,8%');
  assert.equal(formatBp(null), '—');
});

test('diferença entre o que estava e o que foi digitado', () => {
  assert.deepEqual(diffInput('cas', 'casa'), { deletes: 0, inserts: ['a'] });
  assert.deepEqual(diffInput('casa', 'cas'), { deletes: 1, inserts: [] });
  assert.deepEqual(diffInput('casa azul', 'casa '), { deletes: 4, inserts: [] });
  assert.deepEqual(diffInput('p', 'pé'), { deletes: 0, inserts: ['é'] });
  assert.deepEqual(diffInput('ab', 'ax'), { deletes: 1, inserts: ['x'] });
});

test('sessão registra os toques e bate com o resumo', () => {
  const s = new Session('olá mundo');
  let now = 1000;
  for (const ch of 'olá mi') s.type(ch, (now += 120));
  s.backspace((now += 120));
  for (const ch of 'undo') s.type(ch, (now += 120));
  assert.equal(s.done, true);
  assert.equal(s.value, 'olá mundo');
  const sum = summarize(s.target, s.events);
  assert.equal(sum.keystrokes, s.keystrokes);
  assert.equal(sum.correct, s.correct);
  assert.equal(sum.errors, s.errors);
  assert.equal(sum.durationMs, 1200);
  assert.equal(s.type('x', now + 100).type, 'ignored');
});

test('parar no erro não deixa a letra errada entrar', () => {
  const s = new Session('ab', { stopOnError: true });
  assert.equal(s.type('x', 0).type, 'reject');
  assert.equal(s.position, 0);
  s.type('a', 100);
  s.type('b', 200);
  const sum = summarize(s.target, s.events);
  assert.equal(sum.errors, 1);
  assert.equal(sum.uncorrected, 0);
  assert.equal(sum.completed, true);
});
