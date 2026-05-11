import { ZodError } from 'zod';
/**
 * Middleware factory: parse dan validasi req.body menggunakan Zod schema.
 * Jika valid, req.body akan berisi nilai yang sudah di-parse (termasuk default & transform).
 * Jika gagal, langsung balas 400 dengan daftar error yang detail.
 */
export function validateBody(schema) {
    return (req, res, next) => {
        try {
            req.body = schema.parse(req.body);
            next();
        }
        catch (err) {
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
