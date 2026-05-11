import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import supabase from '../config/supabase.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape of rows dari tabel tenant_users di Supabase */
export interface TenantUser {
  user_id: string;
  tenant_id: string;
  role: string;
  is_active: boolean;
  [key: string]: unknown; // kolom tambahan lainnya
}

/** Extend Express Request agar req.user tersedia di seluruh app */
declare global {
  namespace Express {
    interface Request {
      user?: TenantUser;
    }
  }
}

// ---------------------------------------------------------------------------
// Guard — env var wajib ada saat module di-load
// ---------------------------------------------------------------------------
const { SUPABASE_JWT_SECRET } = process.env;

if (!SUPABASE_JWT_SECRET) {
  throw new Error('Missing SUPABASE_JWT_SECRET in environment variables');
}

// ---------------------------------------------------------------------------
// Middleware: verifyJwt
// ---------------------------------------------------------------------------
export async function verifyJwt(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authorization header Bearer token wajib disertakan' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    // ---------------------------------------------------------------------------
    // TEST BYPASS: Mock user untuk keperluan development/testing UI
    // ---------------------------------------------------------------------------
    if (token === 'HARDCODED_STATIC_TOKEN_FOR_TESTING') {
      const { data: testUser } = await supabase
        .from('tenant_users')
        .select('*')
        .eq('role', 'owner')
        .eq('tenant_id', 'e001575e-70cf-4ec6-a6e3-1a390c44ed66') // Force specific tenant for consistency
        .limit(1)
        .maybeSingle();

      if (testUser) {
        req.user = testUser;
        return next();
      } else {
        return res.status(401).json({ error: 'Tidak ada data tenant_users untuk test bypass' });
      }
    }

    // Verifikasi token menggunakan Supabase Auth Client
    // Ini lebih handal karena mendukung berbagai algoritma (HS256, ES256)
    // dan memvalidasi langsung ke server Supabase jika diperlukan.
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !authUser) {
      console.error('[AuthMiddleware] Supabase Auth Error:', authError?.message || 'User not found');
      res.status(401).json({ error: 'Token tidak valid atau kadaluwarsa' });
      return;
    }

    const userId = authUser.id;

    // Fetch user profile from our tenant_users table
    const { data: user, error } = await supabase
      .from('tenant_users')
      .select('*')
      .eq('user_id', userId)
      .single<TenantUser>();

    if (error || !user) {
      console.error('[AuthMiddleware] User not found in tenant_users:', userId);
      res.status(401).json({ error: 'User tidak ditemukan di sistem tenant' });
      return;
    }

    if (!user.is_active) {
      res.status(403).json({ error: 'User tidak aktif' });
      return;
    }

    // Attach user profile to req.user
    req.user = user;
    next();
  } catch (err) {
    console.error('[AuthMiddleware] Unexpected Error:', err);
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Middleware: authorizeRole
// ---------------------------------------------------------------------------
export function authorizeRole(requiredRoles: string | string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'User belum terautentikasi' });
      return;
    }

    const allowedRoles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ error: 'Role tidak memiliki izin untuk endpoint ini' });
      return;
    }

    next();
  };
}
