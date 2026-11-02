const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDOM, load, storageMock, card, waitFor } = require('./helpers.cjs');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const folded = (element) => element.getAttribute('data-zhf-hidden') === 'true';

async function setup(t, { settings, engineFactory, url } = {}) {
  const dom = makeDOM('', url);
  const { window } = dom;
  const api = load(window);
  const browser = storageMock(api.normalizeSettings(settings ?? { keywords: ['饭圈'] }));
  const store = new api.SettingsStore(browser);
  const controller = new api.FeedController({ window, store, engine: engineFactory?.(api) });
  t.after(() => { controller.stop(); window.close(); });
  await controller.start();
  const add = (title, summary, id) => {
    const element = card(window.document, title, summary, id);
    window.document.body.append(element);
    return element;
  };
  return { window, api, store, controller, add };
}

test('matching cards disappear entirely without placeholders and keep their original DOM', async (t) => {
  const { window, add, controller } = await setup(t);
  const hit = add('饭圈有什么新闻');
  const keep = add('摄影入门');
  const originalChildren = [...hit.childNodes];
  await waitFor(() => folded(hit));
  assert.equal(folded(keep), false);
  assert.equal(window.getComputedStyle(hit).display, 'none');
  assert.equal(hit.querySelector('[data-zhf-ui]'), null);
  assert.deepEqual([...hit.childNodes], originalChildren);
  assert.equal(controller.status().blocked, 1);
});

test('saved scope, removed keywords and disabling apply to already-loaded cards', async (t) => {
  const { add, store } = await setup(t);
  const hit = add('摄影新闻', '里面提到饭圈');
  await delay(80);
  assert.equal(folded(hit), false);
  await store.save({ keywords: ['饭圈'], scope: 'title-summary' });
  await waitFor(() => folded(hit));
  await store.save({ keywords: [] });
  await waitFor(() => !hit.hasAttribute('data-zhf-hidden'));
  assert.equal(hit.querySelector('[data-zhf-ui]'), null);
  await store.save({ keywords: ['摄影'] });
  await waitFor(() => folded(hit));
  await store.save({ keywords: ['摄影'], enabled: false });
  await waitFor(() => !hit.hasAttribute('data-zhf-hidden'));
});

test('late title text, metadata updates and recycled card content get re-evaluated', async (t) => {
  const { window, add } = await setup(t);
  const item = add('');
  await delay(60);
  item.querySelector('a').textContent = '饭圈讨论';
  await waitFor(() => folded(item));
  item.querySelector('a').firstChild.data = '数学讨论';
  await waitFor(() => !folded(item));
  const meta = window.document.createElement('meta');
  meta.setAttribute('itemprop', 'name');
  meta.setAttribute('content', '饭圈新闻');
  item.querySelector('h2').append(meta);
  await waitFor(() => folded(item));
  meta.setAttribute('content', '数学新闻');
  await waitFor(() => !folded(item));
});

test('SPA route changes restore cards and reapply when returning to recommendations', async (t) => {
  const { window, add, controller } = await setup(t);
  const hit = add('饭圈');
  await waitFor(() => folded(hit));
  window.history.pushState({}, '', '/question/123');
  await waitFor(() => !folded(hit));
  assert.equal(controller.status().active, false);
  window.history.pushState({}, '', '/');
  await waitFor(() => folded(hit));
});

test('hot/search/follow and answer cards are outside the MVP scope', async (t) => {
  const { window, add } = await setup(t, { url: 'https://www.zhihu.com/hot' });
  const recommendation = add('饭圈');
  const answer = card(window.document, '饭圈');
  answer.className = 'Card AnswerCard';
  window.document.body.append(answer);
  await delay(80);
  assert.equal(folded(recommendation), false);
  assert.equal(folded(answer), false);
});

test('deleted cards release state without an observer loop', async (t) => {
  const { add, controller } = await setup(t);
  const item = add('饭圈');
  await waitFor(() => folded(item));
  await delay(100);
  assert.equal(controller.pending.size, 0);
  item.remove();
  await waitFor(() => controller.states.size === 0);
  assert.equal(controller.renderer.entries.size, 0);
});

test('stale async classification cannot hide a recycled card', async (t) => {
  const pending = [];
  const { add } = await setup(t, {
    engineFactory: (api) => new api.FilterEngine([{
      id: 'fake-llm', evaluate(post) { return new Promise((resolve) => pending.push({ post, resolve })); }
    }])
  });
  const item = add('旧标题');
  await waitFor(() => pending.length === 1);
  item.querySelector('a').textContent = '新标题';
  await waitFor(() => pending.length === 2);
  pending[1].resolve({ action: 'abstain' });
  pending[0].resolve({ action: 'block', reason: 'old content' });
  await delay(80);
  assert.equal(folded(item), false);
});

test('settings changes cancel a pending classifier and prevent late hiding', async (t) => {
  let resolve;
  const { add, store } = await setup(t, {
    engineFactory: (api) => new api.FilterEngine([{
      id: 'fake-llm', evaluate() { return new Promise((done) => { resolve = done; }); }
    }])
  });
  const item = add('测试');
  await waitFor(() => resolve);
  await store.save({ enabled: false, keywords: ['测试'] });
  resolve({ action: 'block' });
  await delay(80);
  assert.equal(folded(item), false);
});

test('HTML-like keywords are literal text and do not inject markup', async (t) => {
  const { window, add } = await setup(t, { settings: { keywords: ['<img src=x onerror=alert(1)>'] } });
  const item = add('<img src=x onerror=alert(1)>');
  await waitFor(() => folded(item));
  assert.equal(item.querySelector('[data-zhf-ui]'), null);
  assert.equal(window.document.querySelector('img'), null);
});

test('a batch larger than one frame is fully processed', async (t) => {
  const { add, controller } = await setup(t);
  for (let i = 0; i < 120; i++) add(`饭圈 ${i}`, '', String(i));
  await waitFor(() => controller.status().blocked === 120);
  assert.equal(controller.pending.size, 0);
});

test('image-only ads and sidebar banners hide without titles or keyword rules', async (t) => {
  const { window, controller } = await setup(t, { settings: { keywords: [] } });
  const ad = window.document.createElement('div');
  ad.className = 'TopstoryItem TopstoryItem--advertCard';
  const banner = window.document.createElement('div');
  banner.className = 'Card Banner';
  window.document.body.append(ad, banner);
  await waitFor(() => folded(ad) && folded(banner));
  assert.equal(window.getComputedStyle(ad).display, 'none');
  assert.equal(controller.status().blocked, 2);
});

test('nested ad markers hide the outer card once; changing or removing flags restores it', async (t) => {
  const { window, add, controller } = await setup(t, { settings: { keywords: [] } });
  const main = window.document.createElement('main');
  main.className = 'Topstory-mainColumn';
  window.document.body.append(main);
  const item = add('新产品');
  main.append(item);
  const flag = item.querySelector('.ContentItem');
  flag.setAttribute('data-za-detail-view-path-is_ad', '0');
  await delay(70);
  assert.equal(folded(item), false);
  flag.setAttribute('data-za-detail-view-path-is_ad', '1');
  await waitFor(() => folded(item));
  assert.equal(folded(flag), false);
  assert.equal(controller.status().detected, 1);
  flag.removeAttribute('data-za-detail-view-path-is_ad');
  await waitFor(() => !folded(item));
});

test('ordinary mentions of ads or salt novels in title and summary are preserved', async (t) => {
  const { window, add } = await setup(t, { settings: { keywords: [] } });
  const item = add('盐选小说为什么有广告？', '这是关于盐选小说和广告的讨论');
  const span = window.document.createElement('span');
  span.textContent = '盐选小说';
  item.querySelector('.RichContent-inner').append(span);
  await delay(80);
  assert.equal(folded(item), false);
});

test('novel badges hide cards, while paid nonfiction and non-salt fiction stay visible', async (t) => {
  const { window, add } = await setup(t, { settings: { keywords: [] } });
  const badge = (item, text, className = '') => {
    const element = window.document.createElement('span');
    element.textContent = text;
    element.className = className;
    item.append(element);
    return element;
  };
  const story = add('故事一');
  const brand = badge(story, '盐言故事');
  const paidStory = add('故事二');
  badge(paidStory, '盐选专栏', 'KfeCollection-AnswerTopCard-newContainer');
  badge(paidStory, '包含虚构创作', 'AnswerItem-status');
  const knowledge = add('天文学知识');
  badge(knowledge, '盐选专栏', 'KfeCollection-PurchaseBtn');
  const freeFiction = add('免费创作');
  badge(freeFiction, '包含虚构创作', 'AnswerItem-status');
  await waitFor(() => folded(story) && folded(paidStory));
  assert.equal(folded(knowledge), false);
  assert.equal(folded(freeFiction), false);
  brand.remove();
  await waitFor(() => !folded(story));
});

test('ad and fiction switches independently restore their cards; master switch restores all', async (t) => {
  const { window, add, store } = await setup(t);
  const ad = add('促销');
  ad.classList.add('TopstoryItem--advertCard');
  const story = add('故事');
  const label = window.document.createElement('span');
  label.textContent = '盐选小说';
  story.append(label);
  const keyword = add('饭圈');
  await waitFor(() => folded(ad) && folded(story) && folded(keyword));
  await store.save({ keywords: ['饭圈'], blockAds: false, blockYanxuanFiction: true });
  await waitFor(() => !folded(ad) && folded(story) && folded(keyword));
  await store.save({ keywords: ['饭圈'], blockAds: true, blockYanxuanFiction: false });
  await waitFor(() => folded(ad) && !folded(story) && folded(keyword));
  await store.save({ enabled: false });
  await waitFor(() => !folded(ad) && !folded(story) && !folded(keyword));
});
