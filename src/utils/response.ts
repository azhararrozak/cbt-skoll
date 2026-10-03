import type { Response } from 'express';

export interface PaginationMeta {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
}

interface SuccessOptions<T> {
  status?: number;
  message: string;
  data?: T;
  pagination?: PaginationMeta;
}

export const sendSuccess = <T>(res: Response, options: SuccessOptions<T>): void => {
  const body: Record<string, unknown> = {
    success: true,
    message: options.message,
  };
  if (options.data !== undefined) {
    body.data = options.data;
  }
  if (options.pagination) {
    body.pagination = options.pagination;
  }
  res.status(options.status ?? 200).json(body);
};
