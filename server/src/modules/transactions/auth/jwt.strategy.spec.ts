import { describe, expect, it, vi } from 'vitest';

import { ConfigService } from '@nestjs/config';

import { JwtStrategy } from './jwt.strategy.js';

describe('JwtStrategy', () => {
  describe('constructor', () => {
    it('throws when SECRET is not configured', () => {
      const config = {
        get: () => undefined,
      };

      expect(
        () => new JwtStrategy(config as unknown as ConfigService),
      ).toThrowError('SECRET environment variable is not configured');
    });

    it('constructs successfully when SECRET is configured', () => {
      const config = {
        get: () => 'test-secret',
      };

      expect(
        () => new JwtStrategy(config as unknown as ConfigService),
      ).not.toThrow();
    });
  });

  describe('validate', () => {
    it('maps the JWT payload to the authenticated user', () => {
      const config = {
        get: () => 'test-secret',
      };

      const strategy = new JwtStrategy(config as unknown as ConfigService);

      expect(
        strategy.validate({
          sub: 7,
          username: 'employee1',
          role: 'EMPLOYEE',
        }),
      ).toEqual({
        id: 7,
        username: 'employee1',
        role: 'EMPLOYEE',
      });
    });

    it('maps an admin JWT payload correctly', () => {
      const config = {
        get: () => 'test-secret',
      };

      const strategy = new JwtStrategy(config as unknown as ConfigService);

      expect(
        strategy.validate({
          sub: 1,
          username: 'admin',
          role: 'ADMIN',
        }),
      ).toEqual({
        id: 1,
        username: 'admin',
        role: 'ADMIN',
      });
    });

    it('reads the SECRET configuration value', () => {
      const config = {
        get: vi.fn().mockReturnValue('test-secret'),
      };

      new JwtStrategy(config as unknown as ConfigService);

      expect(config.get).toHaveBeenCalledWith('SECRET');
    });
  });
});
