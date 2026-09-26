import type { Request, Response } from 'express';
import { authService } from './auth.service';
import { toPublicUser } from '../../utils/user.serializer';
import { sendSuccess } from '../../utils/response';
import type { SignInInput } from './auth.schema';

export const signIn = async (req: Request, res: Response): Promise<void> => {
  const input = req.body as SignInInput;
  const { user, accessToken, refreshToken } = await authService.login(input);

  sendSuccess(res, {
    message: 'Berhasil masuk',
    data: { user: toPublicUser(user), accessToken, refreshToken },
  });
};

export const refresh = async (req: Request, res: Response): Promise<void> => {
  const { refreshToken } = req.body as { refreshToken: string };
  const session = await authService.refreshSession(refreshToken);

  sendSuccess(res, {
    message: 'Token berhasil diperbarui',
    data: { accessToken: session.accessToken, refreshToken: session.refreshToken },
  });
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  const { refreshToken } = req.body as { refreshToken: string };
  await authService.logout(refreshToken);

  sendSuccess(res, { message: 'Berhasil keluar' });
};

export const me = async (req: Request, res: Response): Promise<void> => {
  const user = await authService.getCurrentUser(req.user!.id);

  sendSuccess(res, { message: 'Profil user', data: toPublicUser(user) });
};
