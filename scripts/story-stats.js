// Prints play-length metrics for every story. See scripts/metrics.js for the model.
import { loadStories } from '../server/stories.js';
import { measure } from './metrics.js';

const pct = (x) => `${(x * 100).toFixed(1)}%`;
for (const story of loadStories().values()) {
  const m = measure(story);
  console.log(`\n${story.title}${story.premium ? ' (premium)' : ''}`);
  console.log(`  content         ${m.nodes} nodes, ${m.endings} endings, ${m.words} words (${m.readAllMinutes.toFixed(0)} min to read everything once)`);
  console.log(`  run length      decisions p10/p50/p90 = ${m.decisions.p10}/${m.decisions.p50}/${m.decisions.p90}, mean ${m.decisions.mean.toFixed(1)}`);
  console.log(`  per run         ~${m.wordsPerRun.mean.toFixed(0)} words, ~${m.minutesPerRun.toFixed(1)} min`);
  console.log(`  victory         shortest path ${m.shortestVictory} decisions; ${pct(m.randomVictoryRate)} of random-choice runs win`);
  console.log(`  early deaths    ${pct(m.earlyDeathRate)} of runs die within 3 decisions`);
  console.log(`  shortest paths  ${Object.entries(m.shortest).sort((a, b) => a[1] - b[1]).map(([k, v]) => `${k}:${v}`).join(' ')}`);
}
