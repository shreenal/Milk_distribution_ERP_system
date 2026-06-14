import {
  Post,
  Body,
  Controller,
  Get,
  ParseIntPipe,
  Param,
  UseGuards,
} from '@nestjs/common';
import { PaperService } from './paper.service.js';
import { JwtAuthGuard } from '../auth/auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';

@Controller('papers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaperController {
  constructor(private readonly paperService: PaperService) {}

  @Post()
  @Roles('EMPLOYEE')
  async generatePaper(
    @Body('date')
    date: string,
  ) {
    return this.paperService.generatePaperService(date);
  }

  @Get('today')
  @Roles('EMPLOYEE')
  async getTodayPaper() {
    return this.paperService.getTodayPaperService();
  }

  @Post(':paperId/submit-night')
  @Roles('EMPLOYEE')
  async submitNightEntry(
    @Param('paperId', ParseIntPipe)
    paperId: number,
  ) {
    return this.paperService.submitNightEntryService(paperId);
  }

  @Post(':paperId/submit-morning')
  @Roles('EMPLOYEE')
  async submitMorningEntry(
    @Param('paperId', ParseIntPipe)
    paperId: number,
  ) {
    return this.paperService.submitMorningEntryService(paperId);
  }

  @Post(':paperId/finalize')
  @Roles('ADMIN')
  async finalizePaper(
    @Param('paperId', ParseIntPipe)
    paperId: number,
  ) {
    return this.paperService.finalizePaperService(paperId);
  }

  @Post(':paperId/reopen')
  @Roles('ADMIN')
  async reopenPaper(
    @Param('paperId', ParseIntPipe)
    paperId: number,

    @Body('reason')
    reason: string,
  ) {
    return this.paperService.reopenPaperService(paperId, reason);
  }
}
