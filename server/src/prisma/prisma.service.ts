import { Injectable } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma/client.js';
import { createPgAdapter } from '../lib/pg-adapter.js';

@Injectable()
export class PrismaService extends PrismaClient {
  constructor() {
    super({ adapter: createPgAdapter() });
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
