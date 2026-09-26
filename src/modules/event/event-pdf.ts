import pdfMake from 'pdfmake';
import type { TDocumentDefinitions, Content, TableCell, StyleDictionary } from 'pdfmake/interfaces';
import type { Event } from '../../models';
import type { EventExamSummary } from './event.service';

// ===== Fonts =====

const fonts = {
  Roboto: {
    normal: require.resolve('pdfmake/build/vfs_fonts.js').replace('vfs_fonts.js', '../fonts/Roboto/Roboto-Regular.ttf'),
    bold: require.resolve('pdfmake/build/vfs_fonts.js').replace('vfs_fonts.js', '../fonts/Roboto/Roboto-Medium.ttf'),
    italics: require.resolve('pdfmake/build/vfs_fonts.js').replace('vfs_fonts.js', '../fonts/Roboto/Roboto-Italic.ttf'),
    bolditalics: require.resolve('pdfmake/build/vfs_fonts.js').replace('vfs_fonts.js', '../fonts/Roboto/Roboto-MediumItalic.ttf'),
  },
};

pdfMake.setUrlAccessPolicy(() => false);
pdfMake.setLocalAccessPolicy(() => true);
pdfMake.setFonts(fonts);

export interface EventStudent {
  name: string;
  nis: string | null;
  nisn: string | null;
  className: string;
  /** Nomor absen (urutan abjad, 1-based) */
  absen: number;
  /** Identifier: EventTitle/ClassName/NomorAbsen (3 digit padded) */
  identifier: string;
  /** Password awal siswa (plain text) — nullable */
  initialPassword: string | null;
}

const styles: StyleDictionary = {
  header: { fontSize: 14, bold: true, alignment: 'center' },
  subheader: { fontSize: 11, alignment: 'center' },
  label: { fontSize: 9, bold: true },
  value: { fontSize: 9 },
  small: { fontSize: 7, color: '#666666' },
  tableHeader: { fontSize: 9, bold: true, fillColor: '#EEF2FF', alignment: 'center' },
};

/**
 * Parse data URL logo (base64) menjadi string data:image/... yang bisa
 * langsung dipakai pdfmake.
 */
function parseLogo(dataUrl: string | null): string | null {
  if (!dataUrl) return null;
  if (dataUrl.startsWith('data:image/')) return dataUrl;
  return null;
}

/** Inisial nama untuk avatar placeholder */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

/** Kop surat sekolah */
function buildKop(event: Event): Content[] {
  const logo = parseLogo(event.logo);
  const content: Content[] = [];

  if (logo) {
    content.push({
      columns: [
        { image: logo, width: 50, alignment: 'center' },
        {
          stack: [
            { text: event.schoolName.toUpperCase(), style: 'header', fontSize: 12 },
            event.schoolAddress
              ? { text: event.schoolAddress, style: 'subheader', fontSize: 8 }
              : { text: '' },
          ],
          width: '*',
        },
      ],
      columnGap: 8,
    });
  } else {
    content.push(
      { text: event.schoolName.toUpperCase(), style: 'header', fontSize: 12 },
      event.schoolAddress
        ? { text: event.schoolAddress, style: 'subheader', fontSize: 8 }
        : { text: '', fontSize: 1 },
    );
  }

  // Garis tebal di bawah kop
  content.push({
    canvas: [{ type: 'line', x1: 0, y1: 2, x2: 515, y2: 2, lineWidth: 1.5 }],
    margin: [0, 4, 0, 6] as [number, number, number, number],
  });

  return content;
}

// ================= KARTU PESERTA (PDF) =================

export async function buildKartuPesertaPdf(
  event: Event,
  examList: EventExamSummary[],
  sections: { kelas: { name: string }; students: EventStudent[] }[],
): Promise<Buffer> {
  // Layout: 2 kolom per halaman, beberapa baris jika muat
  const CARD_WIDTH = 250;
  const cards: Content[] = [];

  for (const section of sections) {
    for (const student of section.students) {
      // Data informasi peserta
      const infoTable: Content = {
        table: {
          widths: [55, '*'],
          body: [
            [{ text: 'No', style: 'label' }, { text: student.identifier, style: 'value', bold: true }],
            [{ text: 'Nama', style: 'label' }, { text: student.name, style: 'value' }],
            [{ text: 'Kelas', style: 'label' }, { text: section.kelas.name, style: 'value' }],
            [{ text: 'NIS/NISN', style: 'label' }, { text: `${student.nis ?? '-'} / ${student.nisn ?? '-'}`, style: 'value' }],
            [
              { text: 'Username', style: 'label' },
              { text: student.nisn ?? student.nis ?? '-', style: 'value' },
            ],
            [
              { text: 'Password', style: 'label' },
              { text: student.initialPassword ?? '(atur oleh admin)', style: 'value' },
            ],
          ],
        },
        layout: 'noBorders',
      };

      // Avatar (inisial nama)
      const avatar: Content = {
        table: {
          widths: [45],
          heights: [45],
          body: [[{
            text: initials(student.name),
            fontSize: 16,
            bold: true,
            color: '#4F46E5',
            alignment: 'center',
            margin: [0, 12, 0, 0] as [number, number, number, number],
          }]],
        },
        layout: {
          fillColor: () => '#EEF2FF',
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => '#C7D2FE',
          vLineColor: () => '#C7D2FE',
        },
      };

      // Area tanda tangan
      const signerContent: Content[] = [];
      if (event.signerName) {
        signerContent.push(
          { text: event.signerTitle ?? 'Mengetahui,', fontSize: 7, alignment: 'center' as const },
          { text: '\n\n', fontSize: 5 },
          { text: event.signerName, fontSize: 7, bold: true, alignment: 'center' as const },
          event.signerNip
            ? { text: `NIP. ${event.signerNip}`, fontSize: 6, alignment: 'center' as const }
            : { text: '', fontSize: 1 },
        );
      }

      const card: Content = {
        stack: [
          // Judul kartu
          { text: `KARTU PESERTA ${event.title.toUpperCase()}`, fontSize: 9, bold: true, alignment: 'center' },
          { text: event.schoolName, fontSize: 7, alignment: 'center', color: '#555555' },
          event.academicYear
            ? { text: `Tahun Pelajaran ${event.academicYear}`, fontSize: 7, alignment: 'center', color: '#555555' }
            : { text: '', fontSize: 1 },
          { text: '', fontSize: 4 },
          // Foto + Info
          {
            columns: [
              { stack: [avatar], width: 55 },
              { stack: [infoTable], width: '*' },
            ],
            columnGap: 6,
          },
          { text: '', fontSize: 4 },
          // Catatan
          {
            text: `Login ujian menggunakan NISN/NIS sebagai username.`,
            fontSize: 6,
            color: '#888888',
            italics: true,
          },
          // Tanda tangan
          ...(signerContent.length > 0
            ? [{ text: '', fontSize: 6 }, ...signerContent]
            : []),
        ],
        margin: [6, 6, 6, 6] as [number, number, number, number],
      };

      cards.push(card);
    }
  }

  // Susun kartu dalam grid 2 kolom
  const pageContent: Content[] = [];

  for (let i = 0; i < cards.length; i += 2) {
    const row: TableCell[] = [
      cards[i],
      i + 1 < cards.length ? cards[i + 1] : { text: '' },
    ];

    if (i > 0 && i % 6 === 0) {
      pageContent.push({ text: '', pageBreak: 'before' });
    }

    pageContent.push({
      table: {
        widths: [CARD_WIDTH, CARD_WIDTH],
        body: [row],
      },
      layout: {
        hLineWidth: () => 0.8,
        vLineWidth: () => 0.8,
        hLineColor: () => '#999999',
        vLineColor: () => '#999999',
        paddingLeft: () => 0,
        paddingRight: () => 0,
        paddingTop: () => 0,
        paddingBottom: () => 0,
      },
      margin: [0, 0, 0, 6] as [number, number, number, number],
    });
  }

  const docDefinition: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: [30, 30, 30, 30],
    content: pageContent,
    styles,
    footer: (currentPage, pageCount) => ({
      text: `${event.schoolName} — ${event.title} | Hal ${currentPage}/${pageCount}`,
      alignment: 'center',
      fontSize: 7,
      color: '#AAAAAA',
      margin: [0, 0, 0, 0],
    }),
  };

  return pdfMake.createPdf(docDefinition).getBuffer();
}

// ================= DAFTAR HADIR (PDF) =================

export async function buildDaftarHadirPdf(
  event: Event,
  kelas: { name: string },
  students: EventStudent[],
  _examList: EventExamSummary[],
): Promise<Buffer> {
  const headerRow: TableCell[] = [
    { text: 'No', style: 'tableHeader' },
    { text: 'No. Peserta', style: 'tableHeader' },
    { text: 'Nama Peserta', style: 'tableHeader' },
    { text: 'Kelas', style: 'tableHeader' },
    { text: 'Tanda Tangan', style: 'tableHeader' },
  ];

  const dataRows: TableCell[][] = students.map((student, idx) => [
    { text: String(idx + 1), fontSize: 9, alignment: 'center' },
    { text: student.identifier, fontSize: 8 },
    { text: student.name, fontSize: 9 },
    { text: student.className, fontSize: 9, alignment: 'center' },
    { text: '', fontSize: 9 },
  ]);

  const content: Content[] = [
    ...buildKop(event),
    { text: 'DAFTAR HADIR PESERTA UJIAN', style: 'header', fontSize: 13, margin: [0, 0, 0, 2] as [number, number, number, number] },
    { text: event.title, style: 'subheader', fontSize: 11, bold: true },
    event.academicYear
      ? { text: `Tahun Pelajaran ${event.academicYear}`, style: 'subheader', fontSize: 9 }
      : { text: '', fontSize: 1 },
    { text: '', fontSize: 6 },
    {
      columns: [
        { text: [{ text: 'Kelas / Ruang: ', bold: true }, kelas.name], fontSize: 10 },
        { text: [{ text: 'Hari/Tanggal: ', bold: true }, '________________________'], fontSize: 10, alignment: 'right' },
      ],
    },
    { text: '', fontSize: 8 },
    {
      table: {
        headerRows: 1,
        widths: [25, 85, '*', 50, 75],
        body: [headerRow, ...dataRows],
      },
      layout: {
        hLineWidth: () => 0.5,
        vLineWidth: () => 0.5,
        hLineColor: () => '#333333',
        vLineColor: () => '#333333',
      },
    },
    { text: '', fontSize: 16 },
  ];

  // Area tanda tangan
  if (event.signerName) {
    content.push({
      columns: [
        { text: '', width: '*' },
        {
          stack: [
            { text: event.signerTitle ?? 'Mengetahui,', fontSize: 10, alignment: 'center' },
            { text: '\n\n\n', fontSize: 6 },
            { text: event.signerName, fontSize: 10, bold: true, alignment: 'center', decoration: 'underline' },
            event.signerNip
              ? { text: `NIP. ${event.signerNip}`, fontSize: 9, alignment: 'center' }
              : { text: '', fontSize: 1 },
          ],
          width: 200,
        },
      ],
    });
  } else {
    content.push({
      columns: [
        { text: '', width: '*' },
        {
          stack: [
            { text: 'Mengetahui,', fontSize: 10, alignment: 'center' },
            { text: 'Ketua Panitia / Pengawas Ruang', fontSize: 10, alignment: 'center' },
            { text: '\n\n\n', fontSize: 6 },
            { text: '(________________________)', fontSize: 10, alignment: 'center' },
          ],
          width: 200,
        },
      ],
    });
  }

  const docDefinition: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: [40, 30, 40, 40],
    content,
    styles,
    footer: (currentPage, pageCount) => ({
      text: `${event.schoolName} — ${event.title} — Daftar Hadir ${kelas.name} | Hal ${currentPage}/${pageCount}`,
      alignment: 'center',
      fontSize: 7,
      color: '#AAAAAA',
      margin: [0, 0, 0, 0],
    }),
  };

  return pdfMake.createPdf(docDefinition).getBuffer();
}

// ================= NOMOR MEJA (PDF) =================

export async function buildNomorMejaPdf(
  event: Event,
  kelas: { name: string },
  students: EventStudent[],
): Promise<Buffer> {
  const content: Content[] = [
    { text: 'NOMOR MEJA PESERTA UJIAN', style: 'header', fontSize: 16 },
    { text: `${event.title} — Kelas ${kelas.name}`, style: 'subheader', fontSize: 12 },
    event.academicYear
      ? { text: `Tahun Pelajaran ${event.academicYear}`, style: 'subheader', fontSize: 10 }
      : { text: '', fontSize: 1 },
    { text: '', fontSize: 10 },
  ];

  // Grid 3 kartu per baris
  const perRow = 3;
  const cellWidth = Math.floor((515 - 20) / perRow);

  for (let i = 0; i < students.length; i += perRow) {
    const chunk = students.slice(i, i + perRow);

    const row: TableCell[] = chunk.map((student) => ({
      stack: [
        { text: 'MEJA', fontSize: 10, bold: true, color: '#666666', alignment: 'center' as const },
        { text: student.identifier, fontSize: 18, bold: true, alignment: 'center' as const, margin: [0, 8, 0, 8] as [number, number, number, number] },
        { text: student.name, fontSize: 10, bold: true, alignment: 'center' as const },
        { text: `Kelas ${student.className}`, fontSize: 8, color: '#666666', alignment: 'center' as const },
      ],
      margin: [4, 12, 4, 12] as [number, number, number, number],
    }));

    // Pad baris terakhir jika tidak penuh
    while (row.length < perRow) {
      row.push({ text: '' });
    }

    content.push({
      table: {
        widths: Array(perRow).fill(cellWidth),
        body: [row],
      },
      layout: {
        hLineWidth: () => 1,
        vLineWidth: () => 1,
        hLineColor: () => '#333333',
        vLineColor: () => '#333333',
      },
      margin: [0, 0, 0, 6] as [number, number, number, number],
    });
  }

  const docDefinition: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: [40, 30, 40, 30],
    content,
    styles,
    footer: (currentPage, pageCount) => ({
      text: `${event.schoolName} — ${event.title} — Nomor Meja ${kelas.name} | Hal ${currentPage}/${pageCount}`,
      alignment: 'center',
      fontSize: 7,
      color: '#AAAAAA',
      margin: [0, 0, 0, 0],
    }),
  };

  return pdfMake.createPdf(docDefinition).getBuffer();
}
