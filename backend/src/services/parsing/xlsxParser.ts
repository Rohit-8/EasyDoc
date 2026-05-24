import ExcelJS from 'exceljs';
import type { ParseResult } from './pdfParser.js';

export async function parseXlsx(filePath: string): Promise<ParseResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const sheets: string[] = [];
  workbook.eachSheet((worksheet) => {
    const rows: string[] = [];
    worksheet.eachRow((row) => {
      const values = (row.values as (string | number | null)[]).slice(1);
      rows.push(values.map((v) => String(v ?? '')).join('\t'));
    });
    sheets.push(`[Sheet: ${worksheet.name}]\n${rows.join('\n')}`);
  });

  return {
    text: sheets.join('\n\n'),
    pageCount: workbook.worksheets.length,
    metadata: { sheetCount: workbook.worksheets.length },
  };
}
