/* Test-only adapter and storage; never packaged in the extension. */
(() => {
  const api = globalThis.ZhihuFilter;
  const listeners = new Set();
  let saved = api.normalizeSettings({ keywords: ['饭圈'] });
  let controller;
  globalThis.browser = {
    storage: {
      local: {
        async get() { return { zhihuFilterSettings: saved }; },
        async set(value) {
          saved = value.zhihuFilterSettings;
          for (const fn of listeners) fn({ zhihuFilterSettings: { newValue: saved } }, 'local');
        }
      },
      onChanged: { addListener: (fn) => listeners.add(fn), removeListener: (fn) => listeners.delete(fn) }
    },
    tabs: { async query() { return [{ id: 1 }]; }, async sendMessage(_id, message) {
      if (message?.type === "zhf:refill") controller.refill.resume();
      return controller.status();
    } }
  };
  const adapter = new api.ZhihuAdapter();
  adapter.isActive = () => true;
  const store = new api.SettingsStore();
  controller = new api.FeedController({ window, store, adapter });
  let id = 0;
  function add(title, summary = '这是一条用于本地验证的合成推荐，不代表真实知乎内容。') {
    const card = document.createElement('article');
    card.className = 'Card TopstoryItem TopstoryItem-isRecommend';
    const content = document.createElement('div');
    content.className = 'ContentItem';
    const heading = document.createElement('h2');
    heading.className = 'ContentItem-title';
    heading.textContent = title;
    const text = document.createElement('div');
    text.className = 'RichContent-inner';
    text.textContent = summary;
    content.append(heading, text);
    card.append(content);
    card.id = `demo-${++id}`;
    document.getElementById('feed').append(card);
    return card;
  }
  document.getElementById('add-card').addEventListener('click', () => add(`饭圈推荐 · 动态加载 ${id}`));
  const waitFor = async (condition) => {
    const start = Date.now();
    while (!condition()) {
      if (Date.now() - start > 3000) throw new Error('页面行为未在预期时间内完成');
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
  };
  async function smoke() {
    await controller.start();
    const hit = add('饭圈话题：这条推荐应该被隐藏');
    const keep = add('如何拍出好看的星空照片？');
    add('一篇关于推荐算法的讨论', '这里的摘要提到了饭圈。切换为“标题＋摘要”后，这条也会被隐藏。');
    const ad = add('广告卡片：关闭广告过滤后可见');
    ad.classList.add('TopstoryItem--advertCard');
    const fiction = add('小说卡片：关闭盐选小说过滤后可见');
    const label = document.createElement('span');
    label.textContent = '盐言故事';
    fiction.append(label);
    const nonfiction = add('盐选天文学知识：这条应该保留');
    const paid = document.createElement('div');
    paid.className = 'KfeCollection-AnswerTopCard-newContainer';
    paid.textContent = '盐选专栏';
    nonfiction.append(paid);
    await waitFor(() => [hit, ad, fiction].every((item) => item.getAttribute('data-zhf-hidden') === 'true'));
    if (getComputedStyle(hit).display !== 'none') throw new Error('整卡隐藏 CSS 未生效');
    if (hit.querySelector('[data-zhf-ui]')) throw new Error('不应留下占位块');
    if (keep.hasAttribute('data-zhf-hidden') || nonfiction.hasAttribute('data-zhf-hidden')) throw new Error('误过滤');
    await store.save({ keywords: [] });
    await waitFor(() => !hit.hasAttribute('data-zhf-hidden'));
    await store.save({ keywords: ['饭圈'], blockAds: false, blockYanxuanFiction: false });
    await waitFor(() => !ad.hasAttribute('data-zhf-hidden') && !fiction.hasAttribute('data-zhf-hidden'));
    await store.save({ keywords: ['饭圈'] });
    await waitFor(() => [hit, ad, fiction].every((item) => item.getAttribute('data-zhf-hidden') === 'true'));
    document.getElementById('smoke-status').textContent = 'Safari 页面自检通过：整卡隐藏无占位、广告过滤、盐选小说过滤、保留盐选知识、关闭规则后恢复。可继续在左侧试用。';
    document.documentElement.dataset.smoke = 'passed';
  }
  smoke().catch((error) => {
    document.getElementById('smoke-status').textContent = `自检失败：${error.message}`;
    document.documentElement.dataset.smoke = 'failed';
  });
})();
