import type { CookieOptions, Request, Response } from 'express';
import { env } from '../config/env';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../middlewares/auth';
import { authService, Session } from '../services/authService';

const base: CookieOptions = {
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: 'strict',
};

function setSessionCookies(res: Response, s: Session): void {
  res.cookie(ACCESS_COOKIE, s.accessToken, { ...base, path: '/api', maxAge: env.ACCESS_TOKEN_TTL_MIN * 60_000 });
  res.cookie(REFRESH_COOKIE, s.refreshToken, { ...base, path: '/api/auth', expires: s.refreshExpiresAt });
}

function clearSessionCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, { ...base, path: '/api' });
  res.clearCookie(REFRESH_COOKIE, { ...base, path: '/api/auth' });
}

export const authController = {
  async login(req: Request, res: Response) {
    const session = await authService.login(req.body.email, req.body.password, req.ip);
    setSessionCookies(res, session);
    res.json({ user: session.user });
  },

  async refresh(req: Request, res: Response) {
    try {
      const session = await authService.refresh(req.cookies?.[REFRESH_COOKIE]);
      setSessionCookies(res, session);
      res.json({ user: session.user });
    } catch (e) {
      clearSessionCookies(res);
      throw e;
    }
  },

  async logout(req: Request, res: Response) {
    await authService.logout(req.cookies?.[REFRESH_COOKIE], req.user?.id);
    clearSessionCookies(res);
    res.status(204).end();
  },

  async me(req: Request, res: Response) {
    res.json({ user: await authService.me(req.user!.id) });
  },

  async changePassword(req: Request, res: Response) {
    await authService.changePassword(req.user!.id, req.body.currentPassword, req.body.newPassword);
    clearSessionCookies(res);
    res.status(204).end();
  },
};
