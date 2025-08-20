import { execSync } from 'node:child_process';
import { test } from 'node:test';

test('next build succeeds', () => {
  execSync('npm run build', { stdio: 'inherit' });
});

