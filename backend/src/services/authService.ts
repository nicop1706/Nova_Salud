import bcrypt from 'bcryptjs';
import { env } from '../config/env';
import { userRepository, UserRow } from '../repositories/userRepository';
import { AppError, unauthorized } from '../utils/errors';
import { hashToken, signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { audit } from './auditService';
import type { AuthUser } from '../types/express';

// Hash válido de una contraseña aleatoria: se usa para igualar los tiempos de respuesta
// cuando el usuario no existe (evita enumeración de usuarios por temporización).
const DUMMY_HASH = bcrypt.hashSync('no-such-user-password', 10);

export const toAuthUser = (u: Pick<UserRow, 'id' | 'email' | 'name' | 'role'>): AuthUser => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
});

export interface Session {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

async function issueSession(user: AuthUser): Promise<Session> {
  const accessToken = signAccessToken(user);
  const { token: refreshToken, expiresAt } = signRefreshToken(user.id);
  await userRepository.insertRefresh(user.id, hashToken(refreshToken), expiresAt);
  return { user, accessToken, refreshToken, refreshExpiresAt: expiresAt };
}

export const authService = {
  async login(email: string, password: string, ip?: string): Promise<Session> {
    const user = await userRepository.findByEmail(email);

    if (!user || !user.active) {
      await bcrypt.compare(password, DUMMY_HASH);
      await audit({ action: 'LOGIN_FALLIDO', entity: 'auth', detail: { email }, ip });
      throw unauthorized('Correo o contraseña incorrectos', 'CREDENCIALES_INVALIDAS');
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
      throw new AppError(423, 'CUENTA_BLOQUEADA', `Cuenta bloqueada temporalmente por intentos fallidos. Intenta en ${mins} min.`);
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      const failed = user.failedLogins + 1;
      const lock = failed >= env.LOGIN_MAX_FAILED_ATTEMPTS;
      await userRepository.registerFailure(user.id, lock ? 0 : failed, lock ? new Date(Date.now() + env.LOGIN_LOCK_MINUTES * 60_000) : null);
      await audit({ userId: user.id, action: lock ? 'CUENTA_BLOQUEADA' : 'LOGIN_FALLIDO', entity: 'auth', entityId: user.id, ip });
      throw unauthorized('Correo o contraseña incorrectos', 'CREDENCIALES_INVALIDAS');
    }

    await userRepository.registerSuccess(user.id);
    await audit({ userId: user.id, action: 'LOGIN', entity: 'auth', entityId: user.id, ip });
    return issueSession(toAuthUser(user));
  },

  /** Rota el refresh token. Si se reutiliza uno ya revocado se asume robo y se cierran todas las sesiones. */
  async refresh(refreshToken: string | undefined): Promise<Session> {
    if (!refreshToken) throw unauthorized('Sesión no iniciada', 'SIN_REFRESH');
    let userId: number;
    try {
      userId = verifyRefreshToken(refreshToken).userId;
    } catch {
      throw unauthorized('Sesión expirada', 'REFRESH_INVALIDO');
    }
    const hash = hashToken(refreshToken);
    const stored = await userRepository.findRefresh(hash);
    if (!stored) throw unauthorized('Sesión inválida', 'REFRESH_INVALIDO');
    if (stored.revokedAt) {
      await userRepository.revokeAllRefresh(userId);
      await audit({ userId, action: 'REFRESH_REUTILIZADO', entity: 'auth', entityId: userId });
      throw unauthorized('Sesión inválida', 'REFRESH_REUTILIZADO');
    }
    if (new Date(stored.expiresAt).getTime() < Date.now()) throw unauthorized('Sesión expirada', 'REFRESH_INVALIDO');

    const user = await userRepository.findById(userId);
    if (!user || !user.active) throw unauthorized('Usuario inactivo', 'USUARIO_INACTIVO');

    await userRepository.revokeRefresh(hash);
    return issueSession(toAuthUser(user));
  },

  async logout(refreshToken: string | undefined, userId?: number): Promise<void> {
    if (refreshToken) await userRepository.revokeRefresh(hashToken(refreshToken));
    if (userId) await audit({ userId, action: 'LOGOUT', entity: 'auth', entityId: userId });
  },

  async me(id: number): Promise<AuthUser> {
    const user = await userRepository.findById(id);
    if (!user || !user.active) throw unauthorized('Usuario inactivo', 'USUARIO_INACTIVO');
    return toAuthUser(user);
  },

  async changePassword(userId: number, currentPassword: string, newPassword: string): Promise<void> {
    const user = await userRepository.findById(userId);
    if (!user) throw unauthorized();
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new AppError(400, 'CONTRASENA_ACTUAL_INCORRECTA', 'La contraseña actual es incorrecta');
    }
    await userRepository.setPassword(userId, await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS));
    await userRepository.revokeAllRefresh(userId);
    await audit({ userId, action: 'CAMBIO_CONTRASENA', entity: 'users', entityId: userId });
  },
};
