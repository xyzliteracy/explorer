import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const core = fileURLToPath(new URL('../../xyz-viewer/', import.meta.url));
execFileSync('git', ['pull', '--ff-only'], { cwd: core, stdio: 'inherit' });
execFileSync('npm', ['ci'], { cwd: core, stdio: 'inherit' });
execFileSync('npm', ['install'], { cwd: fileURLToPath(new URL('../', import.meta.url)), stdio: 'inherit' });
