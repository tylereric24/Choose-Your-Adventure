import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  startRun,
  choose,
  rewind,
  rewindToChapter,
  chapterOf,
  inventory,
  choicesFor,
  endingOf,
  validateStory,
  isValidState,
} from '../public/js/engine.js';
import { loadStories } from '../server/stories.js';

const tiny = () => ({
  id: 'tiny',
  title: 'Tiny',
  start: 'a',
  nodes: {
    a: {
      text: 'Start',
      choices: [
        { label: 'get key', to: 'b', if: ['!key'] },
        { label: 'open door', to: 'win', if: ['key'] },
        { label: 'die', to: 'dead' },
      ],
    },
    b: { text: 'Key room', set: ['key'], choices: [{ label: 'back', to: 'a' }] },
    win: { text: 'Won', ending: { id: 'win', title: 'Win', kind: 'victory' } },
    dead: { text: 'Dead', ending: { id: 'dead', title: 'Dead', kind: 'death' } },
  },
});

test('flags gate choices and node entry sets flags', () => {
  const s = tiny();
  let run = startRun(s);
  assert.deepEqual(choicesFor(s, run).map((c) => c.label), ['get key', 'die']);
  run = choose(s, run, 0);
  assert.deepEqual(run.flags, ['key']);
  run = choose(s, run, 0);
  assert.deepEqual(choicesFor(s, run).map((c) => c.label), ['open door', 'die']);
  run = choose(s, run, 1);
  assert.equal(endingOf(s, run).id, 'win');
});

test('choice indexes are stable (original position, not filtered position)', () => {
  const s = tiny();
  const run = startRun(s);
  assert.deepEqual(choicesFor(s, run).map((c) => c.index), [0, 2]);
});

test('unavailable choices throw', () => {
  const s = tiny();
  assert.throws(() => choose(s, startRun(s), 1), /not available/);
  assert.throws(() => choose(s, startRun(s), 9), /not available/);
});

test('rewind restores node and flags', () => {
  const s = tiny();
  const r0 = startRun(s);
  const r2 = choose(s, choose(s, r0, 0), 0);
  const back = rewind(rewind(r2));
  assert.equal(back.node, 'a');
  assert.deepEqual(back.flags, []);
  assert.equal(back.history.length, 0);
  assert.equal(rewind(back), back);
});

test('chapters act as checkpoints', () => {
  const s = tiny();
  s.nodes.b.chapter = 'Chapter 2';
  let run = choose(s, startRun(s), 0); // -> b (chapter 2), gets key
  run = choose(s, run, 0); // -> a
  run = choose(s, run, 2); // -> dead
  assert.equal(chapterOf(s, run), 'Chapter 2');
  const back = rewindToChapter(s, run);
  assert.equal(back.node, 'b');
  assert.deepEqual(back.flags, ['key']);
  // No checkpoint in history: falls back to a fresh run.
  assert.equal(rewindToChapter(s, choose(s, startRun(s), 2)).node, 'a');
});

test('inventory lists only flags declared as items', () => {
  const s = tiny();
  s.items = { key: 'Brass key' };
  const run = choose(s, startRun(s), 0);
  assert.deepEqual(inventory(s, { ...run, flags: [...run.flags, 'hidden'] }), [{ id: 'key', name: 'Brass key' }]);
});

test('isValidState rejects stale saves', () => {
  const s = tiny();
  assert.ok(isValidState(s, startRun(s)));
  assert.ok(!isValidState(s, { node: 'gone', flags: [], history: [] }));
  assert.ok(!isValidState(s, null));
});

test('validator accepts a sound story', () => {
  assert.deepEqual(validateStory(tiny()).errors, []);
});

test('validator catches broken links', () => {
  const s = tiny();
  s.nodes.a.choices[2].to = 'nowhere';
  assert.match(validateStory(s).errors.join('\n'), /does not exist/);
});

test('validator catches unreachable nodes and endings', () => {
  const s = tiny();
  s.nodes.orphan = { text: 'x', ending: { id: 'orphan', title: 'O', kind: 'strange' } };
  const errors = validateStory(s).errors.join('\n');
  assert.match(errors, /node "orphan" is unreachable/);
  assert.match(errors, /ending "orphan" is unreachable/);
});

test('validator catches flag dead-ends', () => {
  const s = tiny();
  s.nodes.a.choices = [{ label: 'locked', to: 'win', if: ['never'] }];
  assert.match(validateStory(s).errors.join('\n'), /gets stuck/);
});

test('validator catches inescapable loops', () => {
  const s = tiny();
  s.nodes.b.choices = [{ label: 'loop', to: 'loop' }];
  s.nodes.loop = { text: 'loop', choices: [{ label: 'again', to: 'b' }] };
  assert.match(validateStory(s).errors.join('\n'), /can never reach an ending/);
});

test('validator catches duplicate ending ids and bad kinds', () => {
  const s = tiny();
  s.nodes.dead.ending.id = 'win';
  s.nodes.win.ending.kind = 'meh';
  const errors = validateStory(s).errors.join('\n');
  assert.match(errors, /duplicate ending id/);
  assert.match(errors, /kind must be/);
});

test('all shipped stories validate', () => {
  for (const story of loadStories().values()) {
    assert.deepEqual(validateStory(story).errors, [], story.id);
  }
});
