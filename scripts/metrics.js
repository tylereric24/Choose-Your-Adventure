// Measures how long a story actually plays: words, run length, and estimated minutes.
// Runs are simulated by a player picking uniformly at random among the open choices,
// a pessimistic stand-in for a first-time player who ignores every hint.
import { startRun, choose, choicesFor, endingOf, currentNode, listEndings } from '../public/js/engine.js';

export const WPM = 230; // typical adult reading speed for prose
const SECONDS_PER_DECISION = 4;

const words = (s) => s.split(/\s+/).filter(Boolean).length;
const quantile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length * p) / 100))];
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

function simulate(story, rng) {
  let run = startRun(story);
  let w = words(currentNode(story, run).text);
  let decisions = 0;
  while (!endingOf(story, run) && decisions < 500) {
    const open = choicesFor(story, run);
    run = choose(story, run, open[Math.floor(rng() * open.length)].index);
    w += words(currentNode(story, run).text);
    decisions++;
  }
  return { decisions, words: w, ending: endingOf(story, run) };
}

// Fewest decisions needed to reach each ending, over (node, flags) states.
function shortestPaths(story) {
  const key = (s) => `${s.node}|${s.flags}`;
  const start = startRun(story);
  const dist = new Map([[key(start), 0]]);
  const best = {};
  const queue = [start];
  while (queue.length) {
    const s = queue.shift();
    const d = dist.get(key(s));
    const e = endingOf(story, s);
    if (e) {
      best[e.id] ??= d;
      continue;
    }
    for (const c of choicesFor(story, s)) {
      const n = choose(story, { ...s, history: [] }, c.index);
      if (!dist.has(key(n))) {
        dist.set(key(n), d + 1);
        queue.push(n);
      }
    }
  }
  return best;
}

export function measure(story, { runs = 20000, seed = 42 } = {}) {
  let state = seed;
  const rng = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const sims = Array.from({ length: runs }, () => simulate(story, rng));
  const decisions = sims.map((r) => r.decisions).sort((a, b) => a - b);
  const runWords = sims.map((r) => r.words).sort((a, b) => a - b);
  const endings = listEndings(story);
  const shortest = shortestPaths(story);
  const totalWords = Object.values(story.nodes).reduce((n, node) => n + words(node.text), 0);
  const meanDecisions = mean(decisions);
  const meanWords = mean(runWords);
  return {
    nodes: Object.keys(story.nodes).length,
    endings: endings.length,
    words: totalWords,
    readAllMinutes: totalWords / WPM,
    decisions: { p10: quantile(decisions, 10), p50: quantile(decisions, 50), p90: quantile(decisions, 90), mean: meanDecisions },
    wordsPerRun: { p50: quantile(runWords, 50), mean: meanWords },
    minutesPerRun: meanWords / WPM + (meanDecisions * SECONDS_PER_DECISION) / 60,
    randomVictoryRate: sims.filter((r) => r.ending.kind === 'victory').length / runs,
    earlyDeathRate: sims.filter((r) => r.ending.kind === 'death' && r.decisions <= 3).length / runs,
    shortestVictory: Math.min(...endings.filter((e) => e.kind === 'victory').map((e) => shortest[e.id])),
    shortest,
  };
}
