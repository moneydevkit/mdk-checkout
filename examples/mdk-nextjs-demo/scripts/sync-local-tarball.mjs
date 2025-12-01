import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, '..');
const resolveAppPath = (p) => path.resolve(appDir, p);

const lockPath = resolveAppPath('package-lock.json');
const packages = [
  {
    name: '@moneydevkit/nextjs',
    tarball: 'moneydevkit-nextjs-local.tgz',
  },
  {
    name: '@moneydevkit/core',
    tarball: 'moneydevkit-core-local.tgz',
  },
];

const lock = JSON.parse(readFileSync(lockPath, 'utf8'));

for (const { name, tarball } of packages) {
  const tarballPath = resolveAppPath(tarball);
  const file = readFileSync(tarballPath);
  const integrity =
    'sha512-' + createHash('sha512').update(file).digest('base64');
  const resolved = `file:./${tarball}`;

  const packagePaths = ['', `node_modules/${name}`];

  for (const pkgPath of packagePaths) {
    if (lock.packages?.[pkgPath]) {
      lock.packages[pkgPath].resolved = resolved;
      lock.packages[pkgPath].integrity = integrity;
    }
  }

  if (lock.dependencies?.[name]) {
    lock.dependencies[name].resolved = resolved;
    lock.dependencies[name].integrity = integrity;
  }
}

writeFileSync(lockPath, JSON.stringify(lock, null, 2));
console.log('Synced package-lock.json with local tarballs');
