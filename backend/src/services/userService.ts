import bcrypt from 'bcryptjs';
import { env } from '../config/env';
import { userRepository } from '../repositories/userRepository';
import { auditReq } from './auditService';
import { conflict, notFound, badRequest } from '../utils/errors';
import type { Request } from 'express';

export const userService = {
  list: () => userRepository.list(),

  async create(req: Request, data: { email: string; name: string; role: string; password: string }) {
    if (await userRepository.findByEmail(data.email)) throw conflict('Ya existe un usuario con ese correo', undefined, 'CORREO_DUPLICADO');
    const user = await userRepository.create({
      email: data.email,
      name: data.name,
      role: data.role,
      passwordHash: await bcrypt.hash(data.password, env.BCRYPT_ROUNDS),
    });
    await auditReq(req, 'USUARIO_CREADO', 'users', user.id, { email: user.email, role: user.role });
    return user;
  },

  async update(req: Request, id: number, data: { name?: string; role?: string; active?: boolean }) {
    const current = await userRepository.findById(id);
    if (!current) throw notFound('Usuario no encontrado');
    if (id === req.user!.id && (data.active === false || (data.role && data.role !== 'ADMIN'))) {
      throw badRequest('No puedes quitarte tu propio acceso de administrador', undefined, 'AUTOBLOQUEO');
    }
    const user = await userRepository.update(id, data);
    if (data.active === false) await userRepository.revokeAllRefresh(id);
    await auditReq(req, 'USUARIO_ACTUALIZADO', 'users', id, data);
    return user;
  },

  async resetPassword(req: Request, id: number, newPassword: string) {
    if (!(await userRepository.findById(id))) throw notFound('Usuario no encontrado');
    await userRepository.setPassword(id, await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS));
    await userRepository.revokeAllRefresh(id);
    await auditReq(req, 'CONTRASENA_RESTABLECIDA', 'users', id);
  },
};
