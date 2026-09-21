import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthController } from './auth.controller.js';
import { JwtAuthGuard } from './auth.guard.js';

describe('AuthController', () => {
  const authService = {
    login: vi.fn(),
    getCurrentUser: vi.fn(),
  };

  const authController = new AuthController(authService as any);

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('login', () => {
    it('passes username and password to AuthService.login', async () => {
      authService.login.mockResolvedValue({
        accessToken: 'signed-token',
        user: {
          id: 7,
          username: 'employee1',
          role: 'EMPLOYEE',
        },
      });

      const dto = {
        username: 'employee1',
        password: 'correct-password',
      };

      await authController.login(dto);

      expect(authService.login).toHaveBeenCalledWith(
        'employee1',
        'correct-password',
      );
    });

    it('returns the result from AuthService.login', async () => {
      const result = {
        accessToken: 'signed-token',
        user: {
          id: 7,
          username: 'employee1',
          role: 'EMPLOYEE',
        },
      };

      authService.login.mockResolvedValue(result);

      await expect(
        authController.login({
          username: 'employee1',
          password: 'correct-password',
        }),
      ).resolves.toEqual(result);
    });
  });

  describe('getMe', () => {
    it('passes the authenticated user id to AuthService.getCurrentUser', async () => {
      authService.getCurrentUser.mockResolvedValue({
        id: 7,
        username: 'employee1',
        role: 'EMPLOYEE',
      });

      const request = {
        user: {
          id: 7,
          username: 'employee1',
          role: 'EMPLOYEE',
        },
      };

      await authController.getMe(request as any);

      expect(authService.getCurrentUser).toHaveBeenCalledWith(7);
    });

    it('returns the result from AuthService.getCurrentUser', async () => {
      const result = {
        id: 7,
        username: 'employee1',
        role: 'EMPLOYEE',
      };

      authService.getCurrentUser.mockResolvedValue(result);

      const request = {
        user: {
          id: 7,
          username: 'employee1',
          role: 'EMPLOYEE',
        },
      };

      await expect(authController.getMe(request as any)).resolves.toEqual(
        result,
      );
    });
  });

  it('uses JwtAuthGuard for getMe', () => {
    const guards = Reflect.getMetadata(
      '__guards__',
      AuthController.prototype.getMe,
    );

    expect(guards).toHaveLength(1);
    expect(guards[0]).toBe(JwtAuthGuard);
  });
});
