import { Router } from 'express';
import {
  finishSession,
  getSession,
  getSessionResult,
  listMySessions,
  submitAnswer,
} from './session.controller';
import { authMiddleware, authorize } from '../../middleware/auth.middleware';
import { validateBody } from '../../middleware/validate.middleware';
import { submitAnswerSchema } from './session.schema';

const router = Router();

router.use(authMiddleware);

// Riwayat sesi milik siswa (harus sebelum route /:id)
router.get('/mine', authorize('siswa'), listMySessions);

router.get('/:id', getSession);
router.get('/:id/result', getSessionResult);
router.post('/:id/answers', authorize('siswa'), validateBody(submitAnswerSchema), submitAnswer);
router.post('/:id/finish', authorize('siswa'), finishSession);

export default router;
