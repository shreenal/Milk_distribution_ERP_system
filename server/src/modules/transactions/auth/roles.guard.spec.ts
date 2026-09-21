import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Reflector } from '@nestjs/core';

import { RolesGuard } from './roles.guard.js';

import { ROLES_KEY } from './roles.decorator.js';

describe('RolesGuard', () => {
  const reflector = {
    getAllAndOverride: vi.fn(),
  };

  const rolesGuard = new RolesGuard(reflector as unknown as Reflector);

  const createContext = (role: 'ADMIN' | 'EMPLOYEE') => {
    const handler = {};
    const controllerClass = {};

    return {
      getHandler: vi.fn().mockReturnValue(handler),
      getClass: vi.fn().mockReturnValue(controllerClass),
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            role,
          },
        }),
      }),
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('when no roles are required', () => {
    it('allows the request', () => {
      reflector.getAllAndOverride.mockReturnValue(undefined);

      const context = createContext('EMPLOYEE');

      expect(rolesGuard.canActivate(context as any)).toBe(true);

      expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
    });
  });

  describe('EMPLOYEE requirement', () => {
    it('allows an EMPLOYEE user', () => {
      reflector.getAllAndOverride.mockReturnValue(['EMPLOYEE']);

      const context = createContext('EMPLOYEE');

      expect(rolesGuard.canActivate(context as any)).toBe(true);
    });

    it('allows an ADMIN user', () => {
      reflector.getAllAndOverride.mockReturnValue(['EMPLOYEE']);

      const context = createContext('ADMIN');

      expect(rolesGuard.canActivate(context as any)).toBe(true);
    });
  });

  describe('ADMIN requirement', () => {
    it('allows an ADMIN user', () => {
      reflector.getAllAndOverride.mockReturnValue(['ADMIN']);

      const context = createContext('ADMIN');

      expect(rolesGuard.canActivate(context as any)).toBe(true);
    });

    it('denies an EMPLOYEE user', () => {
      reflector.getAllAndOverride.mockReturnValue(['ADMIN']);

      const context = createContext('EMPLOYEE');

      expect(rolesGuard.canActivate(context as any)).toBe(false);
    });

    it('allows the request when the required roles array is empty', () => {
      reflector.getAllAndOverride.mockReturnValue([]);

      const context = createContext('EMPLOYEE');

      expect(rolesGuard.canActivate(context as any)).toBe(true);
    });
  });

  describe('multiple required roles', () => {
    it('allows ADMIN when EMPLOYEE and ADMIN are required', () => {
      reflector.getAllAndOverride.mockReturnValue(['EMPLOYEE', 'ADMIN']);

      const context = createContext('ADMIN');

      expect(rolesGuard.canActivate(context as any)).toBe(true);
    });

    it('denies EMPLOYEE when EMPLOYEE and ADMIN are required', () => {
      reflector.getAllAndOverride.mockReturnValue(['EMPLOYEE', 'ADMIN']);

      const context = createContext('EMPLOYEE');

      expect(rolesGuard.canActivate(context as any)).toBe(false);
    });
  });

  describe('metadata resolution', () => {
    it('checks handler metadata before class metadata', () => {
      reflector.getAllAndOverride.mockReturnValue(['ADMIN']);

      const context = createContext('ADMIN');

      rolesGuard.canActivate(context as any);

      expect(reflector.getAllAndOverride).toHaveBeenLastCalledWith(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
    });

    it('uses handler metadata before class metadata', () => {
      const context = createContext('ADMIN');

      const handler = context.getHandler();
      const controllerClass = context.getClass();

      reflector.getAllAndOverride.mockImplementation(
        (_key: string, targets: unknown[]) => {
          expect(targets[0]).toBe(handler);
          expect(targets[1]).toBe(controllerClass);

          return ['ADMIN'];
        },
      );

      expect(rolesGuard.canActivate(context as any)).toBe(true);
    });

    it('does not access the request when no roles are required', () => {
      reflector.getAllAndOverride.mockReturnValue(undefined);

      const context = {
        getHandler: vi.fn(),
        getClass: vi.fn(),
        switchToHttp: vi.fn(() => {
          throw new Error('Request should not be accessed');
        }),
      };

      expect(rolesGuard.canActivate(context as any)).toBe(true);
      expect(context.switchToHttp).not.toHaveBeenCalled();
    });
  });
});
