import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { ErrorCode } from '../common/errors/error-codes';
import { PrismaService } from '../prisma/prisma.service';
import { IS_PUBLIC_KEY } from './public.decorator';

const USER_ID_HEADER = 'x-user-id';

@Injectable()
export class CurrentUserGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const headerValue = request.headers[USER_ID_HEADER];
    const userId = Array.isArray(headerValue) ? headerValue[0] : headerValue;

    if (!userId) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHENTICATED,
        message: `Missing "${USER_ID_HEADER}" header.`,
      });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true },
    });

    if (!user) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHENTICATED,
        message: 'User not found for the provided x-user-id.',
      });
    }

    request.user = user;
    return true;
  }
}
