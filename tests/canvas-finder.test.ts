import test from 'node:test';
import assert from 'node:assert/strict';

import { baseName, firstLine, parseCanvas, withContent } from '../src/canvas.ts';
import { rank, score, snippet } from '../src/search.ts';

const canvas = JSON.stringify({
  nodes: [
    { id: 'a', type: 'text', text: '# Launch plan\nShip on Friday' },
    { id: 'b', type: 'file', file: 'Projects/Budget 2026.md' },
    { id: 'c', type: 'link', url: 'https://example.com/pricing' },
    { id: 'd', type: 'group', label: 'Risks' },
    { id: 'e', type: 'weird' },
    { type: 'text', text: 'no id' },
  ],
  edges: [],
});

test('parseCanvas reads every node kind and skips bad ones', () => {
  const e = parseCanvas(canvas);
  assert.deepEqual(e.map((x) => [x.id, x.kind, x.title]), [
    ['a', 'text', 'Launch plan'],
    ['b', 'file', 'Budget 2026'],
    ['c', 'link', 'https://example.com/pricing'],
    ['d', 'group', 'Risks'],
  ]);
  assert.equal(e[1].file, 'Projects/Budget 2026.md');
});

test('parseCanvas survives invalid input', () => {
  assert.deepEqual(parseCanvas('not json'), []);
  assert.deepEqual(parseCanvas('{}'), []);
  assert.deepEqual(parseCanvas('{"nodes":5}'), []);
});

test('firstLine strips markup and shortens', () => {
  assert.equal(firstLine('\n\n## Title here'), 'Title here');
  assert.equal(firstLine('x'.repeat(100), 10), 'xxxxxxxxx…');
  assert.equal(firstLine(''), '');
});

test('baseName drops folders and .md', () => {
  assert.equal(baseName('a/b/Note.md'), 'Note');
  assert.equal(baseName('img.png'), 'img.png');
});

test('score needs every word and prefers word starts', () => {
  assert.equal(score('zzz', 'launch plan'), null);
  assert.equal(score('launch zzz', 'launch plan'), null);
  assert.ok(score('plan', 'launch plan')! > score('lan', 'launch plan')!);
  assert.ok(score('lpn', 'launch plan') !== null);
  assert.equal(score('', 'anything'), 0);
});

test('short scattered queries do not match by accident', () => {
  assert.equal(score('lz', 'launch plan'), null);
});

test('rank orders title matches first and finds body text', () => {
  const entries = parseCanvas(canvas);
  assert.equal(rank(entries, 'budget')[0].entry.id, 'b');
  assert.equal(rank(entries, 'friday')[0].entry.id, 'a');
  assert.deepEqual(rank(entries, 'nothing here at all'), []);
  assert.equal(rank(entries, '').length, 4);
});

test('withContent makes file text searchable', () => {
  const [, file] = parseCanvas(canvas);
  assert.equal(rank([file], 'forecast').length, 0);
  assert.equal(rank([withContent(file, 'Revenue forecast')], 'forecast').length, 1);
});

test('snippet centres on the match', () => {
  const s = snippet('a'.repeat(100) + ' needle ' + 'b'.repeat(100), 'needle', 10);
  assert.ok(s.includes('needle') && s.startsWith('…') && s.endsWith('…'));
  assert.equal(snippet('short text', 'zzz'), 'short text');
});

test('scattered letters do not match inside long text', () => {
  const long = `${'A hidden harbour with a treasure map. '.repeat(10)}Lantern oil is scarce.`;
  assert.equal(score('beta', long), null);
  assert.equal(score('beta', 'A hidden harbour with a treasure map. Lantern oil is scarce.'), null);
  assert.notEqual(score('beta', 'Ship the beta in March'), null);
  assert.notEqual(score('archve', 'Archive'), null);
});
