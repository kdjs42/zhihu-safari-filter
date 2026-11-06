const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const extension = path.join(root, 'extension');
const manifest = require('../extension/manifest.json');
const files = fs.readdirSync(extension, { recursive: true }).filter((file) => file.endsWith('.js'));
for (const file of files) execFileSync(process.execPath, ['--check', path.join(extension, file)]);
const references = [manifest.action.default_popup, ...manifest.content_scripts.flatMap((entry) => [...entry.js, ...entry.css])];
for (const file of references) {
  if (!fs.existsSync(path.join(extension, file))) throw new Error(`Missing extension resource: ${file}`);
}
if (JSON.stringify(manifest.permissions) !== '["storage"]') throw new Error('Review unexpected permissions');
if (JSON.stringify(manifest.host_permissions) !== '["https://www.zhihu.com/*"]') throw new Error('Review unexpected hosts');
console.log(`Checked ${files.length} JavaScript files, manifest resources and minimal permissions.`);

for (const folder of ['userscript', 'scripts']) {
  for (const file of fs.readdirSync(path.join(root, folder)).filter(file => /\.c?js$/u.test(file))) {
    execFileSync(process.execPath, ['--check', path.join(root, folder, file)]);
  }
}
