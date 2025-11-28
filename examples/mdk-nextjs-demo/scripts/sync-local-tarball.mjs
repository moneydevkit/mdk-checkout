import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const lockPath = path.resolve('package-lock.json');
const tarballPath = path.resolve('moneydevkit-nextjs-local.tgz');

const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
const tarball = readFileSync(tarballPath);
const integrity =
  'sha512-' + createHash('sha512').update(tarball).digest('base64');
const resolved = 'file:./moneydevkit-nextjs-local.tgz';

const packagePaths = ['', 'node_modules/@moneydevkit/nextjs'];

for (const pkgPath of packagePaths) {
  if (lock.packages?.[pkgPath]) {
    lock.packages[pkgPath].resolved = resolved;
    lock.packages[pkgPath].integrity = integrity;
  }
}

if (lock.dependencies?.['@moneydevkit/nextjs']) {
  lock.dependencies['@moneydevkit/nextjs'].resolved = resolved;
  lock.dependencies['@moneydevkit/nextjs'].integrity = integrity;
}

writeFileSync(lockPath, JSON.stringify(lock, null, 2));
console.log('Synced package-lock.json with moneydevkit-nextjs-local.tgz');
