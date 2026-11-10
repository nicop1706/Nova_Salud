import 'express-serve-static-core';

export type Role = 'ADMIN' | 'SELLER' | 'WAREHOUSE';

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: Role;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}
