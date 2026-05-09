const jwt = require('jsonwebtoken');
const supabase = require('../config/supabase');

const { SUPABASE_JWT_SECRET } = process.env;

if (!SUPABASE_JWT_SECRET) {
  throw new Error('Missing SUPABASE_JWT_SECRET in environment variables');
}

function verifyJwt(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header Bearer token wajib disertakan' });
  }

  const token = authHeader.split(' ')[1];

  jwt.verify(token, SUPABASE_JWT_SECRET, async (err, payload) => {
    if (err) {
      return res.status(401).json({ error: 'Token tidak valid atau kadaluwarsa' });
    }

    try {
      // payload.sub usually contains the user UUID from Supabase Auth
      const userId = payload.sub;

      const { data: user, error } = await supabase
        .from('tenant_users')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error || !user) {
        return res.status(401).json({ error: 'User tidak ditemukan di tenant_users' });
      }

      if (!user.is_active) {
        return res.status(403).json({ error: 'User tidak aktif' });
      }

      // Attach full user profile from tenant_users to req.user
      req.user = user;
      next();
    } catch (dbError) {
      next(dbError);
    }
  });
}

function authorizeRole(requiredRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'User belum terautentikasi' });
    }

    const allowedRoles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Role tidak memiliki izin untuk endpoint ini' });
    }

    next();
  };
}

module.exports = {
  verifyJwt,
  authorizeRole,
};
