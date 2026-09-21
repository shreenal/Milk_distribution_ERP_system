import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { describe, it, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { Server } from 'node:http';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET) requires authentication', async () => {
    const server = app.getHttpServer() as Server;
    await request(server).get('/').expect(401);
  });

  afterEach(async () => {
    await app.close();
  });
});
