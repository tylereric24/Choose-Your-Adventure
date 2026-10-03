// Local persistence: progress, in-progress runs, unlock tokens, settings.
// Everything is wrapped so private browsing or blocked storage degrades to in-memory play.
const KEY = 'badchoices:v1';

function blank() {
  return { stories: {}, unlocks: [], settings: { speed: 'normal' } };
}

let data = blank();
try {
  const raw = localStorage.getItem(KEY);
  if (raw) data = { ...blank(), ...JSON.parse(raw) };
} catch {
  // storage unavailable or corrupt: start fresh in memory
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // ignore: progress just won't persist
  }
}

function story(id) {
  return (data.stories[id] ??= { endings: {}, run: null, plays: 0 });
}

export const store = {
  progress: (id) => story(id),

  saveRun(id, run) {
    story(id).run = run;
    save();
  },

  // Returns true if this ending is new.
  recordEnding(id, endingId) {
    const s = story(id);
    s.run = null;
    s.plays += 1;
    const isNew = !s.endings[endingId];
    if (isNew) s.endings[endingId] = Date.now();
    save();
    return isNew;
  },

  // Unlock codes are opaque to the client; the server verifies them on every premium fetch.
  tokens: () => data.unlocks.map((u) => u.token),
  unlocks: () => [...data.unlocks],
  addUnlock(token, grants, label) {
    if (!data.unlocks.some((u) => u.token === token)) data.unlocks.push({ token, grants, label });
    save();
  },
  owns(storyId) {
    return data.unlocks.some((u) => u.grants.includes('*') || u.grants.includes(storyId));
  },

  settings: () => data.settings,
  setSetting(key, value) {
    data.settings[key] = value;
    save();
  },

  resetProgress() {
    const { unlocks, settings } = data;
    data = { ...blank(), unlocks, settings };
    save();
  },
};
