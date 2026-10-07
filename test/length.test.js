// Content floors: a story that plays for one minute isn't worth shipping, let alone selling.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadStories } from '../server/stories.js';
import { measure } from '../scripts/metrics.js';

const FLOORS = {
  nodes: 60,
  endings: 15,
  words: 4000,
  medianDecisions: 6,
  shortestVictory: 15,
  maxEarlyDeathRate: 0.08,
};

const stories = [...loadStories().values()];
const metrics = new Map(stories.map((s) => [s.id, measure(s, { runs: 5000 })]));

for (const story of stories) {
  test(`${story.id} meets the length floors`, () => {
    const m = metrics.get(story.id);
    assert.ok(m.nodes >= FLOORS.nodes, `nodes ${m.nodes} < ${FLOORS.nodes}`);
    assert.ok(m.endings >= FLOORS.endings, `endings ${m.endings} < ${FLOORS.endings}`);
    assert.ok(m.words >= FLOORS.words, `words ${m.words} < ${FLOORS.words}`);
    assert.ok(m.decisions.p50 >= FLOORS.medianDecisions, `median run ${m.decisions.p50} decisions`);
    assert.ok(m.shortestVictory >= FLOORS.shortestVictory, `victory reachable in ${m.shortestVictory} decisions`);
    assert.ok(m.earlyDeathRate <= FLOORS.maxEarlyDeathRate, `early death rate ${m.earlyDeathRate}`);
  });
}

test('every paid story has more content than the free stories', () => {
  const freeMax = Math.max(...stories.filter((s) => !s.premium).map((s) => metrics.get(s.id).words));
  for (const s of stories.filter((s) => s.premium)) {
    assert.ok(metrics.get(s.id).words > freeMax, `${s.id} is shorter than a free story`);
  }
});
