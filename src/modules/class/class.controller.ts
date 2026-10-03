import type { Request, Response } from 'express';
import { classService } from './class.service';
import { sendSuccess } from '../../utils/response';
import {
  classMemberParamSchema,
  idParamSchema,
  listClassesSchema,
  type AddClassMembersInput,
  type CreateClassInput,
  type UpdateClassInput,
} from './class.schema';

export const listClasses = async (req: Request, res: Response): Promise<void> => {
  const params = listClassesSchema.parse(req.query);
  const { rows, totalItems } = await classService.list(params, req.user!);

  sendSuccess(res, {
    message: 'Daftar kelas',
    data: rows,
    pagination: {
      page: params.page,
      limit: params.limit,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / params.limit)),
    },
  });
};

export const getClass = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamSchema.parse(req.params);
  const kelas = await classService.getById(id, req.user!);

  sendSuccess(res, { message: 'Detail kelas', data: kelas });
};

export const createClass = async (req: Request, res: Response): Promise<void> => {
  const input = req.body as CreateClassInput;
  const kelas = await classService.create(input, req.user!);

  sendSuccess(res, { status: 201, message: 'Kelas berhasil dibuat', data: kelas });
};

export const updateClass = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamSchema.parse(req.params);
  const input = req.body as UpdateClassInput;
  const kelas = await classService.update(id, input, req.user!);

  sendSuccess(res, { message: 'Kelas berhasil diperbarui', data: kelas });
};

export const deleteClass = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamSchema.parse(req.params);
  await classService.remove(id, req.user!);

  sendSuccess(res, { message: 'Kelas berhasil dihapus' });
};

export const listClassMembers = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamSchema.parse(req.params);
  const members = await classService.listMembers(id, req.user!);

  sendSuccess(res, { message: 'Daftar siswa di kelas', data: members });
};

export const addClassMembers = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamSchema.parse(req.params);
  const input = req.body as AddClassMembersInput;
  const added = await classService.addMembers(id, input, req.user!);

  sendSuccess(res, {
    message: `${added} siswa berhasil ditambahkan ke kelas`,
    data: { added },
  });
};

export const removeClassMember = async (req: Request, res: Response): Promise<void> => {
  const { id, studentId } = classMemberParamSchema.parse(req.params);
  await classService.removeMember(id, studentId, req.user!);

  sendSuccess(res, { message: 'Siswa berhasil dikeluarkan dari kelas' });
};
