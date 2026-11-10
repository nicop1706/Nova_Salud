import { z } from 'zod';
import { cleanText, optionalText, pagination } from './common';

const docNumberRule = (v: { docType: string; docNumber: string }, ctx: z.RefinementCtx) => {
  const rules: Record<string, [RegExp, string]> = {
    DNI: [/^\d{8}$/, 'El DNI debe tener 8 dígitos'],
    RUC: [/^(10|15|17|20)\d{9}$/, 'El RUC debe tener 11 dígitos y empezar con 10, 15, 17 o 20'],
    CE: [/^[A-Za-z0-9]{9,12}$/, 'El carné de extranjería debe tener entre 9 y 12 caracteres'],
  };
  const [re, msg] = rules[v.docType];
  if (!re.test(v.docNumber)) ctx.addIssue({ code: 'custom', path: ['docNumber'], message: msg });
};

export const customerSchema = z
  .object({
    docType: z.enum(['DNI', 'RUC', 'CE']).default('DNI'),
    docNumber: z.string().trim().min(1, 'Ingresa el documento').max(20),
    name: cleanText(150),
    phone: optionalText(30),
    email: z
      .string()
      .trim()
      .email('Correo inválido')
      .max(120)
      .nullish()
      .or(z.literal('').transform(() => null))
      .transform((v) => v ?? null),
  })
  .superRefine(docNumberRule);

export const customerListQuery = z.object({
  ...pagination,
  q: z.string().trim().max(80).optional(),
});

export const customerSearchQuery = z.object({
  q: z.string().trim().max(80).default(''),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});
