import path from 'path';
import fs from 'fs/promises';
import { logger } from '../../observability/logger.js';
import { env } from '../../config/env.js';

// ── Magic-byte MIME validation ──

const MAGIC_SIGNATURES: { mime: string; bytes: number[]; offset?: number }[] = [
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', bytes: [0x50, 0x4B, 0x03, 0x04] }, // PK (ZIP)
  { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bytes: [0x50, 0x4B, 0x03, 0x04] }, // PK (ZIP)
];

export async function validateMagicBytes(filePath: string, expectedMime: string): Promise<boolean> {
  const fd = await fs.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(16);
    await fd.read(buf, 0, 16, 0);

    const sig = MAGIC_SIGNATURES.find((s) => s.mime === expectedMime);
    if (!sig) {
      // Text-based formats (csv, txt, md) — no magic bytes to check
      return true;
    }

    const offset = sig.offset ?? 0;
    for (let i = 0; i < sig.bytes.length; i++) {
      if (buf[offset + i] !== sig.bytes[i]) {
        logger.warn('Magic byte mismatch', { filePath, expectedMime, got: buf.subarray(0, 8).toString('hex') });
        return false;
      }
    }
    return true;
  } finally {
    await fd.close();
  }
}

// ── Filename sanitization ──

const UNSAFE_CHARS = /[<>:"/\\|?*\x00-\x1F]/g;
const TRAVERSAL = /\.\.[/\\]/g;

export function sanitizeFilename(name: string): string {
  let safe = path.basename(name); // strip path components
  safe = safe.replace(TRAVERSAL, '');
  safe = safe.replace(UNSAFE_CHARS, '_');
  if (safe.length === 0 || safe === '.' || safe === '..') safe = 'unnamed';
  return safe.slice(0, 255); // max filename length
}

// ── ZIP bomb detection ──

export async function checkZipBomb(filePath: string, maxRatio = 100): Promise<boolean> {
  const ext = path.extname(filePath).toLowerCase();
  if (!['.xlsx', '.docx'].includes(ext)) return true; // only check ZIP-based formats

  try {
    const { default: AdmZip } = await import('adm-zip');
    const zip = new AdmZip(filePath);
    const entries = zip.getEntries();

    const compressedSize = (await fs.stat(filePath)).size;
    let uncompressedTotal = 0;

    for (const entry of entries) {
      uncompressedTotal += entry.header.size;
      if (uncompressedTotal / compressedSize > maxRatio) {
        logger.warn('ZIP bomb detected', { filePath, ratio: uncompressedTotal / compressedSize, threshold: maxRatio });
        return false;
      }
    }
    return true;
  } catch (err) {
    logger.warn('ZIP bomb check failed', { filePath, error: (err as Error).message });
    return true; // don't block on check failure
  }
}

// ── ClamAV malware scanning ──

let scannerInstance: { isInfected: (path: string) => Promise<{ isInfected: boolean; viruses: string[] }> } | null = null;

async function getScanner() {
  if (scannerInstance) return scannerInstance;

  if (env.CLAMAV_ENABLED !== 'true') return null;

  try {
    const { default: NodeClam } = await import('clamscan');
    scannerInstance = await new NodeClam().init({
      clamdscan: {
        host: env.CLAMAV_HOST,
        port: env.CLAMAV_PORT,
        timeout: 30000,
      },
      preference: 'clamdscan',
    });
    logger.info('ClamAV scanner initialized');
    return scannerInstance;
  } catch (err) {
    logger.warn('ClamAV not available', { error: (err as Error).message });
    return null;
  }
}

export async function scanMalware(filePath: string): Promise<{ safe: boolean; viruses: string[] }> {
  const scanner = await getScanner();
  if (!scanner) return { safe: true, viruses: [] }; // Skip if ClamAV not enabled/available

  try {
    const result = await scanner.isInfected(filePath);
    if (result.isInfected) {
      logger.error('Malware detected', { filePath, viruses: result.viruses });
    }
    return { safe: !result.isInfected, viruses: result.viruses };
  } catch (err) {
    logger.warn('Malware scan failed', { filePath, error: (err as Error).message });
    return { safe: true, viruses: [] }; // don't block on scan failure
  }
}

// ── Full security pipeline ──

export async function runSecurityChecks(
  filePath: string,
  mimeType: string,
): Promise<{ passed: boolean; reason?: string }> {
  // 1. Magic bytes
  const magicValid = await validateMagicBytes(filePath, mimeType);
  if (!magicValid) return { passed: false, reason: 'File content does not match declared type' };

  // 2. ZIP bomb
  const zipSafe = await checkZipBomb(filePath);
  if (!zipSafe) return { passed: false, reason: 'File detected as potential ZIP bomb' };

  // 3. Malware
  const malware = await scanMalware(filePath);
  if (!malware.safe) return { passed: false, reason: `Malware detected: ${malware.viruses.join(', ')}` };

  return { passed: true };
}
