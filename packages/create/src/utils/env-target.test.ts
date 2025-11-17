import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { deriveProjectName, resolveEnvTarget } from './env-target.js';

const cwd = '/Users/test/project';

function resolution(target?: string, override?: string) {
  return resolveEnvTarget({
    explicitTarget: target,
    overrideTarget: override,
    cwd,
    defaultFilename: '.env.local',
  });
}

test('explicit filename in current dir', () => {
  const result = resolution('.env.local');
  assert.equal(result.projectDir, path.resolve(cwd));
  assert.equal(result.envFile, '.env.local');
  assert.equal(result.providedExplicitly, true);
});

test('relative path with dot slash', () => {
  const result = resolution('./configs/.env');
  assert.equal(result.projectDir, path.resolve(cwd, 'configs'));
  assert.equal(result.envFile, '.env');
  assert.equal(result.providedExplicitly, true);
});

test('absolute path', () => {
  const result = resolution('/tmp/myapp/.env.prod');
  assert.equal(result.projectDir, path.resolve('/tmp/myapp'));
  assert.equal(result.envFile, '.env.prod');
  assert.equal(result.providedExplicitly, true);
});

test('relative parent path', () => {
  const result = resolution('../../shared/.env');
  assert.equal(result.projectDir, path.resolve(cwd, '../../shared'));
  assert.equal(result.envFile, '.env');
  assert.equal(result.providedExplicitly, true);
});

test('default filename when nothing provided', () => {
  const result = resolution(undefined, undefined);
  assert.equal(result.projectDir, path.resolve(cwd));
  assert.equal(result.envFile, '.env.local');
  assert.equal(result.providedExplicitly, false);
});

test('derive project name from input', () => {
  assert.equal(deriveProjectName(' My Store ', 'https://example.com'), 'My Store');
});

test('derive project name fallback to webhook URL', () => {
  assert.equal(deriveProjectName(undefined, 'https://example.com'), 'https://example.com');
});
