import crypto from 'crypto';
import fs from 'fs';

export async function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(`sha256:${hash.digest('hex')}`));
    stream.on('error', reject);
  });
}
