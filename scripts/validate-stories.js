// Validates every story in content/stories. Exits non-zero on any error.
import { loadStories } from '../server/stories.js';
import { validateStory } from '../public/js/engine.js';

let failed = false;
for (const story of loadStories().values()) {
  const { errors, stats } = validateStory(story);
  if (errors.length) {
    failed = true;
    console.error(`FAIL ${story.id}`);
    for (const e of errors) console.error(`  - ${e}`);
  } else {
    console.log(`ok   ${story.id}: ${stats.nodes} nodes, ${stats.endings} endings, ${stats.states} reachable states`);
  }
}
process.exit(failed ? 1 : 0);
