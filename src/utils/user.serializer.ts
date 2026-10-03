import type { User } from '../models/user.model';

export type PublicUser = Pick<User, 'id' | 'name' | 'email' | 'role' | 'createdAt' | 'updatedAt'>;

export const toPublicUser = (user: PublicUser): PublicUser => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});
