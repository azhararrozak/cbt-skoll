import { Router } from 'express';
import { listUsers, getUser, createUser, updateUser, deleteUser } from './user.controller';
import { authMiddleware, authorize } from '../../middleware/auth.middleware';
import { validateBody } from '../../middleware/validate.middleware';
import { createUserSchema, updateUserSchema } from './user.schema';

const router = Router();

// List & detail user bisa diakses admin dan guru (guru butuh data siswa)
router.get('/', authMiddleware, authorize('admin', 'guru'), listUsers);
router.get('/:id', authMiddleware, authorize('admin', 'guru'), getUser);

// Membuat user: admin bisa semua role, guru hanya bisa membuat akun siswa
router.post('/', authMiddleware, authorize('admin', 'guru'), validateBody(createUserSchema), createUser);

// Update & hapus user hanya admin
router.patch('/:id', authMiddleware, authorize('admin'), validateBody(updateUserSchema), updateUser);
router.delete('/:id', authMiddleware, authorize('admin'), deleteUser);

export default router;
