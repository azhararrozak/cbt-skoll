import { z } from 'zod';
import { readDocxText } from '../../utils/docx';

/** Draft soal hasil parsing — bentuknya sama dengan createQuestionSchema */
export type QuestionDraft = {
  type: 'multiple_choice' | 'true_false' | 'short_answer';
  questionText: string;
  points: number;
  options?: string[];
  correctAnswer: string | number;
};

interface DraftQuestion {
  number: number;
  text: string;
  options: string[];
  answer?: string;
  isian?: string;
  points?: number;
  hasTrueFalseMarker: boolean;
}

const RE_NUMBER = /^(\d{1,3})[.)]\s*(.*)$/;
const RE_OPTION = /^([A-Ea-e])[.)]\s*(\S.*)$/;
const RE_ANSWER = /^(?:JAWABAN|KUNCI|KUNCI JAWABAN)\s*[:.]?\s*(.+)$/i;
const RE_ISIAN = /^(?:ISIAN|ISIAN SINGKAT|JAWAB SINGKAT)\s*[:.]?\s*(.*)$/i;
const RE_POINTS = /^(?:POIN|BOBOT|SKOR|NILAI)\s*[:.]?\s*(\d{1,3})$/i;
const RE_TF_MARKER = /^(?:BENAR\s*\/?\s*SALAH|SALAH\s*\/?\s*BENAR|TRUE\s*\/?\s*FALSE)$/i;

const TURE_FALSE_MAP: Record<string, number> = {
  BENAR: 0,
  SALAH: 1,
  TRUE: 0,
  FALSE: 1,
};

export interface ParsedQuestionResult {
  drafts: QuestionDraft[];
  errors: { question: number; message: string }[];
}

/** Parse teks hasil ekstraksi .docx menjadi draft soal */
export function parseQuestionText(raw: string): ParsedQuestionResult {
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const drafts: QuestionDraft[] = [];
  const errors: { question: number; message: string }[] = [];

  let current: DraftQuestion | null = null;
  let lastNumber = 0;

  const finalize = (draft: DraftQuestion | null) => {
    if (!draft) return;

    const label = draft.number > 0 ? `soal #${draft.number}` : 'soal tanpa nomor';
    const text = draft.text.trim();

    if (!text) {
      errors.push({ question: draft.number || lastNumber, message: `${label}: teks soal kosong` });
      return;
    }

    // Tentukan tipe soal
    if (draft.options.length >= 2) {
      // Pilihan ganda
      const answerRaw = draft.answer?.trim();
      if (!answerRaw) {
        errors.push({ question: draft.number, message: `${label}: kunci jawaban (JAWABAN: A) belum diisi` });
        return;
      }
      const letter = answerRaw.charAt(0).toUpperCase();
      const index = letter.charCodeAt(0) - 65;
      if (index < 0 || index >= draft.options.length) {
        errors.push({
          question: draft.number,
          message: `${label}: kunci jawaban "${answerRaw}" tidak cocok dengan opsi yang tersedia`,
        });
        return;
      }
      drafts.push({
        type: 'multiple_choice',
        questionText: text,
        options: draft.options,
        correctAnswer: index,
        points: draft.points ?? 1,
      });
      return;
    }

    if (draft.isian !== undefined) {
      // Isian singkat
      const value = draft.isian.trim();
      if (!value) {
        errors.push({ question: draft.number, message: `${label}: nilai ISIAN kosong` });
        return;
      }
      drafts.push({
        type: 'short_answer',
        questionText: text,
        correctAnswer: value,
        points: draft.points ?? 1,
      });
      return;
    }

    if (draft.answer !== undefined || draft.hasTrueFalseMarker) {
      // Benar/salah
      const value = (draft.answer ?? '').trim().toUpperCase().replace(/[.\s]+$/, '');
      if (!(value in TURE_FALSE_MAP)) {
        errors.push({
          question: draft.number,
          message: `${label}: kunci jawaban harus BENAR atau SALAH`,
        });
        return;
      }
      drafts.push({
        type: 'true_false',
        questionText: text,
        correctAnswer: TURE_FALSE_MAP[value],
        points: draft.points ?? 1,
      });
      return;
    }

    errors.push({
      question: draft.number,
      message: `${label}: tipe soal tidak dikenali (butuh opsi A-E, JAWABAN: BENAR/SALAH, atau ISIAN)`,
    });
  };

  for (const line of lines) {
    const numberMatch = line.match(RE_NUMBER);
    const optionMatch = line.match(RE_OPTION);

    if (numberMatch && !optionMatch) {
      // Mulai soal baru
      finalize(current);
      lastNumber = Number(numberMatch[1]);
      current = {
        number: lastNumber,
        text: numberMatch[2],
        options: [],
        hasTrueFalseMarker: false,
      };
      continue;
    }

    if (optionMatch && current) {
      current.options.push(optionMatch[2].trim());
      continue;
    }

    if (RE_ISIAN.test(line) && current) {
      current.isian = line.match(RE_ISIAN)![1];
      continue;
    }

    if (RE_ANSWER.test(line) && current) {
      current.answer = line.match(RE_ANSWER)![1];
      continue;
    }

    if (RE_POINTS.test(line) && current) {
      const points = Number(line.match(RE_POINTS)![1]);
      if (points >= 1 && points <= 100) current.points = points;
      continue;
    }

    if (RE_TF_MARKER.test(line) && current) {
      current.hasTrueFalseMarker = true;
      continue;
    }

    // Baris teks biasa: lanjutan soal berjalan, atau mulai soal tanpa nomor
    if (current) {
      current.text += (current.text ? ' ' : '') + line;
    } else {
      current = { number: 0, text: line, options: [], hasTrueFalseMarker: false };
    }
  }

  finalize(current);
  return { drafts, errors };
}

const importQuestionSchema = z.object({
  type: z.enum(['multiple_choice', 'true_false', 'short_answer']),
  questionText: z.string().trim().min(1).max(2000),
  points: z.number().int().min(1).max(100),
  options: z.array(z.string().trim().min(1).max(500)).min(2).max(5).optional(),
  correctAnswer: z.union([z.number().int().min(0).max(1), z.string().trim().min(1).max(500)]),
});

/** Baca .docx lalu parse isinya menjadi draft soal tervalidasi */
export async function parseQuestionDocx(buffer: Buffer): Promise<ParsedQuestionResult> {
  const text = await readDocxText(buffer);
  const { drafts, errors } = parseQuestionText(text);

  const validDrafts: QuestionDraft[] = [];
  for (let i = 0; i < drafts.length; i += 1) {
    const parsed = importQuestionSchema.safeParse(drafts[i]);
    if (parsed.success) {
      validDrafts.push(parsed.data as QuestionDraft);
    } else {
      const issue = parsed.error.issues[0];
      errors.push({
        question: i + 1,
        message: `soal #${i + 1}: ${issue.message}`,
      });
    }
  }

  return { drafts: validDrafts, errors };
}
