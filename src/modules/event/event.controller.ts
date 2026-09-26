import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/response';
import { getUploadedBuffer } from '../../middleware/upload.middleware';
import { idParamSchema, documentQuerySchema } from './event.schema';
import { eventService } from './event.service';
import type { CreateEventInput, UpdateEventInput } from './event.schema';

export const listEvents = async (req: Request, res: Response): Promise<void> => {
  const rows = await eventService.list(req.user!);
  sendSuccess(res, { message: 'Daftar event ujian', data: rows });
};

export const getEvent = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamSchema.parse(req.params);
  const data = await eventService.getById(id, req.user!);
  sendSuccess(res, { message: 'Detail event', data });
};

export const createEvent = async (req: Request, res: Response): Promise<void> => {
  const input = req.body as CreateEventInput;
  const event = await eventService.create(input, req.user!);
  sendSuccess(res, { status: 201, message: 'Event berhasil dibuat', data: event });
};

export const updateEvent = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamSchema.parse(req.params);
  const input = req.body as UpdateEventInput;
  const event = await eventService.update(id, input, req.user!);
  sendSuccess(res, { message: 'Event berhasil diperbarui', data: event });
};

export const deleteEvent = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamSchema.parse(req.params);
  await eventService.remove(id, req.user!);
  sendSuccess(res, { message: 'Event berhasil dihapus' });
};

export const uploadEventLogo = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamSchema.parse(req.params);
  const buffer = getUploadedBuffer(req);
  const event = await eventService.setLogo(id, buffer, req.file!.mimetype, req.user!);
  sendSuccess(res, { message: 'Logo kop berhasil diunggah', data: { logo: event.logo } });
};

export const removeEventLogo = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamSchema.parse(req.params);
  const event = await eventService.removeLogo(id, req.user!);
  sendSuccess(res, { message: 'Logo kop dihapus', data: { logo: event.logo } });
};

function sendDocument(res: Response, filename: string, buffer: Buffer, contentType: string): void {
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}

export const downloadKartuPeserta = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamSchema.parse(req.params);
  const { classId, format } = documentQuerySchema.parse(req.query);
  const { filename, buffer, contentType } = await eventService.kartuPeserta(id, classId, format, req.user!);
  sendDocument(res, filename, buffer, contentType);
};

export const downloadDaftarHadir = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamSchema.parse(req.params);
  const { classId, format } = documentQuerySchema.parse(req.query);
  const { filename, buffer, contentType } = await eventService.daftarHadir(id, classId!, format, req.user!);
  sendDocument(res, filename, buffer, contentType);
};

export const downloadNomorMeja = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamSchema.parse(req.params);
  const { classId, format } = documentQuerySchema.parse(req.query);
  const { filename, buffer, contentType } = await eventService.nomorMeja(id, classId!, format, req.user!);
  sendDocument(res, filename, buffer, contentType);
};
