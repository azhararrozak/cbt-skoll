import { Router } from 'express';
import { signIn, refresh, logout, me } from './auth.controller';
import { authMiddleware, authorize } from '../../middleware/auth.middleware';
import { validateBody } from '../../middleware/validate.middleware';
import { authLimiter } from '../../middleware/rateLimit.middleware';
import { sendSuccess } from '../../utils/response';
import { signInSchema, refreshSchema } from './auth.schema';

const router = Router();

// Public routes (dengan rate limit lebih ketat)
// Pendaftaran akun siswa dilakukan oleh admin/guru (buat akun atau import Excel),
// sehingga tidak ada endpoint signup publik.
router.post('/signin', authLimiter, validateBody(signInSchema), signIn);
router.post('/refresh', authLimiter, validateBody(refreshSchema), refresh);
router.post('/logout', validateBody(refreshSchema), logout);

// Protected routes
router.get('/me', authMiddleware, me);
router.get('/admin-only', authMiddleware, authorize('admin'), (_req, res) => {
  sendSuccess(res, { message: 'Hanya admin yang bisa melihat pesan ini' });
});
router.get('/protected', authMiddleware, (_req, res) => {
  sendSuccess(res, { message: 'Route protected berhasil diakses' });
});

export default router;
