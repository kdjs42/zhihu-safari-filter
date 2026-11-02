const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDOM, load, card, waitFor, storageMock } = require('./helpers.cjs');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function setup(t, { button = true } = {}) {
  const dom = makeDOM('<main class="Topstory-mainColumn"><div class="Topstory-recommend"><div class="List"><div id="items"></div><button>加载更多</button></div></div></main>');
  const { window } = dom, api = load(window), adapter = new api.ZhihuAdapter();
  const root = adapter.feedRoot(window.document), items = window.document.querySelector('#items');
  const control = root.querySelector('button');
  const state = { enabled: true, settled: true, blocked: 1, bottom: window.innerHeight * 2, clicks: 0 };
  root.getClientRects = control.getClientRects = () => [{}];
  root.getBoundingClientRect = () => ({ top: -100, bottom: state.bottom });
  window.scrollTo = () => { throw Error('must not move reading position'); };
  if (!button) control.remove();
  const refiller = new api.FeedRefiller({ window, adapter,
    enabled: () => state.enabled && adapter.isActive(window.location), settled: () => state.settled,
    cards: () => new Set(items.children), blocked: () => state.blocked,
    intervalMs: 8, timeoutMs: 35, debounceMs: 2 });
  t.after(() => { refiller.stop(); window.close(); });
  control.addEventListener('click', () => state.clicks++);
  const append = () => {
    const item = card(window.document, '饭圈'); items.append(item);
    refiller.noteCard(item); refiller.schedule();
  };
  refiller.start();
  return { window, api, adapter, root, items, control, state, refiller, append };
}

test('refill serializes loading and stops when two screens ahead are available', async t => {
  const { refiller, control, state, append } = setup(t);
  control.addEventListener('click', () => setTimeout(() => {
    state.bottom = 4000; append();
  }, 15));
  refiller.tick();refiller.tick();refiller.tick();
  assert.equal(state.clicks, 1);
  await waitFor(() => refiller.status === 'ready');
  assert.equal(state.clicks, 1);
});

test('all-filtered batches stop at five attempts; manual retry starts a bounded new round', async t => {
  const { refiller, control, state, append } = setup(t);
  control.addEventListener('click', () => setTimeout(append, 1));
  refiller.tick();
  await waitFor(() => refiller.status === 'limit');
  assert.equal(state.clicks, 5);
  await delay(40); assert.equal(state.clicks, 5);
  refiller.resume();
  await waitFor(() => state.clicks === 10 && refiller.status === 'limit');
});

test('no-progress timeout pauses; synthetic scroll cannot reset budget or request again', async t => {
  const { refiller, state, window } = setup(t);
  refiller.tick();
  await waitFor(() => refiller.status === 'no-progress');
  assert.equal(state.clicks, 1);
  window.dispatchEvent(new window.Event('scroll'));
  await delay(25); assert.equal(state.clicks, 1);
  refiller.resume();
  await waitFor(() => state.clicks === 2);
});

test('background, disabled, wrong route and unfinished filtering never initiate loading', t => {
  const { refiller, state, window } = setup(t);
  Object.defineProperty(window.document, 'hidden', { value: true, configurable: true });
  refiller.tick(); assert.equal(state.clicks, 0);
  Object.defineProperty(window.document, 'hidden', { value: false });
  state.enabled = false; refiller.tick(); assert.equal(state.clicks, 0);
  state.enabled = true; state.settled = false;refiller.tick();assert.equal(state.clicks, 0);
  state.settled = true;window.history.pushState({}, '', '/hot');refiller.tick();assert.equal(state.clicks, 0);
});

test('scroll fallback only notifies near the bottom and never scrolls the page', t => {
  const { refiller, state, window } = setup(t, { button: false });
  let notifications = 0;window.addEventListener('scroll', () => notifications++);
  refiller.tick();assert.equal(notifications, 0);assert.equal(refiller.status, 'waiting-scroll');
  state.bottom = window.innerHeight + 50;refiller.tick();assert.equal(notifications, 1);
  refiller.tick();assert.equal(notifications, 1);assert.equal(window.scrollY, 0);
});

test('page-owned loading, errors and end markers stop extra activations; answer buttons are ignored', t => {
  const { refiller, control, adapter, root, state } = setup(t);
  control.disabled = true; refiller.tick();assert.equal(state.clicks, 0);
  assert.equal(refiller.status, 'loading');
  refiller.reset();control.disabled = false; control.textContent = '没有更多内容了';refiller.tick();
  assert.equal(refiller.status, 'ended');assert.equal(state.clicks, 0);
  refiller.reset();control.textContent = '请求过于频繁';refiller.tick();
  assert.equal(refiller.status, 'error');assert.equal(state.clicks, 0);
  control.textContent = '加载更多';control.parentElement.classList.add('ContentItem');
  assert.equal(adapter.loadControl(root).button, undefined);
});

test('stopping cancels scheduled attempts and manual retry does not overlap an outstanding request', async t => {
  const { refiller, state } = setup(t);
  refiller.tick();refiller.resume();refiller.tick();assert.equal(state.clicks, 1);
  refiller.stop(); await delay(60);assert.equal(state.clicks, 1);
  assert.equal(refiller.timer, null);
});

test('controller integrates filtering, arrivals and refill without rescanning old cards', async t => {
  const { window, api, adapter, state, control, items, refiller } = setup(t);
  refiller.stop();
  const store = new api.SettingsStore(storageMock(api.normalizeSettings({ keywords: ['饭圈'] })));
  const controller = new api.FeedController({ window, adapter, store });
  t.after(() => controller.stop());
  controller.refill.intervalMs = 10;controller.refill.debounceMs = 5;
  let reads = 0;const original = adapter.extract.bind(adapter);
  adapter.extract = (...args) => { reads++;return original(...args); };
  control.addEventListener('click', () => {
    items.append(card(window.document, '保留的推荐'));
    state.bottom = 4000;
  });
  items.append(card(window.document, '饭圈'));
  await controller.start();
  await waitFor(() => controller.status().detected === 2 && controller.refill.status === 'ready');
  assert.equal(state.clicks, 1);assert.equal(controller.status().blocked, 1);assert.equal(reads, 2);
});
