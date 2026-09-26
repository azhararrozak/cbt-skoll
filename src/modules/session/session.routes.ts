import { Router } from 'express';
import {
  finishSession,
  forceFinishSession,
  getSession,
  getSessionResult,
  listMySessions,
  resetSession,
  submitAnswer,
  toggleFlag,
} from './session.controller';
import { authMiddleware, authorize } from '../../middleware/auth.middleware';
import { validateBody } from '../../middleware/validate.middleware';
import { submitAnswerSchema, toggleFlagSchema } from './session.schema';

const router = Router();

router.use(authMiddleware);

// Riwayat sesi milik siswa (harus sebelum route /:id)
router.get('/mine', authorize('siswa'), listMySessions);

router.get('/:id', getSession);
router.get('/:id/result', getSessionResult);
router.post('/:id/answers', authorize('siswa'), validateBody(submitAnswerSchema), submitAnswer);
router.post('/:id/flags', authorize('siswa'), validateBody(toggleFlagSchema), toggleFlag);
router.post('/:id/finish', authorize('siswa'), finishSession);
// Aksi pengelolaan dari sisi admin/guru
router.post('/:id/force-finish', authorize('admin', 'guru'), forceFinishSession);
router.post('/:id/reset', authorize('admin', 'guru'), resetSession);

export default router;
