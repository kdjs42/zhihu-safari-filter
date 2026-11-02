const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDOM, load, storageMock, card, waitFor } = require('./helpers.cjs');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function setup(t, count = 0, settings = {}) {
  const dom = makeDOM('<main class="Topstory-mainColumn"><div id="feed"></div></main>');
  t.after(() => dom.window.close());
  const { window } = dom, api = load(window), root = window.document.querySelector('#feed');
  for (let i = 0; i < count; i++) root.append(card(window.document, `饭圈 ${i}`, '', String(i)));
  const adapter = new api.ZhihuAdapter();
  const store = new api.SettingsStore(storageMock(api.normalizeSettings({ keywords: ['饭圈'], ...settings })));
  const controller = new api.FeedController({ window, adapter, store });
  t.after(() => controller.stop());
  await controller.start();
  if (count) await waitFor(() => controller.renderer.entries.size === count);
  return { window, api, adapter, store, controller, root };
}

test('500 old cards are not reread on append, unrelated changes or popup polling', async t => {
  const { window, adapter, controller, root } = await setup(t, 500);
  let reads = 0, scans = 0;
  const extract = adapter.extract.bind(adapter), collect = adapter.collect.bind(adapter);
  adapter.extract = (...args) => { reads++; return extract(...args); };
  adapter.collect = (...args) => { scans++; return collect(...args); };
  const extra = card(window.document, '新技术');
  root.append(extra);
  await waitFor(() => controller.states.get(extra)?.result);
  assert.equal(reads, 1);
  const aside = window.document.createElement('aside');
  window.document.body.append(aside);
  await delay(60);
  assert.equal(reads, 1);
  const scansBeforeStatus = scans;
  for (let i = 0; i < 100; i++) assert.equal(controller.status().detected, 501);
  assert.equal(scans, scansBeforeStatus);
  assert.equal(reads, 1);
  console.log('500-card regression: append = 1 extraction; unrelated append = 0; 100 status polls = 0 scans.');
});

test('removing a whole feed subtree releases state; moving a flagged card does not double-count it', async t => {
  const { window, controller, root } = await setup(t, 4);
  const item = root.firstElementChild;
  item.querySelector('.ContentItem').setAttribute('data-za-detail-view-path-is_ad', '1');
  const another = window.document.createElement('div');root.parentElement.append(another);
  another.append(item);
  await delay(80);
  assert.equal(controller.status().detected, 4);
  root.parentElement.remove();
  await waitFor(() => controller.status().detected === 0);
  assert.equal(controller.states.size, 0);
  assert.equal(controller.renderer.entries.size, 0);
});

test('card losing its selector is restored, and gaining it is classified again', async t => {
  const { controller, root } = await setup(t, 1);
  const item = root.firstElementChild;
  item.className = 'Card AnswerCard';
  await waitFor(() => !item.hasAttribute('data-zhf-hidden'));
  assert.equal(controller.status().detected, 0);
  item.className = 'Card TopstoryItem TopstoryItem-isRecommend';
  await waitFor(() => item.hasAttribute('data-zhf-hidden'));
});

test('title-only local rules do not read summary; custom filters still receive it', async t => {
  const { window, api, adapter, root, controller, store } = await setup(t);
  const item = card(window.document, '技术', '给未来模型的摘要');
  const text = item.querySelector('.RichContent-inner');
  Object.defineProperty(text, 'textContent', { get() { throw Error('unnecessary summary read'); } });
  root.append(item);
  await waitFor(() => controller.states.get(item)?.result);
  assert.equal(controller.states.get(item).result.action, 'abstain');
  await store.save({ enabled: false });
  let extracts = 0; adapter.extract = () => { extracts++; throw Error('disabled'); };
  item.querySelector('a').textContent = '变动';
  await delay(60);
  assert.equal(extracts, 0);
  const normal = card(window.document, '技术', '给未来模型的摘要');
  const engine = new api.FilterEngine([{ id: 'semantic', evaluate: post => ({ action: 'block', reason: post.summary }) }]);
  const post = new api.ZhihuAdapter().extract(normal, api.normalizeSettings(), engine.requiresFullPost);
  assert.equal((await engine.evaluate(post, api.normalizeSettings())).reason, '给未来模型的摘要');
});

test('mutation just before an async result resolves cannot apply the old decision', async t => {
  const { window, api, root, controller } = await setup(t);
  let finish;
  controller.engine = new api.FilterEngine([{ id: 'semantic', evaluate() { return new Promise(resolve => { finish = resolve; }); } }]);
  const item = card(window.document, '旧标题');root.append(item);
  await waitFor(() => finish);
  item.querySelector('a').textContent = '新标题';
  finish({ action: 'block' });
  await delay(10);
  assert.equal(item.hasAttribute('data-zhf-hidden'), false);
});
