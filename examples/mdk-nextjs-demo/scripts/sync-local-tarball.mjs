import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
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

// Dependencies from tarballs that need to be added to the lock file if missing
// This list should be updated when new dependencies are added to core/nextjs
const requiredTransitiveDeps = ['bip39'];

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

// Recursively add a package and all its dependencies to the lock file
function addPackageWithDeps(pkgName, visited = new Set()) {
  if (visited.has(pkgName)) return;
  visited.add(pkgName);

  const depPath = `node_modules/${pkgName}`;
  if (lock.packages?.[depPath]) return;

  console.log(`Adding missing transitive dependency: ${pkgName}`);
  try {
    const info = JSON.parse(
      execSync(`npm view ${pkgName} --json`, { encoding: 'utf8' })
    );
    const version = info['dist-tags']?.latest || info.version;
    const tarball = info.dist?.tarball;
    const integrity = info.dist?.integrity;

    if (version && tarball && integrity) {
      lock.packages[depPath] = {
        version,
        resolved: tarball,
        integrity,
        license: info.license || 'MIT',
      };
      console.log(`  Added ${pkgName}@${version}`);

      // Recursively add dependencies
      const deps = info.dependencies || {};
      for (const subDep of Object.keys(deps)) {
        addPackageWithDeps(subDep, visited);
      }
    }
  } catch (e) {
    console.warn(`  Warning: Could not fetch info for ${pkgName}: ${e.message}`);
  }
}

// Check for missing transitive dependencies and add them (with their sub-deps)
for (const dep of requiredTransitiveDeps) {
  addPackageWithDeps(dep);
}

writeFileSync(lockPath, JSON.stringify(lock, null, 2));
console.log('Synced package-lock.json with local tarballs');
