const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
execFileSync(process.execPath, [path.join(__dirname, 'check.cjs')], { stdio: 'inherit' });
fs.mkdirSync(dist, { recursive: true });
const { version } = require('../extension/manifest.json');
const output = path.join(dist, `zhihu-filter-${version}.zip`);
if (fs.existsSync(output)) fs.unlinkSync(output);
execFileSync('/usr/bin/zip', ['-q', '-r', output, '.', '-x', '*.DS_Store'], { cwd: path.join(root, 'extension') });
console.log(output);

execFileSync(process.execPath, [path.join(__dirname, "build-userscript.cjs")], { stdio: "inherit" });
