import { Router } from 'express';
import {
  createExam,
  deleteExam,
  getExam,
  getExamResults,
  listAvailableExams,
  listExams,
  regenerateToken,
  startExam,
  updateExam,
} from './exam.controller';
import { authMiddleware, authorize } from '../../middleware/auth.middleware';
import { validateBody } from '../../middleware/validate.middleware';
import { createExamSchema, startExamSchema, updateExamSchema } from './exam.schema';

const router = Router();

router.use(authMiddleware);

// Siswa: daftar ujian tersedia (harus sebelum route /:id)
router.get('/available', authorize('siswa'), listAvailableExams);

// Kelola ujian (admin & guru)
router.get('/', authorize('admin', 'guru'), listExams);
router.post('/', authorize('admin', 'guru'), validateBody(createExamSchema), createExam);
router.get('/:id', authorize('admin', 'guru'), getExam);
router.patch('/:id', authorize('admin', 'guru'), validateBody(updateExamSchema), updateExam);
router.delete('/:id', authorize('admin', 'guru'), deleteExam);
router.post('/:id/regenerate-token', authorize('admin', 'guru'), regenerateToken);

// Hasil ujian (admin & guru)
router.get('/:id/results', authorize('admin', 'guru'), getExamResults);

// Siswa: mulai / lanjutkan ujian dengan token
router.post('/:id/start', authorize('siswa'), validateBody(startExamSchema), startExam);

export default router;
