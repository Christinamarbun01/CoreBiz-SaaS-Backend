import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

/**
 * Middleware factory: parse dan validasi req.body menggunakan Zod schema.
 * Jika valid, req.body akan berisi nilai yang sudah di-parse (termasuk default & transform).
 * Jika gagal, langsung balas 400 dengan daftar error yang detail.
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body) as T;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validasi data gagal',
          issues: err.errors.map((e) => ({
            path: e.path.join('.'),
            message: e.message,
          })),
        });
        return;
      }
      next(err);
    }
  };
}
