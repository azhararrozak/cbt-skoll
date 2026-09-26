import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeightRule,
  ImageRun,
  Packer,
  PageBreak,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx';
import type { Event } from '../../models';
import type { EventExamSummary } from './event.service';

interface EventStudent {
  name: string;
  nis: string | null;
  nisn: string | null;
  className: string;
  seat: number;
}

const NO_BORDER = {
  top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
};

const THIN_BORDER = {
  top: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
  left: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
  right: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
};

const center = { alignment: AlignmentType.CENTER } as const;

function textRun(text: string, opts: { bold?: boolean; size?: number; color?: string } = {}) {
  return new TextRun({ text, bold: opts.bold, size: opts.size, color: opts.color });
}

/** Parse data URL logo jadi { buffer, type } untuk ImageRun */
function parseLogo(dataUrl: string | null): { data: Buffer; type: 'png' | 'jpg' } | null {
  if (!dataUrl) return null;
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg));base64,(.+)$/);
  if (!match) return null;
  return {
    data: Buffer.from(match[2], 'base64'),
    type: match[1] === 'image/png' ? 'png' : 'jpg',
  };
}

/** Kop surat sekolah: logo + nama sekolah + alamat, garis tebal di bawahnya */
function buildKop(event: Event): (Paragraph | Table)[] {
  const logo = parseLogo(event.logo);
  const schoolName = new Paragraph({
    ...center,
    children: [textRun(event.schoolName.toUpperCase(), { bold: true, size: 32 })],
  });
  const address = new Paragraph({
    ...center,
    children: [textRun(event.schoolAddress ?? '', { size: 20 })],
  });

  const kopTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      ...NO_BORDER,
      bottom: { style: BorderStyle.SINGLE, size: 12, color: '000000' },
    },
    rows: [
      new TableRow({
        children: [
          logo
            ? new TableCell({
                borders: NO_BORDER,
                verticalAlign: VerticalAlign.CENTER,
                width: { size: 18, type: WidthType.PERCENTAGE },
                children: [
                  new Paragraph({
                    ...center,
                    children: [
                      new ImageRun({
                        data: logo.data,
                        type: logo.type,
                        transformation: { width: 75, height: 75 },
                      }),
                    ],
                  }),
                ],
              })
            : null,
          new TableCell({
            borders: NO_BORDER,
            verticalAlign: VerticalAlign.CENTER,
            width: { size: logo ? 82 : 100, type: WidthType.PERCENTAGE },
            children: [schoolName, address],
          }),
        ].filter((c): c is TableCell => c !== null),
      }),
    ],
  });

  return [kopTable, new Paragraph({ text: '' })];
}

function eventTitleBlock(event: Event, subtitle: string): Paragraph[] {
  return [
    new Paragraph({
      ...center,
      children: [textRun(subtitle.toUpperCase(), { bold: true, size: 28 })],
    }),
    new Paragraph({
      ...center,
      children: [textRun(event.title, { bold: true, size: 24 })],
    }),
    event.academicYear
      ? new Paragraph({
          ...center,
          children: [textRun(`Tahun Pelajaran ${event.academicYear}`, { size: 22 })],
        })
      : new Paragraph({ text: '' }),
    new Paragraph({ text: '' }),
  ];
}

function footer(event: Event): Footer {
  return new Footer({
    children: [
      new Paragraph({
        ...center,
        children: [textRun(`${event.schoolName} — ${event.title}`, { size: 16, color: '888888' })],
      }),
    ],
  });
}

function cell(children: Paragraph[], width?: number, shaded?: boolean): TableCell {
  return new TableCell({
    children,
    borders: THIN_BORDER,
    verticalAlign: VerticalAlign.CENTER,
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    shading: shaded ? { fill: 'EEF2FF' } : undefined,
  });
}

const cellPara = (text: string, bold = false, size = 22) =>
  new Paragraph({ children: [textRun(text, { bold, size })] });
const cellParaCenter = (text: string, bold = false, size = 22) =>
  new Paragraph({ ...center, children: [textRun(text, { bold, size })] });

/** Format tanggal Indonesia ringkas: 12 Jan 2026 */
function fmtDate(date: Date | string | null): string {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

// ================= KARTU PESERTA =================

export async function buildKartuPesertaDocx(
  event: Event,
  examList: EventExamSummary[],
  sections: { kelas: { name: string }; students: EventStudent[] }[],
): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];

  for (const [sectionIdx, section] of sections.entries()) {
    for (const [i, student] of section.students.entries()) {
      const isFirstOverall = sectionIdx === 0 && i === 0;
      if (!isFirstOverall) {
        children.push(new Paragraph({ children: [new PageBreak()] }));
      }

      children.push(...buildKop(event));
      children.push(...eventTitleBlock(event, 'Kartu Peserta Ujian'));

      // Identitas peserta
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: THIN_BORDER,
          rows: [
            new TableRow({ children: [cell([cellPara('Nama Peserta', true)], 30), cell([cellPara(student.name, true)])] }),
            new TableRow({ children: [cell([cellPara('NIS / NISN', true)], 30), cell([cellPara(`${student.nis ?? '-'} / ${student.nisn ?? '-'}`)])] }),
            new TableRow({ children: [cell([cellPara('Kelas', true)], 30), cell([cellPara(section.kelas.name)])] }),
            new TableRow({ children: [cell([cellPara('Nomor Meja', true)], 30), cell([cellPara(String(student.seat), true)])] }),
          ],
        }),
        new Paragraph({ text: '' }),
      );

      // Jadwal ujian event
      children.push(new Paragraph({ children: [textRun('Jadwal Ujian:', { bold: true, size: 22 })] }));
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: THIN_BORDER,
          rows: [
            new TableRow({
              tableHeader: true,
              children: [
                cell([cellParaCenter('No', true)], 8, true),
                cell([cellParaCenter('Mata Ujian', true)], 44, true),
                cell([cellParaCenter('Tanggal', true)], 22, true),
                cell([cellParaCenter('Durasi', true)], 26, true),
              ],
            }),
            ...examList.map((exam, idx) =>
              new TableRow({
                children: [
                  cell([cellParaCenter(String(idx + 1))], 8),
                  cell([cellPara(exam.title)]),
                  cell([cellParaCenter(fmtDate(exam.startAt))], 22),
                  cell([cellParaCenter(`${exam.durationMinutes} menit`)], 26),
                ],
              }),
            ),
          ],
        }),
      );

      // Catatan login
      children.push(
        new Paragraph({
          spacing: { before: 300 },
          children: [
            textRun('Masuk ujian menggunakan ', { size: 20 }),
            textRun(`NISN ${student.nisn ?? student.nis ?? '-'}`, { size: 20, bold: true }),
            textRun(' dan password dari pengawas. Kartu ini wajib dibawa selama ujian berlangsung.', { size: 20 }),
          ],
        }),
      );
    }
  }

  const doc = new Document({
    sections: [{ children, footers: { default: footer(event) } }],
  });
  return Packer.toBuffer(doc);
}

// ================= DAFTAR HADIR =================

export async function buildDaftarHadirDocx(
  event: Event,
  kelas: { name: string },
  students: EventStudent[],
  _examList: EventExamSummary[],
): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [
    ...buildKop(event),
    ...eventTitleBlock(event, 'Daftar Hadir Peserta Ujian'),
    new Paragraph({
      children: [
        textRun('Kelas / Ruang: ', { bold: true, size: 22 }),
        textRun(kelas.name, { size: 22 }),
        textRun('        Hari/Tanggal: ', { bold: true, size: 22 }),
        textRun('________________________', { size: 22 }),
      ],
    }),
    new Paragraph({ text: '' }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: THIN_BORDER,
      rows: [
        new TableRow({
          tableHeader: true,
          children: [
            cell([cellParaCenter('No', true)], 7, true),
            cell([cellParaCenter('NIS / NISN', true)], 20, true),
            cell([cellParaCenter('Nama Peserta', true)], 43, true),
            cell([cellParaCenter('No. Meja', true)], 12, true),
            cell([cellParaCenter('Tanda Tangan', true)], 18, true),
          ],
        }),
        ...students.map((student, idx) =>
          new TableRow({
            height: { value: 500, rule: HeightRule.ATLEAST },
            children: [
              cell([cellParaCenter(String(idx + 1))], 7),
              cell([cellPara(`${student.nis ?? '-'} / ${student.nisn ?? '-'}`)], 20),
              cell([cellPara(student.name)], 43),
              cell([cellParaCenter(String(student.seat))], 12),
              cell([new Paragraph({ children: [] })], 18),
            ],
          }),
        ),
      ],
    }),
    new Paragraph({ text: '' }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { before: 400 },
      children: [textRun('Mengetahui,', { size: 22 })],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [textRun('Ketua Panitia / Pengawas Ruang', { size: 22 })],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { before: 1200 },
      children: [textRun('(________________________)', { size: 22 })],
    }),
  ];

  const doc = new Document({
    sections: [{ children, footers: { default: footer(event) } }],
  });
  return Packer.toBuffer(doc);
}

// ================= NOMOR MEJA =================

export async function buildNomorMejaDocx(
  event: Event,
  kelas: { name: string },
  students: EventStudent[],
): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [
    new Paragraph({
      ...center,
      children: [textRun('NOMOR MEJA PESERTA UJIAN', { bold: true, size: 32 })],
    }),
    new Paragraph({
      ...center,
      children: [textRun(`${event.title} — Kelas ${kelas.name}`, { size: 24 })],
    }),
    event.academicYear
      ? new Paragraph({
          ...center,
          children: [textRun(`Tahun Pelajaran ${event.academicYear}`, { size: 22 })],
        })
      : new Paragraph({ text: '' }),
    new Paragraph({ text: '' }),
  ];

  // Grid 3 kartu per baris: potong daftar siswa per 3
  const perRow = 3;
  for (let i = 0; i < students.length; i += perRow) {
    const chunk = students.slice(i, i + perRow);
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: THIN_BORDER,
        rows: [
          new TableRow({
            height: { value: 2400, rule: HeightRule.ATLEAST },
            children: chunk.map(
              (student) =>
                new TableCell({
                  borders: THIN_BORDER,
                  verticalAlign: VerticalAlign.CENTER,
                  width: { size: Math.floor(100 / perRow), type: WidthType.PERCENTAGE },
                  children: [
                    new Paragraph({ ...center, children: [textRun('MEJA', { bold: true, size: 22, color: '666666' })] }),
                    new Paragraph({ ...center, children: [textRun(String(student.seat), { bold: true, size: 96 })] }),
                    new Paragraph({ ...center, children: [textRun(student.name, { bold: true, size: 24 })] }),
                    new Paragraph({ ...center, children: [textRun(`Kelas ${student.className}`, { size: 20, color: '666666' })] }),
                  ],
                }),
            ),
          }),
        ],
      }),
      new Paragraph({ text: '' }),
    );
  }

  const doc = new Document({
    sections: [{ children, footers: { default: footer(event) } }],
  });
  return Packer.toBuffer(doc);
}
