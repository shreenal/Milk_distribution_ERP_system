import { Test, TestingModule } from '@nestjs/testing';
import { DiscoveryModule, DiscoveryService } from '@nestjs/core';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AppModule } from '../../../app.module.js';
import { JwtAuthGuard } from './auth.guard.js';
import { RolesGuard } from './roles.guard.js';
import { ROLES_KEY } from './roles.decorator.js';

// Controllers intentionally exempt from the class-level
// JwtAuthGuard + RolesGuard requirement, with the reason documented.
// AuthController hosts the public /auth/login endpoint, so it cannot carry
// a blanket class-level JwtAuthGuard; its /auth/me route guards itself
// individually (see auth.controller.spec.ts).
const EXEMPT_CONTROLLERS = new Set(['AuthController']);

// Mirrors roleHierarchy's keys in roles.guard.ts. Duplicated here because
// roleHierarchy is not exported — if roles.guard.ts's map ever gains/loses
// a role, this list must be updated too (consider exporting it instead).
const KNOWN_ROLES = new Set(['ADMIN', 'EMPLOYEE']);

describe('Guard + role-metadata audit (plan §14)', () => {
  let moduleRef: TestingModule;
  let discoveryService: DiscoveryService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule, DiscoveryModule],
    }).compile();

    discoveryService = moduleRef.get(DiscoveryService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('every non-exempt controller applies JwtAuthGuard and RolesGuard at the class level', () => {
    const controllers = discoveryService.getControllers();
    const missing: string[] = [];

    for (const wrapper of controllers) {
      const metatype = wrapper.metatype;
      if (!metatype || EXEMPT_CONTROLLERS.has(metatype.name)) {
        continue;
      }

      const guards: unknown[] =
        Reflect.getMetadata('__guards__', metatype) ?? [];

      if (!guards.includes(JwtAuthGuard) || !guards.includes(RolesGuard)) {
        missing.push(metatype.name);
      }
    }

    expect(missing).toEqual([]);
  });

  it("every @Roles() usage references a role present in RolesGuard's hierarchy", () => {
    const controllers = discoveryService.getControllers();
    const invalid: string[] = [];

    for (const wrapper of controllers) {
      const metatype = wrapper.metatype;
      if (!metatype) continue;

      const classRoles: string[] =
        Reflect.getMetadata(ROLES_KEY, metatype) ?? [];

      const prototype = metatype.prototype;
      const methodNames = Object.getOwnPropertyNames(prototype).filter(
        (name) => name !== 'constructor',
      );
      const methodRoles = methodNames.flatMap(
        (name) => Reflect.getMetadata(ROLES_KEY, prototype[name]) ?? [],
      );

      for (const role of [...classRoles, ...methodRoles]) {
        if (!KNOWN_ROLES.has(role)) {
          invalid.push(`${metatype.name}: ${role}`);
        }
      }
    }

    expect(invalid).toEqual([]);
  });
});
