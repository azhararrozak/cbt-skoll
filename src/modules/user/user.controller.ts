import type { Request, Response } from 'express';
import { userService } from './user.service';
import { toPublicUser } from '../../utils/user.serializer';
import { sendSuccess } from '../../utils/response';
import {
  idParamSchema,
  listUsersSchema,
  type CreateUserInput,
  type UpdateUserInput,
} from './user.schema';

export const listUsers = async (req: Request, res: Response): Promise<void> => {
  const params = listUsersSchema.parse(req.query);
  const { rows, totalItems } = await userService.list(params);

  sendSuccess(res, {
    message: 'Daftar user',
    data: rows.map(toPublicUser),
    pagination: {
      page: params.page,
      limit: params.limit,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / params.limit)),
    },
  });
};

export const getUser = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamSchema.parse(req.params);
  const user = await userService.getById(id);

  sendSuccess(res, { message: 'Detail user', data: toPublicUser(user) });
};

export const createUser = async (req: Request, res: Response): Promise<void> => {
  const input = req.body as CreateUserInput;
  const user = await userService.create(input, req.user!.role);

  sendSuccess(res, {
    status: 201,
    message: 'User berhasil dibuat',
    data: toPublicUser(user),
  });
};

export const updateUser = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamSchema.parse(req.params);
  const input = req.body as UpdateUserInput;
  const user = await userService.update(id, input, req.user!.id);

  sendSuccess(res, {
    message: 'User berhasil diperbarui',
    data: toPublicUser(user),
  });
};

export const deleteUser = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamSchema.parse(req.params);
  await userService.remove(id, req.user!.id);

  sendSuccess(res, { message: 'User berhasil dihapus' });
};
