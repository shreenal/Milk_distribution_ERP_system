import { afterEach, describe, expect, it, vi } from 'vitest';

import { UnauthorizedException } from '@nestjs/common';

import { AuthService } from './auth.service.js';

const { compareMock } = vi.hoisted(() => ({
  compareMock: vi.fn(),
}));

vi.mock('bcrypt', () => ({
  compare: compareMock,
}));

describe('AuthService', () => {
  const usersRepository = {
    findByUsername: vi.fn(),
    findById: vi.fn(),
  };

  const jwtService = {
    sign: vi.fn(),
  };

  const authService = new AuthService(
    usersRepository as any,
    jwtService as any,
  );

  afterEach(() => {
    vi.clearAllMocks();
  });
  describe('login', () => {
    it('throws UnauthorizedException when username does not exist', async () => {
      usersRepository.findByUsername.mockResolvedValue(null);

      await expect(
        authService.login('unknown', 'password'),
      ).rejects.toThrowError(new UnauthorizedException('Invalid credentials'));

      expect(usersRepository.findByUsername).toHaveBeenCalledWith('unknown');
    });

    it('throws UnauthorizedException when password is invalid', async () => {
      usersRepository.findByUsername.mockResolvedValue({
        id: 1,
        username: 'employee1',
        password: 'hashed-password',
        role: {
          name: 'EMPLOYEE',
        },
      });

      compareMock.mockResolvedValue(false);

      await expect(
        authService.login('employee1', 'wrong-password'),
      ).rejects.toThrowError(new UnauthorizedException('Invalid credentials'));

      expect(compareMock).toHaveBeenCalledWith(
        'wrong-password',
        'hashed-password',
      );

      expect(jwtService.sign).not.toHaveBeenCalled();
    });

    it('signs the correct JWT payload for valid credentials', async () => {
      usersRepository.findByUsername.mockResolvedValue({
        id: 7,
        username: 'employee1',
        password: 'hashed-password',
        role: {
          name: 'EMPLOYEE',
        },
      });

      compareMock.mockResolvedValue(true);
      jwtService.sign.mockReturnValue('signed-token');

      await authService.login('employee1', 'correct-password');

      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: 7,
        username: 'employee1',
        role: 'EMPLOYEE',
      });
    });

    it('returns the access token and user information for valid credentials', async () => {
      usersRepository.findByUsername.mockResolvedValue({
        id: 7,
        username: 'employee1',
        password: 'hashed-password',
        role: {
          name: 'EMPLOYEE',
        },
      });

      compareMock.mockResolvedValue(true);
      jwtService.sign.mockReturnValue('signed-token');

      await expect(
        authService.login('employee1', 'correct-password'),
      ).resolves.toEqual({
        accessToken: 'signed-token',
        user: {
          id: 7,
          username: 'employee1',
          role: 'EMPLOYEE',
        },
      });
    });

    it('uses the supplied username and password', async () => {
      usersRepository.findByUsername.mockResolvedValue({
        id: 10,
        username: 'admin',
        password: 'hashed-admin-password',
        role: {
          name: 'ADMIN',
        },
      });

      compareMock.mockResolvedValue(true);

      jwtService.sign.mockReturnValue('admin-token');

      await authService.login('admin', 'admin-password');

      expect(usersRepository.findByUsername).toHaveBeenCalledWith('admin');

      expect(compareMock).toHaveBeenCalledWith(
        'admin-password',
        'hashed-admin-password',
      );
    });
  });

  describe('getCurrentUser', () => {
    it('throws UnauthorizedException when the user does not exist', async () => {
      usersRepository.findById.mockResolvedValue(null);

      await expect(authService.getCurrentUser(999)).rejects.toThrowError(
        UnauthorizedException,
      );

      expect(usersRepository.findById).toHaveBeenCalledWith(999);
    });

    it('returns the current user information', async () => {
      usersRepository.findById.mockResolvedValue({
        id: 7,
        username: 'employee1',
        role: {
          name: 'EMPLOYEE',
        },
      });

      await expect(authService.getCurrentUser(7)).resolves.toEqual({
        id: 7,
        username: 'employee1',
        role: 'EMPLOYEE',
      });
    });

    it('returns the correct role for an admin user', async () => {
      usersRepository.findById.mockResolvedValue({
        id: 1,
        username: 'admin',
        role: {
          name: 'ADMIN',
        },
      });

      await expect(authService.getCurrentUser(1)).resolves.toEqual({
        id: 1,
        username: 'admin',
        role: 'ADMIN',
      });
    });
  });

  it('does not compare the password or sign a token when username does not exist', async () => {
    usersRepository.findByUsername.mockResolvedValue(null);

    await expect(authService.login('unknown', 'password')).rejects.toThrowError(
      new UnauthorizedException('Invalid credentials'),
    );

    expect(compareMock).not.toHaveBeenCalled();
    expect(jwtService.sign).not.toHaveBeenCalled();
  });

  it('returns only public user information', async () => {
    usersRepository.findById.mockResolvedValue({
      id: 7,
      username: 'employee1',
      password: 'hashed-password',
      role: {
        name: 'EMPLOYEE',
      },
    });

    const result = await authService.getCurrentUser(7);

    expect(result).toEqual({
      id: 7,
      username: 'employee1',
      role: 'EMPLOYEE',
    });

    expect(result).not.toHaveProperty('password');
  });

  describe('login with a user missing a role relation (hardening candidate — plan §7.3/§14)', () => {
    it('currently throws an unhandled error rather than a clean 401/500 distinction', async () => {
      usersRepository.findByUsername.mockResolvedValue({
        id: 5,
        username: 'orphan',
        password: 'hashed-password',
        role: null,
      });

      compareMock.mockResolvedValue(true);

      // user.role.name is dereferenced unconditionally in AuthService.login;
      // with role === null this throws a TypeError, not a controlled
      // UnauthorizedException. Pins CURRENT behavior per plan §7.3 — not an
      // endorsement, just a regression guard so a future fix is deliberate.
      await expect(authService.login('orphan', 'password123')).rejects.toThrow(
        TypeError,
      );
    });
  });

  describe('getCurrentUser with a user missing a role relation', () => {
    it('currently throws an unhandled error', async () => {
      usersRepository.findById.mockResolvedValue({
        id: 5,
        username: 'orphan',
        role: null,
      });

      await expect(authService.getCurrentUser(5)).rejects.toThrow(TypeError);
    });
  });

  describe('getCurrentUser re-fetch semantics (plan §14 — privilege drift check)', () => {
    it('reflects a role that changed in the DB after the token was originally issued', async () => {
      usersRepository.findById.mockResolvedValueOnce({
        id: 7,
        username: 'employee1',
        role: { name: 'EMPLOYEE' },
      });

      const first = await authService.getCurrentUser(7);
      expect(first.role).toBe('EMPLOYEE');

      usersRepository.findById.mockResolvedValueOnce({
        id: 7,
        username: 'employee1',
        role: { name: 'ADMIN' },
      });

      const second = await authService.getCurrentUser(7);
      expect(second.role).toBe('ADMIN');

      // Confirms both calls actually reached the repository — no caching
      // of a role captured at token-issuance time.
      expect(usersRepository.findById).toHaveBeenCalledTimes(2);
    });
  });
});
