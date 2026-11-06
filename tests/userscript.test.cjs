const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeDOM, card, load, waitFor, root } = require('./helpers.cjs');
const { build } = require('../scripts/build-userscript.cjs');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function mount(t, initial = { keywords: ['饭圈'] }, shared) {
  const dom = makeDOM();
  const { window } = dom;
  let shadow;
  const attach = window.Element.prototype.attachShadow;
  window.Element.prototype.attachShadow = function(options) {
    const result = attach.call(this, options);
    if (this.id === 'zhihu-filter-userscript') shadow = result;
    return result;
  };
  // jsdom doesn't implement dialog's native modal UI; Safari smoke covers it.
  window.HTMLDialogElement.prototype.showModal = function() { this.open = true; };
  window.HTMLDialogElement.prototype.close = function() { this.open = false; this.dispatchEvent(new window.Event('close')); };
  const data = shared || { value: initial, fail: false };
  window.GM = {
    async getValue() { return data.value; },
    async setValue(key, value) { if (data.fail) throw Error('storage unavailable');data.value = JSON.parse(JSON.stringify(value)); }
  };
  const item = card(window.document, '饭圈动态');window.document.body.append(item);
  window.eval(build().source);
  t.after(() => { window.dispatchEvent(new window.Event('pagehide'));window.close(); });
  const get = id => shadow.getElementById(id);
  const open = async () => { get('launcher').click();await waitFor(() => !get('fields').disabled); };
  const save = () => get('settings').dispatchEvent(new window.Event('submit', { cancelable: true }));
  return { window, shadow, get, item, data, open, save };
}

test('bundled userscript filters, persists settings across reloads and isolates its namespace', async t => {
  const a = mount(t);
  await waitFor(() => a.item.hasAttribute('data-zhf-hidden'));
  assert.equal(a.window.ZhihuFilter, undefined);
  assert.equal(a.window.document.getElementById('zhihu-filter-userscript').shadowRoot, null);
  await a.open();a.get('keywords').value = ' ＡＩ\nai\n饭圈';a.get('block-fiction').checked = false;a.save();
  await waitFor(() => a.get('message').textContent.includes('已保存'));
  assert.deepEqual(a.data.value.keywords, ['ai', '饭圈']);
  assert.equal(a.data.value.blockYanxuanFiction, false);
  const b = mount(t, undefined, a.data);await b.open();
  assert.equal(b.get('keywords').value, 'ai\n饭圈');assert.equal(b.get('block-fiction').checked, false);
  a.get('enabled').checked = false;a.save();
  await waitFor(() => !a.item.hasAttribute('data-zhf-hidden'));
  b.window.dispatchEvent(new b.window.Event('focus'));
  await waitFor(() => !b.item.hasAttribute('data-zhf-hidden'));
});

test('export/import roundtrips settings without applying until save, and rejects malformed backups', async t => {
  const app = mount(t);await app.open();
  app.get('export-settings').click();const backup = app.get('backup').value;
  assert.deepEqual(JSON.parse(backup).keywords, ['饭圈']);
  app.get('backup').value = '{"keywords":["<img src=x onerror=alert(1)>","摄影"],"enabled":false}';
  app.get('import-settings').click();
  assert.deepEqual(app.data.value.keywords, ['饭圈']);
  assert.equal(app.shadow.querySelector('img'), null);
  app.save();await waitFor(() => app.get('message').textContent.includes('已保存'));
  assert.equal(app.data.value.enabled, false);
  app.get('backup').value = '{"keywords":42}';app.get('import-settings').click();
  assert.match(app.get('message').textContent, /格式不正确/);
  assert.equal(app.get('keywords').value, '<img src=x onerror=alert(1)>\n摄影');
});

test('failed save keeps stored rules and active filtering', async t => {
  const app = mount(t);await app.open();await waitFor(() => app.item.hasAttribute('data-zhf-hidden'));
  app.data.fail = true;app.get('enabled').checked = false;app.save();
  await waitFor(() => app.get('message').textContent.includes('保存失败'));
  assert.equal(app.item.hasAttribute('data-zhf-hidden'), true);
  assert.deepEqual(app.data.value.keywords, ['饭圈']);
});

test('duplicate injection and back-forward cache restore do not duplicate the UI', async t => {
  const app = mount(t);await waitFor(() => app.item.hasAttribute('data-zhf-hidden'));
  app.window.eval(build().source);
  assert.equal(app.window.document.querySelectorAll('#zhihu-filter-userscript').length, 1);
  app.window.dispatchEvent(new app.window.PageTransitionEvent('pagehide', { persisted: true }));
  assert.equal(app.item.hasAttribute('data-zhf-hidden'), false);
  app.window.dispatchEvent(new app.window.PageTransitionEvent('pageshow', { persisted: true }));
  await waitFor(() => app.item.hasAttribute('data-zhf-hidden'));
});

test('stale GM reads cannot undo a successful save', async t => {
  const dom = makeDOM();t.after(() => dom.window.close());
  const api = load(dom.window, ['core/settings.js']);
  dom.window.eval(fs.readFileSync(path.join(root, 'userscript/settings-store.js'), 'utf8'));
  let finish;const store = new api.UserscriptSettingsStore({ getValue: () => new Promise(resolve => { finish = resolve; }), async setValue() {} }, dom.window);
  let latest;store.subscribe(value => { latest = value; });
  const pending = store.load();await store.save({ keywords: ['新词'] });finish({ keywords: ['旧词'] });
  await pending;assert.equal(latest.keywords.join(','), '新词');
});

test('only matching pages filter and a missing GM API does not create a broken panel', async t => {
  const app = mount(t);await waitFor(() => app.item.hasAttribute('data-zhf-hidden'));
  app.window.history.pushState({}, '', '/question/123');await waitFor(() => !app.item.hasAttribute('data-zhf-hidden'));
  const dom = makeDOM();t.after(() => dom.window.close());dom.window.console.warn = () => {};
  dom.window.eval(build().source);
  assert.equal(dom.window.document.querySelector('#zhihu-filter-userscript'), null);
});
