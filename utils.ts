import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export function createTempDir(prefix: string = 'temp-'): string {
  const tempDir = path.join(os.tmpdir(), prefix + Math.random().toString(36).substr(2, 9));
  fs.mkdirSync(tempDir);
  return tempDir;
}
