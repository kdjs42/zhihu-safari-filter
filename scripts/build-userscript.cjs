const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const manifest = require('../extension/manifest.json');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const url = 'https://github.com/kdjs42/zhihu-safari-filter/releases/latest/download';
function build() {
  const metadata = `// ==UserScript==
// @name         知乎过滤器
// @namespace    https://github.com/kdjs42/zhihu-safari-filter
// @version      ${manifest.version}
// @description  本地过滤知乎首页推荐中的关键词、广告和盐选小说。
// @match        https://www.zhihu.com/*
// @run-at       document-end
// @inject-into  content
// @noframes
// @grant        GM.getValue
// @grant        GM.setValue
// @updateURL    ${url}/zhihu-filter.meta.js
// @downloadURL  ${url}/zhihu-filter.user.js
// ==/UserScript==
`;
  const backup = `<details><summary>备份与迁移</summary><label for="backup">设置备份（JSON）</label><textarea id="backup" rows="4" spellcheck="false" placeholder="粘贴备份，或点击导出"></textarea><div class="backup-actions"><button id="export-settings" type="button">导出设置</button><button id="import-settings" type="button">读入备份</button></div><p class="hint">读入后点击“保存并应用”。旧插件词表可直接粘贴到关键词框。</p></details>`;
  const panelHTML = read('extension/popup/popup.html').match(/<body>([\s\S]*?)<\/body>/u)[1]
    .replace(/\s*<script[\s\S]*?<\/script>/gu, '')
    .replace('</fieldset>', backup + '</fieldset>');
  const assets = { panelHTML, filterCSS: read('extension/content.css'),
    panelCSS: read('extension/popup/popup.css').replace(/:root/gu, ':host').replace(/\bbody\s*\{/gu, '.panel-content {') + '\n' + read('userscript/panel.css') };
  const modules = manifest.content_scripts[0].js
    .filter(name => !['platform/settings-store.js', 'content/main.js'].includes(name))
    .map(name => `// Source: extension/${name}\n${read('extension/' + name)}`);
  modules.push(read('userscript/settings-store.js'), read('userscript/main.js'));
  // Shadow only the namespace object: never modify Userscripts' shared global scope.
  const source = metadata + '\n(() => {\n"use strict";\nconst globalThis = {};\nconst assets = ' + JSON.stringify(assets) + ';\n' + modules.join('\n') + '\n})();\n';
  return { source, metadata };
}
if (require.main === module) {
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
  const { source, metadata } = build();
  const output = path.join(root, 'dist/zhihu-filter.user.js');
  fs.writeFileSync(output, source);
  fs.writeFileSync(path.join(root, 'dist/zhihu-filter.meta.js'), metadata);
  execFileSync(process.execPath, ['--check', output]);
  console.log(output);
}
module.exports = { build };
