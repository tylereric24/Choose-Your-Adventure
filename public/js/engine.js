// Story engine. Pure functions, no DOM, shared by the browser, the server and the tests.
//
// A story is a graph of nodes. Non-ending nodes have choices; ending nodes have an `ending`.
// Choices can be gated on flags (`if: ["rope", "!map"]`) and can set or clear flags
// (`set: ["rope", "!map"]`). Nodes can also set flags on entry.

export const ENDING_KINDS = ['death', 'victory', 'strange'];
const FLAG_RE = /^!?[a-z0-9_-]+$/;
const MAX_HISTORY = 200;

function holds(flags, expr) {
  const negated = expr.startsWith('!');
  const name = negated ? expr.slice(1) : expr;
  return flags.includes(name) !== negated;
}

function applySet(flags, list = []) {
  const out = new Set(flags);
  for (const expr of list) {
    if (expr.startsWith('!')) out.delete(expr.slice(1));
    else out.add(expr);
  }
  return [...out].sort();
}

function choiceOpen(choice, flags) {
  return (choice.if ?? []).every((expr) => holds(flags, expr));
}

export function startRun(story) {
  const node = story.nodes[story.start];
  return { node: story.start, flags: applySet([], node.set), history: [] };
}

export function currentNode(story, state) {
  return story.nodes[state.node];
}

export function endingOf(story, state) {
  return currentNode(story, state)?.ending ?? null;
}

// Available choices, each tagged with its index in node.choices (stable across runs for stats).
export function choicesFor(story, state) {
  const node = currentNode(story, state);
  if (!node || node.ending) return [];
  return (node.choices ?? [])
    .map((choice, index) => ({ ...choice, index }))
    .filter((choice) => choiceOpen(choice, state.flags));
}

export function choose(story, state, index) {
  const node = currentNode(story, state);
  const choice = node?.choices?.[index];
  if (!choice || !choiceOpen(choice, state.flags)) {
    throw new Error(`Choice ${index} is not available at node "${state.node}"`);
  }
  const target = story.nodes[choice.to];
  const flags = applySet(applySet(state.flags, choice.set), target.set);
  const history = [...state.history, { node: state.node, flags: state.flags }].slice(-MAX_HISTORY);
  return { node: choice.to, flags, history };
}

export function rewind(state) {
  if (!state.history.length) return state;
  const prev = state.history[state.history.length - 1];
  return { node: prev.node, flags: prev.flags, history: state.history.slice(0, -1) };
}

// True if a saved state still makes sense against the (possibly updated) story.
export function isValidState(story, state) {
  return (
    !!state &&
    typeof state.node === 'string' &&
    !!story.nodes[state.node] &&
    Array.isArray(state.flags) &&
    Array.isArray(state.history) &&
    state.history.every((h) => h && story.nodes[h.node] && Array.isArray(h.flags))
  );
}

export function listEndings(story) {
  return Object.entries(story.nodes)
    .filter(([, node]) => node.ending)
    .map(([nodeId, node]) => ({ nodeId, ...node.ending }));
}

// Structural checks plus an exhaustive walk of the (node, flags) state space.
// Catches broken links, dead ends, unreachable content, unreachable endings,
// and loops a player can get trapped in with no route to any ending.
export function validateStory(story, { maxStates = 50000 } = {}) {
  const errors = [];
  const err = (msg) => errors.push(msg);

  for (const key of ['id', 'title', 'start']) {
    if (typeof story[key] !== 'string' || !story[key]) err(`missing story.${key}`);
  }
  if (!story.nodes || typeof story.nodes !== 'object') {
    err('missing story.nodes');
    return { errors, stats: null };
  }
  if (!story.nodes[story.start]) err(`start node "${story.start}" does not exist`);

  const endingIds = new Set();
  for (const [id, node] of Object.entries(story.nodes)) {
    if (typeof node.text !== 'string' || !node.text.trim()) err(`${id}: missing text`);
    for (const f of node.set ?? []) if (!FLAG_RE.test(f)) err(`${id}: bad flag "${f}"`);
    if (node.ending) {
      if (node.choices?.length) err(`${id}: ending node must not have choices`);
      const { id: eid, title, kind } = node.ending;
      if (!eid || !title) err(`${id}: ending needs id and title`);
      if (!ENDING_KINDS.includes(kind)) err(`${id}: ending kind must be one of ${ENDING_KINDS}`);
      if (endingIds.has(eid)) err(`${id}: duplicate ending id "${eid}"`);
      endingIds.add(eid);
      continue;
    }
    if (!node.choices?.length) err(`${id}: non-ending node has no choices`);
    for (const [i, c] of (node.choices ?? []).entries()) {
      if (!c.label) err(`${id}[${i}]: missing label`);
      if (!story.nodes[c.to]) err(`${id}[${i}]: target "${c.to}" does not exist`);
      for (const f of [...(c.if ?? []), ...(c.set ?? [])]) {
        if (!FLAG_RE.test(f)) err(`${id}[${i}]: bad flag "${f}"`);
      }
    }
  }
  if (errors.length) return { errors, stats: null };

  // Forward BFS over states.
  const key = (s) => `${s.node}|${s.flags.join(',')}`;
  const start = startRun(story);
  const seen = new Map([[key(start), start]]);
  const edges = new Map();
  const queue = [start];
  const visitedNodes = new Set();
  const reachedEndings = new Set();
  const terminal = [];

  while (queue.length) {
    const state = queue.shift();
    const k = key(state);
    visitedNodes.add(state.node);
    const ending = endingOf(story, state);
    if (ending) {
      reachedEndings.add(ending.id);
      terminal.push(k);
      continue;
    }
    const open = choicesFor(story, state);
    if (!open.length) {
      err(`player gets stuck at "${state.node}" with flags [${state.flags}]`);
      continue;
    }
    const next = [];
    for (const c of open) {
      const s = choose(story, { ...state, history: [] }, c.index);
      s.history = [];
      const sk = key(s);
      next.push(sk);
      if (!seen.has(sk)) {
        if (seen.size >= maxStates) {
          err(`state space exceeds ${maxStates}; too many flags?`);
          return { errors, stats: null };
        }
        seen.set(sk, s);
        queue.push(s);
      }
    }
    edges.set(k, next);
  }

  for (const id of Object.keys(story.nodes)) {
    if (!visitedNodes.has(id)) err(`node "${id}" is unreachable`);
  }
  for (const eid of endingIds) {
    if (!reachedEndings.has(eid)) err(`ending "${eid}" is unreachable`);
  }

  // Reverse reachability: every reachable state must be able to reach some ending.
  const reverse = new Map();
  for (const [from, tos] of edges) {
    for (const to of tos) {
      if (!reverse.has(to)) reverse.set(to, []);
      reverse.get(to).push(from);
    }
  }
  const canFinish = new Set(terminal);
  const back = [...terminal];
  while (back.length) {
    for (const prev of reverse.get(back.pop()) ?? []) {
      if (!canFinish.has(prev)) {
        canFinish.add(prev);
        back.push(prev);
      }
    }
  }
  for (const k of seen.keys()) {
    if (!canFinish.has(k)) err(`state "${k}" can never reach an ending`);
  }

  return {
    errors,
    stats: {
      nodes: Object.keys(story.nodes).length,
      endings: endingIds.size,
      states: seen.size,
    },
  };
}
