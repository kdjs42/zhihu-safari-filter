const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const manifest = require('../extension/manifest.json');

function storageMock(initial) {
  let saved = initial;
  const listeners = new Set();
  return {
    storage: {
      local: {
        async get() { return { zhihuFilterSettings: saved }; },
        async set(value) {
          const oldValue = saved;
          saved = value.zhihuFilterSettings;
          for (const fn of listeners) fn({ zhihuFilterSettings: { oldValue, newValue: saved } }, 'local');
        }
      },
      onChanged: { addListener: (fn) => listeners.add(fn), removeListener: (fn) => listeners.delete(fn) }
    },
    runtime: { onMessage: { addListener() {} } },
    tabs: { async query() { return [{ id: 1 }]; }, async sendMessage() { throw new Error('No page'); } }
  };
}

function load(window, files = manifest.content_scripts[0].js.filter((name) => name !== 'content/main.js')) {
  for (const name of files) window.eval(fs.readFileSync(path.join(root, 'extension', name), 'utf8'));
  return window.ZhihuFilter;
}

function makeDOM(html = '', url = 'https://www.zhihu.com/') {
  return new JSDOM(`<!doctype html><html><head><style>${fs.readFileSync(path.join(root, 'extension/content.css'), 'utf8')}</style></head><body>${html}</body></html>`, {
    url, runScripts: 'outside-only', pretendToBeVisual: true
  });
}

function card(document, title, summary = '', id = '123') {
  const element = document.createElement('div');
  element.className = 'Card TopstoryItem TopstoryItem-isRecommend';
  const content = document.createElement('div');
  content.className = 'ContentItem';
  const heading = document.createElement('h2');
  heading.className = 'ContentItem-title';
  const link = document.createElement('a');
  link.href = `/question/${id}`;
  link.textContent = title;
  heading.append(link);
  const excerpt = document.createElement('div');
  excerpt.className = 'RichContent-inner';
  excerpt.textContent = summary;
  content.append(heading, excerpt);
  element.append(content);
  return element;
}

async function waitFor(predicate, message = 'condition not reached') {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > 2000) throw new Error(message);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

module.exports = { root, manifest, storageMock, load, makeDOM, card, waitFor };
