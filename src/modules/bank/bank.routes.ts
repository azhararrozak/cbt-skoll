import { Router } from 'express';
import {
  createBank,
  createQuestion,
  deleteBank,
  deleteQuestion,
  getBank,
  listBanks,
  listQuestions,
  updateBank,
  updateQuestion,
} from './bank.controller';
import { authMiddleware, authorize } from '../../middleware/auth.middleware';
import { validateBody } from '../../middleware/validate.middleware';
import {
  createBankSchema,
  createQuestionSchema,
  updateBankSchema,
} from './bank.schema';

const router = Router();

// Bank soal hanya dikelola admin dan guru
router.use(authMiddleware, authorize('admin', 'guru'));

router.get('/', listBanks);
router.post('/', validateBody(createBankSchema), createBank);
router.get('/:id', getBank);
router.patch('/:id', validateBody(updateBankSchema), updateBank);
router.delete('/:id', deleteBank);

router.get('/:id/questions', listQuestions);
router.post('/:id/questions', validateBody(createQuestionSchema), createQuestion);
router.patch('/:id/questions/:questionId', validateBody(createQuestionSchema), updateQuestion);
router.delete('/:id/questions/:questionId', deleteQuestion);

export default router;
