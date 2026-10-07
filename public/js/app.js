import {
  startRun,
  choose,
  rewind,
  rewindToChapter,
  chapterOf,
  inventory,
  choicesFor,
  currentNode,
  endingOf,
  listEndings,
  isValidState,
} from './engine.js';
import { store } from './store.js';
import { api } from './api.js';

const SPEEDS = { slow: 45, normal: 110, fast: 260, instant: 0 };
const KIND_LABEL = { death: 'Death', victory: 'Victory', strange: 'Strange' };
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const root = document.getElementById('app');
let catalog = null;
const storyCache = new Map();
let teardown = () => {};

// ---------- tiny DOM helper ----------

function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'vars') for (const [p, val] of Object.entries(v)) el.style.setProperty(p, val);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

function money(cents) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: catalog.currency }).format(cents / 100);
}

function toast(message) {
  const el = h('div', { class: 'toast', role: 'status' }, message);
  document.body.append(el);
  setTimeout(() => el.classList.add('out'), 2600);
  setTimeout(() => el.remove(), 3000);
}

function openModal(title, body) {
  const dialog = h(
    'dialog',
    { class: 'modal', 'aria-label': title },
    h(
      'header',
      null,
      h('h2', null, title),
      h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: () => dialog.close() }, '✕'),
    ),
    body,
  );
  dialog.addEventListener('close', () => dialog.remove());
  dialog.addEventListener('click', (e) => e.target === dialog && dialog.close());
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}

// ---------- data ----------

const summary = (id) => catalog.stories.find((s) => s.id === id);
const isLocked = (s) => s.premium && !store.owns(s.id);
const foundCount = (id) => Object.keys(store.progress(id).endings).length;

async function loadStory(id) {
  if (!storyCache.has(id)) storyCache.set(id, await api.story(id));
  return storyCache.get(id);
}

// ---------- chrome ----------

function topbar(...extra) {
  return h(
    'header',
    { class: 'topbar' },
    h('a', { class: 'brand', href: '#/' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, '⑂'), 'Bad Choices'),
    h(
      'nav',
      null,
      extra,
      catalog.payments && catalog.stories.some(isLocked)
        ? h('button', { class: 'btn btn-small btn-accent', onclick: openStore }, 'Store')
        : null,
      h('button', { class: 'icon-btn', 'aria-label': 'Settings', onclick: openSettings }, '⚙'),
    ),
  );
}

// ---------- library ----------

function storyCard(s) {
  const progress = store.progress(s.id);
  const found = foundCount(s.id);
  const locked = isLocked(s);
  const pct = s.endings ? Math.round((found / s.endings) * 100) : 0;
  const cheapest = catalog.products
    .filter((p) => p.grants.includes(s.id) || p.grants.includes('*'))
    .sort((a, b) => a.price - b.price)[0];

  let action;
  if (locked) {
    action = h(
      'button',
      { class: 'btn btn-accent', onclick: () => openStore(s.id) },
      cheapest && catalog.payments ? `Unlock · ${money(cheapest.price)}` : 'Coming soon',
    );
  } else {
    const label = progress.run ? 'Continue' : found ? 'Play again' : 'Play';
    action = h('a', { class: 'btn btn-accent', href: `#/play/${s.id}` }, label);
  }

  return h(
    'article',
    { class: `card${locked ? ' locked' : ''}`, vars: { '--accent': s.accent ?? 'var(--gold)' } },
    h('div', { class: 'card-band', 'aria-hidden': 'true' }),
    h(
      'div',
      { class: 'card-body' },
      h(
        'div',
        { class: 'card-head' },
        h('h3', null, s.title),
        s.premium ? h('span', { class: `tag${locked ? '' : ' owned'}` }, locked ? 'Premium' : 'Owned') : h('span', { class: 'tag free' }, 'Free'),
      ),
      h('p', { class: 'tagline' }, s.tagline),
      h('p', { class: 'desc' }, s.description),
      h(
        'div',
        { class: 'meter', role: 'img', 'aria-label': `${found} of ${s.endings} endings found` },
        h('div', { class: 'meter-fill', vars: { width: `${pct}%` } }),
      ),
      h('p', { class: 'meter-label' }, `${found} / ${s.endings} endings found`),
      h(
        'div',
        { class: 'card-actions' },
        action,
        !locked && found ? h('a', { class: 'btn btn-ghost', href: `#/endings/${s.id}` }, 'Endings') : null,
      ),
    ),
  );
}

function viewLibrary() {
  const anyLocked = catalog.stories.some(isLocked);
  const pass = catalog.products.find((p) => p.grants.includes('*'));
  return h(
    'div',
    { class: 'page' },
    topbar(),
    h(
      'section',
      { class: 'hero' },
      h('h1', null, 'Tiny adventures.', h('br'), 'Terrible decisions.'),
      h('p', null, 'Every choice branches. Most of them kill you. Collect every ending.'),
    ),
    h('section', { class: 'cards' }, catalog.stories.map(storyCard)),
    anyLocked && pass && catalog.payments
      ? h(
          'aside',
          { class: 'pass' },
          h('div', null, h('h3', null, pass.name), h('p', null, pass.description)),
          h('button', { class: 'btn btn-accent', onclick: () => buy(pass.id) }, money(pass.price)),
        )
      : null,
  );
}

// ---------- play ----------

function typewriter(container, paragraphs, cps, onDone) {
  const parts = paragraphs.map((text) => {
    const shown = h('span');
    const hidden = h('span', { class: 'untyped', 'aria-hidden': 'true' }, text);
    container.append(h('p', null, shown, hidden));
    return { text, shown, hidden };
  });
  const total = parts.reduce((n, p) => n + p.text.length, 0);
  let done = false;
  let raf = 0;
  const finish = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    for (const p of parts) {
      p.shown.textContent = p.text;
      p.hidden.textContent = '';
    }
    onDone();
  };
  if (!cps || reducedMotion) {
    finish();
    return { skip() {}, cancel() {}, isDone: () => true };
  }
  const start = performance.now();
  const frame = (now) => {
    let budget = Math.floor(((now - start) / 1000) * cps);
    if (budget >= total) return finish();
    for (const p of parts) {
      const n = Math.max(0, Math.min(p.text.length, budget));
      p.shown.textContent = p.text.slice(0, n);
      p.hidden.textContent = p.text.slice(n);
      budget -= p.text.length;
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return { skip: finish, cancel: () => cancelAnimationFrame(raf), isDone: () => done };
}

function shareEnding(story, ending) {
  const found = foundCount(story.id);
  const total = listEndings(story).length;
  const text = `I got the "${ending.title}" ending in ${story.title} (${found}/${total} endings found). Your move.`;
  const url = location.origin;
  if (navigator.share) {
    navigator.share({ title: 'Bad Choices', text, url }).catch(() => {});
  } else {
    navigator.clipboard
      ?.writeText(`${text} ${url}`)
      .then(() => toast('Copied to clipboard'))
      .catch(() => toast('Could not copy'));
  }
}

async function viewPlay(id) {
  const meta = summary(id);
  if (!meta) return viewMissing();
  if (isLocked(meta)) {
    location.hash = '#/';
    openStore(id);
    return null;
  }
  let story;
  try {
    story = await loadStory(id);
  } catch (e) {
    if (e.status === 402) {
      location.hash = '#/';
      openStore(id);
      return null;
    }
    throw e;
  }

  const saved = store.progress(id).run;
  let run = isValidState(story, saved) ? saved : startRun(story);
  let note = null; // line shown above the passage, e.g. choice stats
  let typing = null;
  let busy = false;

  const page = h('div', { class: 'page play', vars: { '--accent': story.accent ?? 'var(--gold)' } });

  function onKey(e) {
    if (e.target.closest?.('input, textarea, dialog') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (typing && !typing.isDone() && (e.key === ' ' || e.key === 'Enter')) {
      e.preventDefault();
      typing.skip();
      return;
    }
    if (/^[1-9]$/.test(e.key)) {
      const btn = page.querySelectorAll('.choices .choice')[Number(e.key) - 1];
      if (btn && typing?.isDone()) btn.click();
      else typing?.skip();
    } else if (e.key === 'Backspace' || e.key === 'u') {
      if (run.history.length) doRewind();
    }
  }
  document.addEventListener('keydown', onKey);
  page.cleanup = () => {
    document.removeEventListener('keydown', onKey);
    typing?.cancel();
  };

  function doRewind() {
    run = rewind(run);
    note = null;
    store.saveRun(id, run);
    draw(false);
  }

  function restart() {
    run = startRun(story);
    note = null;
    store.saveRun(id, run);
    draw(true);
  }

  function restartChapter() {
    run = rewindToChapter(story, run);
    note = null;
    store.saveRun(id, run);
    draw(true);
  }

  async function pick(choice) {
    if (busy) return;
    busy = true;
    const from = run.node;
    run = choose(story, run, choice.index);
    store.saveRun(id, run);
    const ending = endingOf(story, run);
    let isNew = false;
    if (ending) isNew = store.recordEnding(id, ending.id);
    note = h('p', { class: 'note' }, `You chose “${choice.label}”.`);
    draw(true, { isNew });
    busy = false;

    const noteEl = note;
    api.choiceStat(id, from, choice.index).then((r) => {
      if (!r) return;
      const sum = r.counts.reduce((a, b) => a + b, 0);
      if (sum < 10) return; // too few samples to be meaningful
      const pct = Math.round((r.counts[choice.index] / sum) * 100);
      noteEl.append(` ${pct}% of players did too.`);
    });
    if (ending) {
      api.endingStat(id, ending.id).then((r) => {
        const el = page.querySelector('.rarity');
        if (!r || !el || r.total < 20) return;
        const pct = (r.count / r.total) * 100;
        el.textContent = `${pct < 1 ? '<1' : Math.round(pct)}% of endings reached by players are this one.`;
      });
    }
  }

  function endingCard(ending, { isNew }) {
    const total = listEndings(story).length;
    const found = foundCount(id);
    const sequel = story.sequel && summary(story.sequel);
    const complete = found === total;
    return h(
      'section',
      { class: `ending ending-${ending.kind}`, 'aria-live': 'polite' },
      h('p', { class: 'ending-kind' }, KIND_LABEL[ending.kind]),
      h('h2', null, ending.title),
      h('p', { class: 'ending-status' }, isNew ? 'New ending discovered!' : 'You’ve found this one before.', ` ${found} / ${total} found.`),
      complete ? h('p', { class: 'complete' }, 'Every ending found. You absolute completionist.') : null,
      h('p', { class: 'rarity' }),
      h(
        'div',
        { class: 'ending-actions' },
        h('button', { class: 'btn', onclick: doRewind }, 'Undo last choice'),
        chapterOf(story, run) ? h('button', { class: 'btn', onclick: restartChapter }, 'Restart chapter') : null,
        h('button', { class: 'btn btn-accent', onclick: restart }, 'Play again'),
        h('a', { class: 'btn btn-ghost', href: `#/endings/${id}` }, 'All endings'),
        h('button', { class: 'btn btn-ghost', onclick: () => shareEnding(story, ending) }, 'Share'),
      ),
      sequel
        ? h(
            'div',
            { class: 'upsell', vars: { '--accent': sequel.accent ?? 'var(--gold)' } },
            h('p', { class: 'upsell-kicker' }, 'The story continues'),
            h('h3', null, sequel.title),
            h('p', null, sequel.tagline),
            isLocked(sequel)
              ? catalog.payments
                ? h('button', { class: 'btn btn-accent', onclick: () => openStore(sequel.id) }, 'Unlock the sequel')
                : null
              : h('a', { class: 'btn btn-accent', href: `#/play/${sequel.id}` }, 'Play the sequel'),
          )
        : null,
    );
  }

  function draw(animate, extra = {}) {
    typing?.cancel();
    const node = currentNode(story, run);
    const ending = node.ending;
    const passage = h('div', { class: 'passage', onclick: () => typing?.skip() });
    const choices = h(
      'div',
      { class: 'choices pending' },
      ending
        ? null
        : choicesFor(story, run).map((c, i) =>
            h(
              'button',
              { class: 'choice', onclick: () => pick(c) },
              h('span', { class: 'choice-key', 'aria-hidden': 'true' }, i + 1),
              h('span', null, c.label),
            ),
          ),
    );
    const showArt = story.art && run.node === story.start && !run.history.length;
    const prevFlags = run.history.at(-1)?.flags ?? [];
    const items = inventory(story, run);
    const bag = items.length
      ? h(
          'ul',
          { class: 'inventory', 'aria-label': 'Inventory' },
          items.map((it) => h('li', { class: prevFlags.includes(it.id) ? null : 'new' }, it.name)),
        )
      : null;

    page.replaceChildren(
      topbar(),
      h(
        'div',
        { class: 'play-bar' },
        h('a', { class: 'btn btn-ghost btn-small', href: '#/' }, '← Library'),
        h('span', { class: 'play-title' }, story.title),
        h(
          'span',
          { class: 'play-tools' },
          h('button', { class: 'btn btn-ghost btn-small', onclick: doRewind, disabled: !run.history.length, title: 'Undo (Backspace)' }, 'Undo'),
          h('button', { class: 'btn btn-ghost btn-small', onclick: restart, disabled: !run.history.length }, 'Restart'),
          h('a', { class: 'btn btn-ghost btn-small', href: `#/endings/${id}` }, `${foundCount(id)}/${listEndings(story).length}`),
        ),
      ),
      h(
        'main',
        { class: 'stage' },
        showArt ? h('pre', { class: 'art', 'aria-hidden': 'true' }, story.art) : null,
        note,
        node.chapter ? h('p', { class: 'chapter' }, node.chapter) : null,
        passage,
        ending ? null : bag,
        choices,
        h('div', { class: 'ending-slot' }),
      ),
    );

    const paragraphs = node.text.split(/\n\s*\n/);
    const cps = animate ? SPEEDS[store.settings().speed] ?? SPEEDS.normal : 0;
    if (animate && run.history.length) page.querySelector('.stage').scrollIntoView({ block: 'start' });
    typing = typewriter(passage, paragraphs, cps, () => {
      choices.classList.remove('pending');
      if (ending) page.querySelector('.ending-slot').replaceChildren(endingCard(ending, extra));
    });
  }

  draw(true);
  return page;
}

// ---------- endings gallery ----------

async function viewEndings(id) {
  const meta = summary(id);
  if (!meta) return viewMissing();
  if (isLocked(meta)) {
    location.hash = '#/';
    openStore(id);
    return null;
  }
  const story = await loadStory(id);
  const endings = listEndings(story);
  const found = store.progress(id).endings;
  const order = { victory: 0, strange: 1, death: 2 };
  endings.sort((a, b) => order[a.kind] - order[b.kind]);
  const count = endings.filter((e) => found[e.id]).length;

  return h(
    'div',
    { class: 'page', vars: { '--accent': story.accent ?? 'var(--gold)' } },
    topbar(),
    h(
      'div',
      { class: 'play-bar' },
      h('a', { class: 'btn btn-ghost btn-small', href: '#/' }, '← Library'),
      h('span', { class: 'play-title' }, story.title),
      h('a', { class: 'btn btn-accent btn-small', href: `#/play/${id}` }, store.progress(id).run ? 'Continue' : 'Play'),
    ),
    h(
      'main',
      { class: 'gallery' },
      h('h1', null, `${count} of ${endings.length} endings`),
      h('p', { class: 'muted' }, 'Undiscovered endings show only their type. That’s your hint.'),
      h(
        'ul',
        { class: 'ending-grid' },
        endings.map((e) =>
          h(
            'li',
            { class: `ending-tile ending-${e.kind}${found[e.id] ? '' : ' unknown'}` },
            h('span', { class: 'ending-kind' }, KIND_LABEL[e.kind]),
            h('strong', null, found[e.id] ? e.title : '???'),
            found[e.id] ? h('small', null, new Date(found[e.id]).toLocaleDateString()) : null,
          ),
        ),
      ),
    ),
  );
}

function viewMissing() {
  return h(
    'div',
    { class: 'page' },
    topbar(),
    h('main', { class: 'gallery' }, h('h1', null, 'Wrong door.'), h('p', null, 'That story doesn’t exist. ', h('a', { href: '#/' }, 'Back to the library.'))),
  );
}

// ---------- store & settings ----------

async function buy(productId) {
  try {
    const { url } = await api.checkout(productId);
    location.assign(url);
  } catch (e) {
    toast(`Checkout failed: ${e.message}`);
  }
}

function redeemForm(onDone) {
  const input = h('input', { type: 'text', placeholder: 'cya1.…', 'aria-label': 'Unlock code', autocomplete: 'off', spellcheck: 'false' });
  const form = h(
    'form',
    {
      class: 'redeem',
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          const { token, grants } = await api.redeem(input.value);
          store.addUnlock(token, grants, 'Restored code');
          toast('Unlocked!');
          onDone?.();
          render();
        } catch (err) {
          toast(err.message === 'invalid unlock code' ? 'That code isn’t valid.' : `Failed: ${err.message}`);
        }
      },
    },
    input,
    h('button', { class: 'btn', type: 'submit' }, 'Redeem'),
  );
  return form;
}

function openStore(highlightStory) {
  let dialog;
  const relevant = catalog.products.filter(
    (p) => !highlightStory || typeof highlightStory !== 'string' || p.grants.includes(highlightStory) || p.grants.includes('*'),
  );
  const body = h(
    'div',
    { class: 'store' },
    catalog.payments
      ? relevant.map((p) => {
          const owned = p.grants.every((g) => (g === '*' ? catalog.stories.every((s) => !isLocked(s)) : store.owns(g)));
          return h(
            'div',
            { class: 'product' },
            h('div', null, h('h3', null, p.name), h('p', null, p.description)),
            owned
              ? h('span', { class: 'tag owned' }, 'Owned')
              : h('button', { class: 'btn btn-accent', onclick: () => buy(p.id) }, money(p.price)),
          );
        })
      : h('p', null, 'Purchases aren’t open yet. Check back soon.'),
    h('p', { class: 'fine' }, 'One-time purchase. No account, no subscription, no ads. You’ll get an unlock code to restore on other devices.'),
    h('h3', { class: 'section-label' }, 'Have an unlock code?'),
    redeemForm(() => dialog.close()),
  );
  dialog = openModal('Store', body);
}

function openSettings() {
  const speed = store.settings().speed;
  const unlocks = store.unlocks();
  let dialog;
  const body = h(
    'div',
    { class: 'settings' },
    h(
      'fieldset',
      { class: 'segmented' },
      h('legend', null, 'Text speed'),
      Object.keys(SPEEDS).map((k) =>
        h(
          'label',
          null,
          h('input', {
            type: 'radio',
            name: 'speed',
            value: k,
            checked: k === speed,
            onchange: () => store.setSetting('speed', k),
          }),
          h('span', null, k[0].toUpperCase() + k.slice(1)),
        ),
      ),
    ),
    h('h3', { class: 'section-label' }, 'Unlock codes'),
    unlocks.length
      ? h(
          'ul',
          { class: 'codes' },
          unlocks.map((u) =>
            h(
              'li',
              null,
              h('span', null, u.label ?? 'Purchase'),
              h(
                'button',
                {
                  class: 'btn btn-small',
                  onclick: () =>
                    navigator.clipboard
                      ?.writeText(u.token)
                      .then(() => toast('Code copied. Keep it somewhere safe.'))
                      .catch(() => toast('Could not copy')),
                },
                'Copy code',
              ),
            ),
          ),
        )
      : h('p', { class: 'muted' }, 'No purchases on this device.'),
    redeemForm(() => dialog.close()),
    h('h3', { class: 'section-label' }, 'Danger zone'),
    h(
      'button',
      {
        class: 'btn btn-danger',
        onclick: () => {
          if (!confirm('Erase all endings and saved runs? Purchases are kept.')) return;
          store.resetProgress();
          dialog.close();
          render();
        },
      },
      'Reset progress',
    ),
  );
  dialog = openModal('Settings', body);
}

// ---------- checkout return ----------

async function handleCheckoutReturn() {
  const params = new URLSearchParams(location.search);
  const status = params.get('checkout');
  if (!status) return;
  history.replaceState(null, '', location.pathname + location.hash);
  if (status === 'cancel') return toast('Checkout cancelled.');
  const sessionId = params.get('session_id');
  if (!sessionId) return;
  try {
    const { token, grants, product } = await api.unlock(sessionId);
    store.addUnlock(token, grants, product);
    const target = grants.includes('*') ? null : grants[0];
    openModal(
      'Unlocked!',
      h(
        'div',
        { class: 'store' },
        h('p', null, `${product} is yours. Thanks for supporting indie fiction.`),
        h('p', { class: 'fine' }, 'Your unlock code is saved in Settings. Copy it somewhere safe to restore on another device.'),
        target ? h('a', { class: 'btn btn-accent', href: `#/play/${target}`, onclick: (e) => e.target.closest('dialog').close() }, 'Play now') : null,
      ),
    );
  } catch (e) {
    toast(`Couldn’t confirm purchase: ${e.message}`);
  }
}

// ---------- router ----------

let renderSeq = 0;
async function render() {
  const seq = ++renderSeq;
  teardown();
  teardown = () => {};
  const [, view, id] = location.hash.replace(/^#/, '').split('/');
  let page;
  try {
    if (view === 'play' && id) page = await viewPlay(id);
    else if (view === 'endings' && id) page = await viewEndings(id);
    else page = viewLibrary();
  } catch (e) {
    console.error(e);
    page = h('div', { class: 'page' }, topbar(), h('main', { class: 'gallery' }, h('h1', null, 'Something broke.'), h('p', null, e.message)));
  }
  if (seq !== renderSeq) return page?.cleanup?.();
  if (!page) return;
  teardown = page.cleanup ?? (() => {});
  root.replaceChildren(page);
  window.scrollTo(0, 0);
}

async function boot() {
  try {
    catalog = await api.catalog();
  } catch {
    root.replaceChildren(h('main', { class: 'gallery' }, h('h1', null, 'Can’t reach the server.'), h('p', null, 'Check your connection and reload.')));
    return;
  }
  await handleCheckoutReturn();
  window.addEventListener('hashchange', render);
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
}

boot();
