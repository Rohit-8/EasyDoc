import fs from 'fs/promises';
import type { ParseResult } from './pdfParser.js';

export async function parsePlainText(filePath: string): Promise<ParseResult> {
  const text = await fs.readFile(filePath, 'utf-8');
  const lines = text.split('\n');
  return {
    text,
    pageCount: Math.ceil(lines.length / 60),
    metadata: {},
  };
}
