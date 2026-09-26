import mammoth from 'mammoth';
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';

/** Ekstrak teks mentah dari file .docx (paragraf dipisah baris baru) */
export async function readDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

const bold = (text: string) => new TextRun({ text, bold: true });
const normal = (text: string) => new TextRun({ text });
const italic = (text: string) => new TextRun({ text, italics: true, color: '6B7280' });

/** Template .docx untuk import soal — petunjuk + contoh ketiga tipe soal */
export async function buildQuestionTemplateDocx(): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({ text: 'TEMPLATE IMPORT SOAL CBT SKOLL', heading: HeadingLevel.HEADING_1 }),
    new Paragraph({
      children: [
        italic(
          'Ikuti pola di bawah, lalu hapus bagian petunjuk ini sebelum upload. Rumus matematika ditulis dengan LaTeX di antara tanda $, contoh: $\\frac{1}{2}$ atau $x^{2}$.',
        ),
      ],
    }),
    new Paragraph({ text: 'CARA PENULISAN', heading: HeadingLevel.HEADING_2 }),
    new Paragraph({ children: [normal('1. '), bold('Soal dimulai nomor + titik'), normal(' (cth: "1. Soal saya adalah ...")')] }),
    new Paragraph({ children: [normal('2. '), bold('Opsi pilihan ganda'), normal(' memakai huruf besar + titik: A. B. C. D. E.')] }),
    new Paragraph({ children: [normal('3. '), bold('Kunci jawaban'), normal(': "JAWABAN: A" (huruf opsi) atau "JAWABAN: BENAR/SALAH"')] }),
    new Paragraph({ children: [normal('4. '), bold('Poin'), normal(': "POIN: 10" (opsional, default 1)')] }),
    new Paragraph({ children: [normal('5. '), bold('Benar/salah'), normal(': tanpa opsi, cukup JAWABAN: BENAR atau SALAH')] }),
    new Paragraph({ children: [normal('6. '), bold('Isian singkat'), normal(': ganti baris jawaban dengan "ISIAN: jawaban singkat"')] }),
    new Paragraph({ text: '' }),

    new Paragraph({ text: 'CONTOH SOAL', heading: HeadingLevel.HEADING_2 }),
    new Paragraph({ text: '1. Hasil dari $\\frac{12 \\times 8}{2}$ adalah ...' }),
    new Paragraph({ text: 'A. 24' }),
    new Paragraph({ text: 'B. 48' }),
    new Paragraph({ text: 'C. 96' }),
    new Paragraph({ text: 'D. 106' }),
    new Paragraph({ text: 'JAWABAN: B' }),
    new Paragraph({ text: 'POIN: 10' }),
    new Paragraph({ text: '' }),

    new Paragraph({ text: '2. Angka 0 termasuk bilangan prima.' }),
    new Paragraph({ text: 'JAWABAN: SALAH' }),
    new Paragraph({ text: 'POIN: 5' }),
    new Paragraph({ text: '' }),

    new Paragraph({ text: '3. Hasil dari $\\sqrt{144}$ adalah ...' }),
    new Paragraph({ text: 'ISIAN: 12' }),
    new Paragraph({ text: 'POIN: 10' }),
  ];

  const doc = new Document({
    sections: [{ children }],
  });

  return Packer.toBuffer(doc);
}
