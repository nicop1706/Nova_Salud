export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, details?: unknown, code = 'SOLICITUD_INVALIDA') =>
  new AppError(400, code, message, details);
export const unauthorized = (message = 'No autenticado', code = 'NO_AUTENTICADO') =>
  new AppError(401, code, message);
export const forbidden = (message = 'No tienes permisos para esta acción', code = 'PROHIBIDO') =>
  new AppError(403, code, message);
export const notFound = (message = 'Recurso no encontrado', code = 'NO_ENCONTRADO') =>
  new AppError(404, code, message);
export const conflict = (message: string, details?: unknown, code = 'CONFLICTO') =>
  new AppError(409, code, message, details);
