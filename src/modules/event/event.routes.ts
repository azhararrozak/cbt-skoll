import { Router } from 'express';
import {
  createEvent,
  deleteEvent,
  downloadDaftarHadir,
  downloadKartuPeserta,
  downloadNomorMeja,
  getEvent,
  listEvents,
  removeEventLogo,
  updateEvent,
  uploadEventLogo,
} from './event.controller';
import { authMiddleware, authorize } from '../../middleware/auth.middleware';
import { uploadImage } from '../../middleware/upload.middleware';
import { validateBody } from '../../middleware/validate.middleware';
import { createEventSchema, updateEventSchema } from './event.schema';

const router = Router();

router.use(authMiddleware, authorize('admin', 'guru'));

router.get('/', listEvents);
router.post('/', validateBody(createEventSchema), createEvent);

router.get('/:id', getEvent);
router.patch('/:id', validateBody(updateEventSchema), updateEvent);
router.delete('/:id', deleteEvent);

// Logo kop sekolah
router.post('/:id/logo', uploadImage, uploadEventLogo);
router.delete('/:id/logo', removeEventLogo);

// Dokumen cetak
router.get('/:id/documents/kartu-peserta', downloadKartuPeserta);
router.get('/:id/documents/daftar-hadir', downloadDaftarHadir);
router.get('/:id/documents/nomor-meja', downloadNomorMeja);

export default router;
