import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DocumentError, decodeEntities, detectKind, docxXmlText, extract, odtXmlText } from '../../web/src/documents.ts';
import { adaptForTyping, splitParts } from '../../web/src/content.ts';

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`../fixtures/${name}`, import.meta.url)));

const EXPECTED = [
  'Relatório da feira de ciências',
  'A turma do 8º ano apresentou três projetos na feira: um robô que separa lixo, uma horta vertical e um relógio de sol.',
  'Segundo a professora, "o mais importante foi a curiosidade" - e todos concordaram...',
  '- Robô separador',
  '- Horta vertical',
  '- Relógio de sol',
  'O público votou no robô, que ganhou o prêmio de inovação.',
  'Durante a tarde, mais de duzentas pessoas passaram pelo ginásio. As crianças menores ficaram encantadas com a horta, enquanto os adultos faziam perguntas sobre os sensores do robô e sobre o custo de cada peça usada na montagem do protótipo.',
];

for (const [file, kind] of [
  ['documento.docx', 'docx'],
  ['documento.doc', 'doc'],
  ['documento.odt', 'odt'],
  ['documento.pdf', 'pdf'],
  ['documento-compacto.pdf', 'pdf'],
] as const) {
  test(`${file}: texto e parágrafos adaptados para digitar`, async () => {
    const r = await extract(file, fixture(file));
    assert.equal(r.kind, kind);
    const lines = adaptForTyping(r.text).text.split('\n');
    const expected = kind === 'doc' || kind === 'odt' ? EXPECTED.map((l) => l.replace(/^- /, '')) : EXPECTED;
    assert.deepEqual(lines, expected);
  });
}

test('PDF do navegador (Skia) e PDF com fontes padrão sem ToUnicode', async () => {
  const web = await extract('navegador.pdf', fixture('navegador.pdf'));
  assert.equal(web.pages, 1);
  const text = adaptForTyping(web.text).text;
  assert.match(text, /^Relatório da feira\nA turma apresentou três projetos: um robô que separa lixo, uma horta vertical e um relógio de sol, montados com sucata e muita paciência\./);
  assert.match(text, /"Foi incrível" - disse a diretora\.\.\.$/);
  const std = await extract('fontes-padrao.pdf', fixture('fontes-padrao.pdf'));
  assert.equal(std.pages, 2);
  assert.match(std.text, /^Relatório da feira de ciências\n/);
  assert.match(std.text, /O público votou no robô, que ganhou o prêmio de inovação\./);
  assert.match(std.text, /\nSegunda página com ação, coração e informação\.$/);
});

test('TXT em Windows-1252 e em UTF-16 com BOM', async () => {
  const latin = await extract('a.txt', fixture('windows-1252.txt'));
  assert.equal(adaptForTyping(latin.text).text, 'Ação e emoção no coração do sertão.\nSegunda linha, com é e ô.');
  const utf16 = await extract('b.txt', fixture('utf-16.txt'));
  assert.equal(adaptForTyping(utf16.text).text, 'Olá, mundo! Pão de queijo.');
  const utf8 = await extract('c.md', new TextEncoder().encode('Olá\n\n\nmundo'));
  assert.equal(adaptForTyping(utf8.text).text, 'Olá\nmundo');
});

test('formatos desconhecidos, ZIP sem documento e PDF sem texto dão erro claro', async () => {
  await assert.rejects(extract('foto.png', Uint8Array.of(0x89, 0x50, 0x4e, 0x47)), DocumentError);
  await assert.rejects(extract('nada.docx', fixture('documento.odt').slice(0, 10)), DocumentError);
  const empty = new TextEncoder().encode('%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF');
  await assert.rejects(extract('vazio.pdf', empty), /não tem texto selecionável/);
  const locked = new TextEncoder().encode('%PDF-1.4\ntrailer << /Root 1 0 R /Encrypt 5 0 R >>\n%%EOF');
  await assert.rejects(extract('senha.pdf', locked), /protegido/);
});

test('detecção do formato pelo conteúdo, não só pela extensão', () => {
  assert.equal(detectKind('x.bin', new TextEncoder().encode('%PDF-1.7')), 'pdf');
  assert.equal(detectKind('x.docx', fixture('documento.docx')), 'docx');
  assert.equal(detectKind('x.odt', fixture('documento.odt')), 'odt');
  assert.equal(detectKind('x', fixture('documento.doc')), 'doc');
  assert.equal(detectKind('notas.txt', new TextEncoder().encode('oi')), 'txt');
  assert.equal(detectKind('x.exe', Uint8Array.of(0x4d, 0x5a)), null);
});

test('XML do Word e do ODT: tabs, quebras, listas, entidades e campos', () => {
  const docx =
    '<w:body><w:p><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr><w:r><w:t>Item &amp; &#233;</w:t></w:r></w:p>' +
    '<w:p><w:r><w:t xml:space="preserve">A</w:t><w:tab/><w:t>B</w:t><w:br/><w:t>C</w:t><w:noBreakHyphen/><w:t>D</w:t></w:r>' +
    '<w:r><w:instrText>PAGE</w:instrText></w:r><w:r><w:delText>apagado</w:delText></w:r></w:p></w:body>';
  assert.equal(docxXmlText(docx), '- Item & é\nA B\nC-D');
  const odt = '<text:h>Título</text:h><text:p>a<text:s text:c="3"/>b<text:tab/>c<text:line-break/>d<office:annotation><text:p>nota</text:p></office:annotation></text:p>';
  assert.equal(odtXmlText(odt), 'Título\na   b c\nd');
  assert.equal(decodeEntities('&lt;&gt;&quot;&apos;&#x41;&nbsp;'), `<>"'A&nbsp;`);
});

test('adaptação troca o que não existe no teclado e conta o que foi retirado', () => {
  const r = adaptForTyping('• Ligadura ﬁm × 2½ → ok © \u{1F600}中\nTra\u00adve\u200bssão\u00a0— fim');
  assert.equal(r.text, '- Ligadura fim x 21/2 -> ok (c)\nTravessão - fim');
  assert.equal(r.removed, 2);
  assert.equal(r.truncated, false);
  const big = adaptForTyping('a'.repeat(100_500));
  assert.equal(big.truncated, true);
  assert.equal(big.text.length, 100_000);
});

test('documentos longos viram partes que respeitam frases e parágrafos', () => {
  const sentence = 'Esta é uma frase de exemplo para treinar digitação com calma.';
  const text = Array.from({ length: 6 }, () => Array(5).fill(sentence).join(' ')).join('\n');
  for (const size of ['short', 'medium', 'long'] as const) {
    const parts = splitParts(text, size);
    assert.ok(parts.length > 1, size);
    assert.equal(parts.join(' ').replace(/\s+/g, ' '), text.replace(/\s+/g, ' '));
    for (const p of parts) assert.ok(p.endsWith('.'), `${size}: ${p.slice(-20)}`);
  }
  assert.ok(splitParts(text, 'short').length > splitParts(text, 'long').length);
  assert.deepEqual(splitParts('Curto.', 'medium'), ['Curto.']);
  assert.deepEqual(splitParts('   ', 'medium'), []);
  const giant = splitParts('palavra '.repeat(400), 'short');
  assert.ok(giant.every((p) => p.length <= 170));
});
