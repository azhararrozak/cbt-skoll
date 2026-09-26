import { Router } from 'express';
import {
  downloadBankQuestionsTemplate,
  downloadClassesTemplate,
  downloadClassStudentsTemplate,
  downloadUsersTemplate,
  importBankQuestionsDocxFile,
  importClassesExcel,
  importClassStudentsExcel,
  importUsersExcel,
} from './import.controller';
import { authMiddleware, authorize } from '../../middleware/auth.middleware';
import { uploadDocx, uploadExcel } from '../../middleware/upload.middleware';

const router = Router();

router.use(authMiddleware);

// Template diunduh sebelum upload (admin & guru)
router.get('/users/template', authorize('admin', 'guru'), downloadUsersTemplate);
router.get('/classes/template', authorize('admin', 'guru'), downloadClassesTemplate);
router.get('/class-students/template', authorize('admin', 'guru'), downloadClassStudentsTemplate);
router.get('/bank-questions/template', authorize('admin', 'guru'), downloadBankQuestionsTemplate);

// Import massal: user hanya admin, kelas & siswa-per-kelas & soal admin & guru
router.post('/users', authorize('admin'), uploadExcel, importUsersExcel);
router.post('/classes', authorize('admin', 'guru'), uploadExcel, importClassesExcel);
router.post(
  '/class-students/:id',
  authorize('admin', 'guru'),
  uploadExcel,
  importClassStudentsExcel,
);
router.post(
  '/bank-questions/:id',
  authorize('admin', 'guru'),
  uploadDocx,
  importBankQuestionsDocxFile,
);

export default router;
