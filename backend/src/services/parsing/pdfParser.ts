import fs from 'fs/promises';
import pdfParse from 'pdf-parse';

export interface ParseResult {
  text: string;
  pageCount: number;
  metadata: Record<string, unknown>;
}

export async function parsePdf(filePath: string): Promise<ParseResult> {
  const buffer = await fs.readFile(filePath);
  const data = await pdfParse(buffer);
  return {
    text: data.text,
    pageCount: data.numpages,
    metadata: { info: data.info },
  };
}
