const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { root, load, storageMock, waitFor } = require('./helpers.cjs');

test('popup loads, saves normalized rules, persists toggles and handles unavailable tabs', async (t) => {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'extension/popup/popup.html'), 'utf8'), {
    url: 'https://extension.test/popup.html', runScripts: 'outside-only'
  });
  t.after(() => dom.window.close());
  dom.window.browser = storageMock();
  load(dom.window, ['core/settings.js', 'platform/settings-store.js', 'popup/popup.js']);
  const document = dom.window.document;
  await waitFor(() => !document.getElementById('fields').disabled);
  document.getElementById('keywords').value = ' ＡＩ\nai\n饭圈';
  document.getElementById('enabled').checked = false;
  assert.equal(document.getElementById('block-ads').checked, true);
  assert.equal(document.getElementById('block-fiction').checked, true);
  document.getElementById('block-ads').checked = false;
  assert.equal(document.getElementById('auto-refill').checked, true);
  document.getElementById('auto-refill').checked = false;
  document.getElementById('scope').value = 'title-summary';
  document.getElementById('settings').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
  await waitFor(() => document.getElementById('message').textContent.includes('已保存'));
  const saved = (await dom.window.browser.storage.local.get()).zhihuFilterSettings;
  assert.equal(JSON.stringify(saved.keywords), '["ai","饭圈"]');
  assert.equal(saved.enabled, false);
  assert.equal(saved.blockAds, false);
  assert.equal(saved.autoRefill, false);
  assert.equal(saved.blockYanxuanFiction, true);
  assert.equal(saved.scope, 'title-summary');
  assert.equal(document.getElementById('count').textContent, '2 个');
  assert.match(document.getElementById('page-status').textContent, /请打开知乎首页/);
});
