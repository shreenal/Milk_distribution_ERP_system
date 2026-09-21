import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { describe, it, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { AppModule } from '../../../app.module.js';
import { Server } from 'node:http';

describe('Auth guard chain (e2e, plan §14)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('rejects a request with no bearer token', async () => {
    const server = app.getHttpServer() as Server;
    await request(server).get('/auth/me').expect(401);
  });

  it('rejects a malformed bearer token', async () => {
    const server = app.getHttpServer() as Server;
    await request(server)
      .get('/auth/me')
      .set('Authorization', 'Bearer not-a-real-jwt')
      .expect(401);
  });

  it('rejects an expired bearer token', async () => {
    const server = app.getHttpServer() as Server;

    // Signed with an already-expired exp claim. If SECRET in the test env
    // differs from this fallback, the request still correctly returns 401
    // (invalid signature) — either way the guard must reject it.
    const expiredToken = jwt.sign(
      { sub: 1, username: 'employee1', role: 'EMPLOYEE' },
      process.env.SECRET ?? 'test-secret',
      { expiresIn: -10 },
    );

    await request(server)
      .get('/auth/me')
      .set('Authorization', `Bearer ${expiredToken}`)
      .expect(401);
  });
});
