const { ZodError } = require('zod');

function validateBody(schema) {
  return (req, res, next) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({
          error: 'Validasi data gagal',
          issues: err.errors.map(e => ({ path: e.path.join('.'), message: e.message })),
        });
      }
      next(err);
    }
  };
}

module.exports = { validateBody };
