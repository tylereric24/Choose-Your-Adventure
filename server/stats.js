// Aggregate choice and ending counts ("37% of players chose this"), persisted to a JSON file.
// Every increment is validated against the story graph, so clients can't grow the file with junk keys.
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export class Stats {
  constructor(file, stories) {
    this.file = file;
    this.stories = stories;
    this.choices = {};
    this.endings = {};
    this.timer = null;
    try {
      const saved = JSON.parse(readFileSync(file, 'utf8'));
      this.choices = saved.choices ?? {};
      this.endings = saved.endings ?? {};
    } catch {
      // first run, or unreadable file: start fresh
    }
  }

  recordChoice(storyId, nodeId, index) {
    const node = this.stories.get(storyId)?.nodes[nodeId];
    if (!node?.choices || !Number.isInteger(index) || index < 0 || index >= node.choices.length) return null;
    const key = `${storyId}/${nodeId}`;
    const counts = (this.choices[key] ??= new Array(node.choices.length).fill(0));
    counts[index] = (counts[index] ?? 0) + 1;
    this.save();
    return counts;
  }

  recordEnding(storyId, endingId) {
    const story = this.stories.get(storyId);
    if (!story || !Object.values(story.nodes).some((n) => n.ending?.id === endingId)) return null;
    const counts = (this.endings[storyId] ??= {});
    counts[endingId] = (counts[endingId] ?? 0) + 1;
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    this.save();
    return { count: counts[endingId], total };
  }

  save() {
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), 2000);
    this.timer.unref?.();
  }

  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify({ choices: this.choices, endings: this.endings }));
    renameSync(tmp, this.file);
  }
}
