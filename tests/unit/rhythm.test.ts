import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FIRST_NOTE_BAR, KEY_NAMES, SCALES, SONG_SECONDS, STEPS_PER_BAR, compose, hashId, laneOf, parseTracks, rhythmWords, stepTime, warp, type Note, type Track } from '../../web/src/chart.ts';
import { GROOVES, GROOVE_IDS, VOICES } from '../../web/src/grooves.ts';
import { HOLD_BONUS, HOLD_TICK, Judge, WINDOW, gradeFor, letterFor, multiplierFor } from '../../web/src/judge.ts';

const RAW = JSON.parse(readFileSync(new URL('../../web/data/musicas.json', import.meta.url), 'utf8'));
const TRACKS = parseTracks(RAW);
const TRACK = TRACKS[0] as Track;
const SWING = TRACKS.find((t) => t.swing > 0.2) as Track;
const FAST = TRACKS.find((t) => t.bpm >= 160) as Track;

const WORDS = ['casa', 'janela', 'pluma', 'ritmo', 'teclado', 'música', 'açúcar', 'sol', 'mar', 'viagem', 'caderno', 'piano'];

const note = (i: number, time: number, char: string, hold = 0, word = 0): Note => ({
  i,
  step: i * 2,
  time,
  char,
  lane: laneOf(char),
  word,
  index: i,
  last: false,
  holdSteps: hold ? 4 : 0,
  hold,
  end: time + hold,
  pitch: 72,
});

test('cada tecla cai na pista do grupo de dedos certo', () => {
  for (const c of 'qazwsx12') assert.equal(laneOf(c), 0, c);
  for (const c of 'edcrfvtgb345') assert.equal(laneOf(c), 1, c);
  for (const c of 'yhnujm67') assert.equal(laneOf(c), 2, c);
  for (const c of 'ikolpç890') assert.equal(laneOf(c), 3, c);
  for (const c of ['Á', 'A', ' ', '?', 'é', '\n']) assert.equal(laneOf(c), -1, JSON.stringify(c));
});

test('as palavras perdem acentos, mantêm a cedilha e as longas são divididas por igual', () => {
  assert.deepEqual(rhythmWords('Coração, ação! Último pé-de-moleque 2026'), ['coraçao', 'açao', 'ultimo', 'pe', 'de', 'moleque', '2026']);
  assert.deepEqual(rhythmWords('paralelepípedo'), ['paralel', 'epipedo']);
  assert.deepEqual(rhythmWords('  ...  '), []);
  for (const w of rhythmWords('inconstitucionalissimamente anticonstitucional')) assert.ok(w.length <= 10);
});

test('a mesma semente gera a mesma música e sementes diferentes geram outras', () => {
  const a = compose(WORDS, { size: 'short', complexity: 'medium', seed: 42, track: TRACK });
  const b = compose(WORDS, { size: 'short', complexity: 'medium', seed: 42, track: TRACK });
  const c = compose(WORDS, { size: 'short', complexity: 'medium', seed: 43, track: TRACK });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.notes.map((n) => n.step), c.notes.map((n) => n.step));
  assert.equal(a.title, TRACK.title);
  assert.deepEqual(a.chords, c.chords);
});

test('o catálogo tem pelo menos 50 músicas válidas, únicas e variadas', () => {
  assert.ok(RAW.tracks.length >= 50);
  assert.equal(TRACKS.length, RAW.tracks.length, 'nenhuma faixa foi descartada na validação');
  assert.equal(new Set(TRACKS.map((t) => t.id)).size, TRACKS.length);
  assert.equal(new Set(TRACKS.map((t) => t.title.toLowerCase())).size, TRACKS.length);
  assert.ok(new Set(TRACKS.map((t) => t.groove)).size >= 15);
  for (const t of TRACKS) {
    assert.ok(t.key in KEY_NAMES);
    const scale = SCALES[t.scale];
    for (const d of [...t.verse, ...t.chorus]) {
      const third = ((scale[(d + 2) % 7] as number) - (scale[d] as number) + 12) % 12;
      const fifth = ((scale[(d + 4) % 7] as number) - (scale[d] as number) + 12) % 12;
      assert.ok((third === 3 || third === 4) && fifth === 7, `${t.id}: acorde diminuto no grau ${d}`);
    }
  }
});

test('a validação do catálogo descarta faixas inválidas', () => {
  const ok = { ...RAW.tracks[0] };
  const bad = [
    { ...ok, id: 'Com Espaço' },
    { ...ok, id: 'b', bpm: 400 },
    { ...ok, id: 'c', groove: 'polca' },
    { ...ok, id: 'd', verse: [0, 9] },
    { ...ok, id: 'e', key: 'H' },
    { ...ok, id: 'f', swing: 0.9 },
    { ...ok, id: 'g', title: '' },
    ok,
  ];
  assert.deepEqual(parseTracks({ tracks: [ok, ...bad] }).map((t) => t.id), [ok.id]);
  assert.deepEqual(parseTracks(null), []);
  assert.deepEqual(parseTracks({ tracks: 'x' }), []);
});

test('os estilos têm padrões de 16 passos com x, o e ponto', () => {
  for (const id of GROOVE_IDS) {
    const g = GROOVES[id];
    for (const part of [g.verse, g.chorus]) {
      for (const voice of VOICES) {
        const p = part[voice];
        if (p === undefined) continue;
        assert.match(p, /^[xo.]{16}$/, `${id}.${voice}`);
      }
    }
  }
});

test('o swing atrasa só o contratempo e mantém os tempos no lugar', () => {
  assert.equal(warp(0, 0.3), 0);
  assert.equal(warp(4, 0.3), 4);
  assert.equal(warp(2, 0), 2);
  assert.ok(Math.abs(warp(2, 0.3) - 2.6) < 1e-9);
  assert.ok(warp(1, 0.3) < warp(2, 0.3) && warp(2, 0.3) < warp(3, 0.3) && warp(3, 0.3) < warp(4, 0.3));
  const song = compose(WORDS, { size: 'short', complexity: 'medium', seed: 5, track: SWING });
  for (const n of song.notes) assert.ok(Math.abs(n.time - stepTime(song, n.step)) < 1e-9);
});

test('músicas rápidas usam a grade de colcheias para continuar digitáveis', () => {
  const song = compose(WORDS, { size: 'short', complexity: 'hard', seed: 3, track: FAST });
  for (let i = 1; i < song.notes.length; i++) {
    const a = song.notes[i - 1] as Note;
    const b = song.notes[i] as Note;
    assert.ok(b.time - a.end >= 0.15, `${b.time - a.end}`);
  }
});

test('a melodia de cada música é a mesma em qualquer partida', () => {
  const pitchAt = (seed: number) => {
    const song = compose(WORDS, { size: 'medium', complexity: 'hard', seed, track: TRACK });
    return new Map(song.notes.map((n) => [n.step, n.pitch]));
  };
  const a = pitchAt(1);
  const b = pitchAt(2);
  let shared = 0;
  for (const [step, pitch] of a) {
    if (!b.has(step)) continue;
    shared++;
    assert.equal(b.get(step), pitch);
  }
  assert.ok(shared > 20);
  assert.notEqual(hashId(TRACKS[0]?.id ?? ''), hashId(TRACKS[1]?.id ?? ''));
});

test('a partitura respeita a contagem, a ordem, as notas longas e o fim da música', () => {
  for (const complexity of ['easy', 'medium', 'hard'] as const) {
    for (const size of ['short', 'medium', 'long'] as const) {
      for (let seed = 1; seed <= 12; seed++) {
        const song = compose(WORDS, { size, complexity, seed, track: TRACKS[(seed * 7) % TRACKS.length] as Track });
        assert.ok(song.notes.length > 20, `${complexity}/${size}/${seed}`);
        assert.equal(song.sections[0], 'count');
        assert.equal(song.sections[song.bars - 1], 'outro');
        assert.equal(song.notes[0]?.step, FIRST_NOTE_BAR * STEPS_PER_BAR);
        assert.ok(Math.abs(song.duration - SONG_SECONDS[size]) < 32, `${song.duration}s`);
        const outro = (song.bars - 1) * STEPS_PER_BAR;
        let prev: Note | null = null;
        for (const n of song.notes) {
          assert.ok(n.lane >= 0 && n.lane < 4);
          assert.ok(n.step + n.holdSteps <= outro);
          assert.ok(n.pitch >= 55 && n.pitch <= 85, `altura ${n.pitch}`);
          if (prev) assert.ok(n.step >= prev.step + prev.holdSteps + 1 && n.time > prev.end, 'notas não se sobrepõem');
          if (n.holdSteps) assert.ok(n.last, 'só a última letra da palavra é longa');
          prev = n;
        }
        song.words.forEach((w, i) => {
          assert.equal(song.notes.filter((n) => n.word === i).map((n) => n.char).join(''), w);
        });
      }
    }
  }
});

test('quanto mais difícil, mais notas por segundo', () => {
  const rate = (complexity: 'easy' | 'medium' | 'hard') => {
    let total = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const s = compose(WORDS, { size: 'medium', complexity, seed, track: TRACKS[seed] as Track });
      total += s.notes.length / s.duration;
    }
    return total / 8;
  };
  const easy = rate('easy');
  const medium = rate('medium');
  const hard = rate('hard');
  assert.ok(easy < medium && medium < hard, `${easy} < ${medium} < ${hard}`);
});

test('sem palavras digitáveis a música usa uma palavra padrão', () => {
  const song = compose(['???', 'ÁÉ'], { size: 'short', complexity: 'easy', seed: 7, track: TRACK });
  assert.ok(song.notes.length > 0);
  assert.ok(song.words.every((w) => w === 'pluma'));
});

test('janelas de tempo, multiplicador e nota final', () => {
  assert.equal(gradeFor(0), 'perfect');
  assert.equal(gradeFor(-WINDOW.perfect), 'perfect');
  assert.equal(gradeFor(0.08), 'great');
  assert.equal(gradeFor(-0.13), 'good');
  assert.equal(gradeFor(0.15), 'miss');
  assert.deepEqual([0, 9, 10, 19, 20, 30, 99].map(multiplierFor), [1, 1, 2, 2, 3, 4, 4]);
  assert.deepEqual([10000, 9500, 9499, 9000, 8000, 7000, 6999].map(letterFor), ['S', 'S', 'A', 'A', 'B', 'C', 'D']);
});

test('jogada perfeita: tudo PERFEITO, combo completo e pontos com multiplicador', () => {
  const notes = Array.from({ length: 12 }, (_, i) => note(i, 1 + i * 0.25, 'casaporta'[i % 9] as string));
  const j = new Judge(notes, 0.0625);
  for (const n of notes) {
    const ev = j.press(n.char, n.time + 0.01);
    assert.equal(ev.at(-1)?.type, 'hit');
  }
  j.update(10);
  assert.equal(j.counts.perfect, 12);
  assert.equal(j.accuracyBp, 10000);
  assert.equal(j.letter, 'S');
  assert.equal(j.maxCombo, 12);
  assert.ok(j.fullCombo);
  assert.ok(j.done);
  assert.equal(j.score, 9 * 300 + 3 * 600);
  assert.equal(j.meanOffsetMs, 10);
});

test('nota que passa vira erro, quebra o combo e entra nas letras para treinar', () => {
  const notes = [note(0, 1, 'a'), note(1, 1.3, 'b'), note(2, 1.6, 'c')];
  const j = new Judge(notes, 0.05);
  j.press('a', 1);
  const ev = j.update(1.3 + WINDOW.good + 0.001);
  assert.deepEqual(ev.map((e) => e.type), ['miss']);
  assert.equal(j.combo, 0);
  assert.deepEqual(j.missed, { b: 1 });
  j.press('c', 1.62);
  assert.equal(j.accuracyBp, Math.round((10000 + 0 + 10000) / 3));
  assert.equal(j.letter, 'D');
});

test('tecla errada perto de uma nota quebra o combo; tecla solta longe das notas é ignorada', () => {
  const notes = [note(0, 1, 'a'), note(1, 2, 's')];
  const j = new Judge(notes, 0.05);
  assert.deepEqual(j.press('x', 0.5), []);
  assert.equal(j.wrong, 0);
  j.press('a', 1);
  assert.equal(j.combo, 1);
  const ev = j.press('k', 1.95);
  assert.deepEqual(ev.map((e) => e.type), ['wrong']);
  assert.equal(j.combo, 0);
  assert.equal(j.wrong, 1);
  j.press('s', 2.01);
  assert.equal(j.counts.perfect, 2);
  assert.equal(j.fullCombo, false);
});

test('letras quase juntas podem sair fora de ordem sem perder nenhuma', () => {
  const notes = [note(0, 1, 'a'), note(1, 1.11, 'b')];
  const j = new Judge(notes, 0.05);
  j.press('b', 1.04);
  j.press('a', 1.05);
  assert.equal(j.hits, 2);
  assert.equal(j.counts.miss, 0);
});

test('nota longa: segurar até o fim rende pontos por tempo e bônus; soltar antes não', () => {
  const tick = 0.1;
  const full = new Judge([note(0, 1, 'a', 0.5)], tick);
  full.press('a', 1);
  const ticks = full.update(1.5).filter((e) => e.type === 'tick').reduce((s, e) => s + (e.type === 'tick' ? e.points : 0), 0);
  assert.equal(ticks, 5 * HOLD_TICK);
  assert.equal(full.holdsFull, 1);
  assert.equal(full.score, 300 + 5 * HOLD_TICK + HOLD_BONUS);
  assert.ok(full.done);

  const early = new Judge([note(0, 1, 'a', 0.5)], tick);
  early.press('a', 1);
  const ev = early.release('a', 1.2);
  assert.equal(ev.at(-1)?.type, 'release');
  assert.equal(early.holdsBroken, 1);
  assert.equal(early.holdsFull, 0);
  assert.equal(early.score, 300 + 2 * HOLD_TICK);

  const grace = new Judge([note(0, 1, 'a', 0.5)], tick);
  grace.press('a', 1);
  grace.release('a', 1.45);
  assert.equal(grace.holdsFull, 1);
});

test('precisão pondera PERFEITO, ÓTIMO, BOM e erro', () => {
  const notes = [note(0, 1, 'a'), note(1, 2, 's'), note(2, 3, 'd'), note(3, 4, 'f')];
  const j = new Judge(notes, 0.05);
  j.press('a', 1);
  j.press('s', 2.07);
  j.press('d', 2.88);
  j.update(5);
  assert.deepEqual(j.counts, { perfect: 1, great: 1, good: 1, miss: 1 });
  assert.equal(j.accuracyBp, 5250);
});

test('uma música inteira jogada no tempo termina com nota S', () => {
  const song = compose(WORDS, { size: 'short', complexity: 'hard', seed: 99, track: SWING });
  const j = new Judge(song.notes, song.stepSec);
  for (const n of song.notes) {
    j.press(n.char, n.time);
    if (n.hold) j.release(n.char, n.end);
  }
  j.update(song.duration + 1);
  assert.equal(j.counts.perfect, song.notes.length);
  assert.equal(j.letter, 'S');
  assert.ok(j.fullCombo);
  assert.equal(j.holdsFull, song.notes.filter((n) => n.hold > 0).length);
});
