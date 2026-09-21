import { Controller, Get, UseGuards } from '@nestjs/common';
import { AppService } from './app.service.js';
import { RolesGuard } from './modules/transactions/auth/roles.guard.js';
import { JwtAuthGuard } from './modules/transactions/auth/auth.guard.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
