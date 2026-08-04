import { Router } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../prisma.js';
import { authRequired } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../lib/http.js';
import {
  signAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  hashToken,
} from '../lib/jwt.js';

const router = Router();
const REFRESH_COOKIE = 'sms_refresh';

function setRefreshCookie(res: import('express').Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: (Number(process.env.REFRESH_TOKEN_TTL_DAYS || 7)) * 86400_000,
    path: '/api/auth',
  });
}

async function issueTokens(res: import('express').Response, user: { id: number; role: any; name: string }) {
  const accessToken = signAccessToken({ id: user.id, role: user.role, name: user.name });
  const { token, hash, expiresAt } = generateRefreshToken(user.id);
  await prisma.refreshToken.create({ data: { userId: user.id, tokenHash: hash, expiresAt } });
  setRefreshCookie(res, token);
  return accessToken;
}

/** POST /api/auth/login */
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) throw new AppError(400, 'Email and password required');
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.active || !bcrypt.compareSync(password, user.passwordHash))
      throw new AppError(401, 'Invalid credentials');

    const accessToken = await issueTokens(res, user);
    res.json({
      accessToken,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  })
);

/** POST /api/auth/refresh — rotate refresh token, issue new access token */
router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) throw new AppError(401, 'No refresh token');

    let payload: { sub: number };
    try {
      payload = verifyRefreshToken(token);
    } catch {
      throw new AppError(401, 'Invalid refresh token');
    }

    const hash = hashToken(token);
    const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hash } });
    if (!stored || stored.revoked || stored.expiresAt < new Date())
      throw new AppError(401, 'Refresh token expired');

    // rotate: revoke old, issue new
    await prisma.refreshToken.update({ where: { id: stored.id }, data: { revoked: true } });
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.active) throw new AppError(401, 'User not found');

    const accessToken = await issueTokens(res, user);
    res.json({
      accessToken,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  })
);

/** POST /api/auth/logout — revoke current refresh token */
router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (token) {
      await prisma.refreshToken.updateMany({
        where: { tokenHash: hashToken(token) },
        data: { revoked: true },
      });
    }
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
    res.json({ ok: true });
  })
);

/** GET /api/auth/me */
router.get(
  '/me',
  authRequired,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, name: true, email: true, role: true, phone: true, photoUrl: true },
    });
    if (!user) throw new AppError(404, 'User not found');
    res.json(user);
  })
);

/** POST /api/auth/change-password */
router.post(
  '/change-password',
  authRequired,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (!newPassword || newPassword.length < 6) throw new AppError(400, 'New password must be 6+ chars');
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user || !bcrypt.compareSync(currentPassword || '', user.passwordHash))
      throw new AppError(401, 'Current password is incorrect');
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: bcrypt.hashSync(newPassword, 10) },
    });
    res.json({ ok: true });
  })
);

export default router;
