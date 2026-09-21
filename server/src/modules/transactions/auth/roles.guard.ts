import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import { Reflector } from '@nestjs/core';

import { ROLES_KEY } from './roles.decorator.js';

type AuthenticatedUser = {
  role: 'ADMIN' | 'EMPLOYEE';
};

type AuthenticatedRequest = {
  user: AuthenticatedUser;
};

type Role = AuthenticatedUser['role'];

const roleHierarchy: Record<Role, number> = {
  ADMIN: 2,
  EMPLOYEE: 1,
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const user = request.user;

    return (
      roleHierarchy[user.role] >=
      Math.max(...requiredRoles.map((role) => roleHierarchy[role]))
    );
  }
}
