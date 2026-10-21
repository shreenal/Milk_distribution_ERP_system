import {
  Post,
  Body,
  Controller,
  Get,
  ParseIntPipe,
  Param,
  Query,
  UseGuards,
  DefaultValuePipe,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PaperService } from './paper.service.js';
import { JwtAuthGuard } from '../auth/auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { GeneratePaperDto } from './dto/generate-paper.dto.js';
import { ReopenPaperDto } from './dto/reopen-paper.dto.js';
import { ParseIdPipe } from '../../../common/pipes/parse-id.pipe.js';

@Controller('papers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaperController {
  constructor(private readonly paperService: PaperService) {}

  @Post()
  @Roles('EMPLOYEE')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async generatePaper(
    @Body()
    dto: GeneratePaperDto,
  ) {
    return this.paperService.generatePaperService(dto.date);
  }

  @Get('today')
  @Roles('EMPLOYEE')
  async getTodayPaper() {
    return this.paperService.getTodayPaperService();
  }

  // Admin view of every propagation that failed or is stuck, across papers.
  @Get('propagation/problems')
  @Roles('ADMIN')
  async listPropagationProblems() {
    return this.paperService.listPropagationProblemsService();
  }

  @Get()
  @Roles('EMPLOYEE')
  async getPapers(
    @Query('date') date?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('pageSize', new ParseIntPipe({ optional: true })) pageSize?: number,
  ) {
    return this.paperService.getPapersService(
      date,
      page,
      pageSize ? Number(pageSize) : undefined,
    );
  }

  @Get(':paperId')
  @Roles('EMPLOYEE')
  async getPaperById(
    @Param('paperId', ParseIdPipe)
    paperId: number,
  ) {
    return this.paperService.getPaperByIdService(paperId);
  }

  @Get(':paperId/propagation')
  @Roles('EMPLOYEE')
  async getPropagationStatus(
    @Param('paperId', ParseIdPipe)
    paperId: number,
  ) {
    return this.paperService.getPropagationStatusService(paperId);
  }

  @Post(':paperId/propagation/retry')
  @Roles('ADMIN')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async retryPropagation(
    @Param('paperId', ParseIdPipe)
    paperId: number,
  ) {
    return this.paperService.retryFailedPropagationService(paperId);
  }

  @Post(':paperId/submit-night')
  @Roles('EMPLOYEE')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async submitNightEntry(
    @Param('paperId', ParseIdPipe)
    paperId: number,
  ) {
    return this.paperService.submitNightEntryService(paperId);
  }

  @Post(':paperId/submit-morning')
  @Roles('EMPLOYEE')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async submitMorningEntry(
    @Param('paperId', ParseIdPipe)
    paperId: number,
  ) {
    return this.paperService.submitMorningEntryService(paperId);
  }

  @Post(':paperId/finalize')
  @Roles('ADMIN')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async finalizePaper(
    @Param('paperId', ParseIdPipe)
    paperId: number,
  ) {
    return this.paperService.finalizePaperService(paperId);
  }

  @Post(':paperId/reopen')
  @Roles('ADMIN')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async reopenPaper(
    @Param('paperId', ParseIdPipe)
    paperId: number,

    @Body()
    dto: ReopenPaperDto,
  ) {
    return this.paperService.reopenPaperService(paperId, dto.reason);
  }
}
