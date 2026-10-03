import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const STORY_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'content', 'stories');

export function loadStories(dir = STORY_DIR) {
  const stories = new Map();
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    const story = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    if (stories.has(story.id)) throw new Error(`duplicate story id "${story.id}" in ${file}`);
    stories.set(story.id, story);
  }
  return stories;
}

// Public metadata only: never includes node content, so premium stories can be listed safely.
export function storySummary(story) {
  const endings = Object.values(story.nodes).filter((n) => n.ending).length;
  return {
    id: story.id,
    title: story.title,
    tagline: story.tagline,
    description: story.description,
    premium: !!story.premium,
    order: story.order ?? 99,
    accent: story.accent,
    art: story.art,
    sequel: story.sequel,
    endings,
  };
}
