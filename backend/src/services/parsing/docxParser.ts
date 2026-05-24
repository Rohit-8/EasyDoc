import fs from 'fs/promises';
import mammoth from 'mammoth';
import type { ParseResult } from './pdfParser.js';

export async function parseDocx(filePath: string): Promise<ParseResult> {
  const buffer = await fs.readFile(filePath);
  const result = await mammoth.extractRawText({ buffer });
  const paragraphs = result.value.split('\n').filter((p) => p.trim());
  return {
    text: result.value,
    pageCount: Math.ceil(paragraphs.length / 40),
    metadata: {},
  };
}
