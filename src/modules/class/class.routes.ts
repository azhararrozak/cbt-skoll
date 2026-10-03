import { Router } from 'express';
import {
  addClassMembers,
  createClass,
  deleteClass,
  getClass,
  listClassMembers,
  listClasses,
  removeClassMember,
  updateClass,
} from './class.controller';
import { authMiddleware, authorize } from '../../middleware/auth.middleware';
import { validateBody } from '../../middleware/validate.middleware';
import {
  addClassMembersSchema,
  createClassSchema,
  updateClassSchema,
} from './class.schema';

const router = Router();

// Kelas hanya dikelola admin dan guru
router.use(authMiddleware, authorize('admin', 'guru'));

router.get('/', listClasses);
router.post('/', validateBody(createClassSchema), createClass);
router.get('/:id', getClass);
router.patch('/:id', validateBody(updateClassSchema), updateClass);
router.delete('/:id', deleteClass);

router.get('/:id/students', listClassMembers);
router.post('/:id/students', validateBody(addClassMembersSchema), addClassMembers);
router.delete('/:id/students/:studentId', removeClassMember);

export default router;
