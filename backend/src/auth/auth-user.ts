import { Role } from '@prisma/client';

export interface AuthUser {
  id: string;
  name: string;
  role: Role;
}

declare module 'express' {
  interface Request {
    user?: AuthUser;
  }
}
