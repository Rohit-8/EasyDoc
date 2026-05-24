import { parsePdf, type ParseResult } from './pdfParser.js';
import { parseDocx } from './docxParser.js';
import { parseXlsx } from './xlsxParser.js';
import { parsePlainText } from './textParser.js';
import { AppError } from '../../utils/AppError.js';

const parserMap: Record<string, (path: string) => Promise<ParseResult>> = {
  'application/pdf': parsePdf,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': parseDocx,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': parseXlsx,
  'text/plain': parsePlainText,
  'text/markdown': parsePlainText,
  'text/csv': parsePlainText,
};

export async function parseDocument(filePath: string, mimeType: string): Promise<ParseResult> {
  const parser = parserMap[mimeType];
  if (!parser) {
    throw new AppError('INVALID_FILE_TYPE', `No parser for MIME type: ${mimeType}`, 400);
  }
  return parser(filePath);
}

export type { ParseResult };
