import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const root = process.cwd();
const require = createRequire(import.meta.url);
const babelParser = require(path.join(root, 'client', 'node_modules', '@babel', 'parser'));

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

for (const file of walk(path.join(root, 'server', 'src')).filter((file) => file.endsWith('.js'))) {
  execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
}

for (const file of walk(path.join(root, 'client', 'src')).filter((file) => /\.(js|jsx)$/.test(file))) {
  const source = fs.readFileSync(file, 'utf8');
  babelParser.parse(source, { sourceType: 'module', plugins: ['jsx'] });
}

for (const forbidden of ['client/.env', 'server/.env']) {
  if (fs.existsSync(path.join(root, forbidden))) throw new Error(`Secret/config file must not be committed: ${forbidden}`);
}

console.log('Roamly validation passed: server syntax, client JSX parsing, and secret-file checks.');
