import { Router } from 'express';
import { downloadBackup, restoreFromBackup } from './backup.controller';
import { authMiddleware, authorize } from '../../middleware/auth.middleware';
import { uploadJson } from '../../middleware/upload.middleware';

const router = Router();

// Backup & restore hanya untuk admin
router.use(authMiddleware, authorize('admin'));

router.get('/', downloadBackup);
router.post('/restore', uploadJson, restoreFromBackup);

export default router;
