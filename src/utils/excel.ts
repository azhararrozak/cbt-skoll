import ExcelJS from 'exceljs';

export interface SheetRow {
  [header: string]: string;
}

/** Normalisasi header: lowercase, hapus spasi/underscore di ujung */
function normalizeHeader(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Baca baris dari file .xlsx (sheet pertama).
 * Semua sel dikonversi ke string dan di-trim; header dinormalisasi lowercase.
 */
export async function readSheetRows(buffer: Buffer): Promise<SheetRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return [];
  }

  const rows: SheetRow[] = [];
  const headers: (string | null)[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      row.eachCell((cell, colNumber) => {
        const text = String(cell.text ?? '').trim();
        headers[colNumber] = text ? normalizeHeader(text) : null;
      });
      return;
    }

    const record: SheetRow = {};
    let hasValue = false;
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const header = headers[colNumber];
      if (!header) return;
      const value = String(cell.text ?? '').trim();
      if (value) {
        record[header] = value;
        hasValue = true;
      }
    });
    if (hasValue) rows.push(record);
  });

  return rows;
}

/** Buat file template .xlsx untuk diunduh pengguna */
export async function buildTemplateBuffer(
  headers: string[],
  sampleRows: (string | number)[][],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Template');

  sheet.addRow(headers);
  for (const sample of sampleRows) {
    sheet.addRow(sample);
  }

  // Gaya header: tebal + latar indigo
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };

  sheet.columns.forEach((column) => {
    column.width = Math.max(18, (column.header?.length ?? 10) + 6);
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
