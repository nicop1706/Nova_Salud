import { z } from 'zod';
import { cleanText, password } from './common';

export const loginSchema = z.object({
  email: z.string().email('Correo inválido').max(120).transform((s) => s.toLowerCase().trim()),
  password: z.string().min(1, 'Ingresa tu contraseña').max(200),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: password,
});

export const createUserSchema = z.object({
  email: z.string().email('Correo inválido').max(120).transform((s) => s.toLowerCase().trim()),
  name: cleanText(100),
  role: z.enum(['ADMIN', 'SELLER', 'WAREHOUSE']),
  password,
});

export const updateUserSchema = z.object({
  name: cleanText(100).optional(),
  role: z.enum(['ADMIN', 'SELLER', 'WAREHOUSE']).optional(),
  active: z.boolean().optional(),
});

export const resetPasswordSchema = z.object({ newPassword: password });
