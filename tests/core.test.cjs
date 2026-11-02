const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDOM, load, storageMock } = require('./helpers.cjs');

function setup(t) {
  const dom = makeDOM();
  t.after(() => dom.window.close());
  return load(dom.window);
}

test('keywords normalize width, case, whitespace; remove blank and duplicate rules', (t) => {
  const api = setup(t);
  assert.equal(JSON.stringify(api.parseKeywords(' ＡＩ \nAI\n\n饭圈\n 饭圈 \nC++\n')),
    JSON.stringify(['ai', '饭圈', 'c++']));
  assert.equal(api.normalizeSettings(null).scope, 'title');
});

test('literal keywords do not act as regex; scope excludes author and unrelated fields', async (t) => {
  const api = setup(t);
  const filter = new api.KeywordFilter();
  const settings = api.normalizeSettings({ keywords: ['C++', '[a-z]', '饭圈'] });
  assert.equal((await filter.evaluate({ title: 'C++ 入门' }, settings)).action, 'block');
  assert.equal((await filter.evaluate({ title: 'abc', author: '饭圈' }, settings)).action, 'abstain');
  assert.equal((await filter.evaluate({ title: '摄影', summary: '饭圈' }, settings)).action, 'abstain');
  settings.scope = 'title-summary';
  assert.equal((await filter.evaluate({ title: '摄影', summary: '饭圈' }, settings)).field, 'summary');
});

test('a keyword miss reaches an async filter; explicit allow and block short-circuit', async (t) => {
  const api = setup(t);
  let calls = 0;
  const later = { id: 'semantic', async evaluate() { calls++; return { action: 'block', reason: 'semantic hit' }; } };
  const settings = api.normalizeSettings({ keywords: ['饭圈'] });
  const engine = new api.FilterEngine([new api.KeywordFilter(), later]);
  assert.equal((await engine.evaluate({ title: '摄影' }, settings)).filterId, 'semantic');
  assert.equal(calls, 1);
  assert.equal((await engine.evaluate({ title: '饭圈' }, settings)).filterId, 'keyword');
  assert.equal(calls, 1);
  const whitelist = new api.FilterEngine([{ id: 'allow', async evaluate() { return { action: 'allow' }; } }, later]);
  assert.equal((await whitelist.evaluate({}, settings)).action, 'allow');
  assert.equal(calls, 1);
});

test('filter failures, malformed output and timeout fail open; cancellation resolves promptly', async (t) => {
  const api = setup(t);
  const settings = api.normalizeSettings();
  const engine = new api.FilterEngine([
    { id: 'throws', evaluate() { throw new Error('offline'); } },
    { id: 'malformed', evaluate() { return { action: 'deleteEverything' }; } },
    { id: 'hang', evaluate() { return new Promise(() => {}); } }
  ], { timeoutMs: 15 });
  assert.equal((await engine.evaluate({}, settings)).action, 'abstain');
  const abort = new AbortController();
  const slow = new api.FilterEngine([{ id: 'hang', evaluate() { return new Promise(() => {}); } }]);
  const pending = slow.evaluate({}, settings, abort.signal);
  abort.abort();
  assert.equal((await pending).action, 'abstain');
});

test('storage persists normalized rules and broadcasts changes across consumers', async (t) => {
  const api = setup(t);
  const browser = storageMock();
  const a = new api.SettingsStore(browser);
  const b = new api.SettingsStore(browser);
  let latest;
  const off = b.subscribe((settings) => { latest = settings; });
  await a.save({ keywords: ' ＡＩ\nai\n', enabled: false });
  assert.equal(latest.enabled, false);
  assert.equal(JSON.stringify((await b.load()).keywords), '["ai"]');
  off();
});

test('v1 rules survive migration and new filters default on while respecting explicit false', (t) => {
  const api = setup(t);
  const migrated = api.normalizeSettings({ schemaVersion: 1, keywords: ['饭圈'], enabled: false });
  assert.equal(migrated.schemaVersion, 3);
  assert.equal(migrated.autoRefill, true);
  assert.equal(api.normalizeSettings({ autoRefill: false }).autoRefill, false);
  assert.equal(JSON.stringify(migrated.keywords), '["饭圈"]');
  assert.equal(migrated.enabled, false);
  assert.equal(migrated.blockAds, true);
  assert.equal(migrated.blockYanxuanFiction, true);
  const disabled = api.normalizeSettings({ blockAds: false, blockYanxuanFiction: false });
  assert.equal(disabled.blockAds, false);
  assert.equal(disabled.blockYanxuanFiction, false);
});
