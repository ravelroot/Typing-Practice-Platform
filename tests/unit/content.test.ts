import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  COMPLEXITIES,
  KINDS,
  Rng,
  SIZES,
  formatInt,
  formatMoney,
  generate,
  normalizeCustom,
  stripAccents,
  type ContentData,
  type Kind,
} from '../../web/src/content.ts';

const textos = JSON.parse(readFileSync(new URL('../../web/data/textos.json', import.meta.url), 'utf8'));
const palavras = JSON.parse(readFileSync(new URL('../../web/data/palavras.json', import.meta.url), 'utf8'));
const data: ContentData = { phrases: textos.phrases, words: palavras };
const generated = KINDS.filter((k): k is Exclude<Kind, 'custom'> => k !== 'custom');

test('o gerador pseudoaleatório é determinístico e cobre o intervalo', () => {
  const a = new Rng(42);
  const b = new Rng(42);
  const seen = new Set<number>();
  for (let i = 0; i < 2000; i++) {
    const x = a.int(10);
    assert.equal(x, b.int(10));
    assert.ok(x >= 0 && x < 10);
    seen.add(x);
  }
  assert.equal(seen.size, 10);
  assert.deepEqual(
    [new Rng(1).next(), new Rng(0).next(), new Rng(0xffffffff).next()],
    [new Rng(1).next(), new Rng(0).next(), new Rng(0xffffffff).next()],
  );
});

test('embaralhar mantém os mesmos elementos', () => {
  const list = 'abcdefghijklmnopqrstuvwxyz'.split('');
  const out = new Rng(7).shuffle(list);
  assert.equal(out.length, 26);
  assert.deepEqual([...out].sort(), list);
  assert.notDeepEqual(out, list);
});

test('a mesma semente gera o mesmo conteúdo em todos os tipos, tamanhos e complexidades', () => {
  for (const kind of generated) {
    for (const size of SIZES) {
      for (const complexity of COMPLEXITIES) {
        for (const seed of [0, 1, 123456, 0xffffffff]) {
          const a = generate(data, { kind, size, complexity, seed });
          const b = generate(data, { kind, size, complexity, seed });
          assert.equal(a.text, b.text);
          assert.ok(a.text.length > 0, `${kind}/${size}/${complexity}`);
          assert.equal(a.text, a.text.trim());
          assert.ok(!a.text.includes('  '), `${kind} com espaço duplo`);
        }
      }
    }
  }
});

test('tamanhos maiores geram conteúdos maiores', () => {
  for (const kind of generated) {
    for (const complexity of COMPLEXITIES) {
      const avg = (size: (typeof SIZES)[number]) => {
        let sum = 0;
        for (let seed = 1; seed <= 60; seed++) sum += Array.from(generate(data, { kind, size, complexity, seed }).text).length;
        return sum / 60;
      };
      const s = avg('short');
      const m = avg('medium');
      const l = avg('long');
      assert.ok(s < m && m < l, `${kind}/${complexity}: ${s} ${m} ${l}`);
    }
  }
});

test('textos vêm do acervo e respeitam tamanho e complexidade', () => {
  const ids = new Set<string>();
  for (let seed = 0; seed < 4000; seed++) {
    const g = generate(data, { kind: 'text', size: 'medium', complexity: 'hard', seed });
    const p = data.phrases.find((x) => x.id === g.phraseId);
    assert.ok(p);
    assert.equal(p.size, 'medium');
    assert.equal(p.complexity, 'hard');
    assert.equal(p.text, g.text);
    ids.add(p.id);
  }
  assert.equal(ids.size, data.phrases.filter((p) => p.size === 'medium' && p.complexity === 'hard').length);
});

test('sem acentos usa a mesma frase, sem acento e sem cedilha', () => {
  for (let seed = 0; seed < 300; seed++) {
    const a = generate(data, { kind: 'text', size: 'long', complexity: 'medium', seed });
    const b = generate(data, { kind: 'no-accents', size: 'long', complexity: 'medium', seed });
    assert.equal(a.phraseId, b.phraseId);
    assert.equal(b.text, stripAccents(a.text));
    assert.doesNotMatch(b.text, /[áàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ]/);
  }
  assert.equal(stripAccents('Ação, órgão, pôr e à'), 'Acao, orgao, por e a');
});

test('alfabeto: em ordem, espaçado e embaralhado', () => {
  const az = 'abcdefghijklmnopqrstuvwxyz';
  assert.equal(generate(data, { kind: 'alphabet', size: 'short', complexity: 'easy', seed: 9 }).text, az);
  assert.equal(generate(data, { kind: 'alphabet', size: 'medium', complexity: 'easy', seed: 9 }).text, `${az} ${az}`);
  assert.equal(generate(data, { kind: 'alphabet', size: 'short', complexity: 'medium', seed: 9 }).text, az.split('').join(' '));
  const hard = generate(data, { kind: 'alphabet', size: 'long', complexity: 'hard', seed: 9 }).text.split(' ');
  assert.equal(hard.length, 3);
  for (const part of hard) assert.equal([...part].sort().join(''), az);
});

test('números, teclado numérico e dados só usam os caracteres esperados', () => {
  for (let seed = 0; seed < 400; seed++) {
    for (const complexity of COMPLEXITIES) {
      const numbers = generate(data, { kind: 'numbers', size: 'long', complexity, seed }).text;
      if (complexity === 'easy') assert.match(numbers, /^[0-9 ]+$/);
      else assert.match(numbers, /^[0-9 .,R$%+\-/h]+$/);
      const numpad = generate(data, { kind: 'numpad', size: 'long', complexity, seed }).text;
      assert.match(numpad, /^[0-9,+\-*/\n]+$/);
      assert.equal(numpad.split('\n').length, 30);
      const rows = generate(data, { kind: 'data', size: 'medium', complexity, seed }).text.split('\n');
      assert.ok(rows.every((r) => r.length > 10));
    }
  }
});

test('misto junta palavras, números, letras, onomatopeias e símbolos', () => {
  const sounds = new Set(data.words.sounds);
  let hasSound = 0;
  for (let seed = 0; seed < 200; seed++) {
    const easy = generate(data, { kind: 'mixed', size: 'long', complexity: 'easy', seed }).text;
    assert.match(easy, /\d/);
    assert.match(easy, /[a-z]/);
    assert.doesNotMatch(easy, /[!?@#&*()[\]{}<>"]/);
    if (easy.split(' ').some((t) => sounds.has(t))) hasSound++;
    const hard = generate(data, { kind: 'mixed', size: 'long', complexity: 'hard', seed }).text;
    assert.match(hard, /[^a-zA-Z0-9 áàâãéêíóôõúç-]/);
  }
  assert.ok(hasSound > 190);
  assert.equal(generate(data, { kind: 'mixed', size: 'short', complexity: 'medium', seed: 1 }).text.split(' ').length >= 12, true);
});

test('dados difíceis trazem contas que fecham', () => {
  for (let seed = 0; seed < 200; seed++) {
    const rows = generate(data, { kind: 'data', size: 'short', complexity: 'hard', seed }).text.split('\n');
    for (const row of rows) {
      const m = row.match(/(\d+) x R\$ ([\d.]+,\d\d) = R\$ ([\d.]+,\d\d)/);
      assert.ok(m, row);
      const cents = (s: string) => Number(s.replace(/\./g, '').replace(',', ''));
      assert.equal(Number(m[1]) * cents(m[2] as string), cents(m[3] as string));
      assert.match(row, /@exemplo\.com\.br$/);
    }
  }
});

test('formatação brasileira de números e valores', () => {
  assert.equal(formatInt(7), '7');
  assert.equal(formatInt(1000), '1.000');
  assert.equal(formatInt(1234567), '1.234.567');
  assert.equal(formatMoney(5), '0,05');
  assert.equal(formatMoney(124990), '1.249,90');
});

test('texto customizado é limpo sem perder acentos', () => {
  assert.equal(normalizeCustom('  “Olá”\t—  mundo…  \r\n\r\n\r\nção  '), '"Olá" - mundo...\nção');
  assert.equal(normalizeCustom('a\u200bb\u00a0c'), 'ab c');
  assert.equal(Array.from(normalizeCustom('é'.repeat(6000))).length, 6000);
  assert.equal(normalizeCustom(null), '');
});

test('tipos, tamanhos e complexidades inválidos são recusados', () => {
  assert.throws(() => generate(data, { kind: 'custom', size: 'short', complexity: 'easy', seed: 1 }));
  assert.throws(() => generate(data, { kind: 'x' as Kind, size: 'short', complexity: 'easy', seed: 1 }));
});
