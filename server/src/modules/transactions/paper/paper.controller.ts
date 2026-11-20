import {
  Post,
  Body,
  Controller,
  Get,
  HttpCode,
  ParseIntPipe,
  Param,
  Query,
  Req,
  UseGuards,
  DefaultValuePipe,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { PaperService } from './paper.service.js';
import { JwtAuthGuard } from '../auth/auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { GeneratePaperDto } from './dto/generate-paper.dto.js';
import { ReopenPaperDto } from './dto/reopen-paper.dto.js';
import { PaperReasonDto } from './dto/paper-reason.dto.js';
import { SetSheetsNoOperationDto } from './dto/set-sheets-no-operation.dto.js';
import { ParseIdPipe } from '../../../common/pipes/parse-id.pipe.js';

type AuthRequest = Request & {
  user: { id: number; username: string; role: string };
};

// PA-12: every Paper POST answers 200 (as the other transaction modules do).
@Controller('papers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaperController {
  constructor(private readonly paperService: PaperService) {}

  // PA-4: no body = the ordering paper. `date` earlier than that = backfill
  // (ADMIN + reason, PA-4.8). The role is read from the JWT, never the body.
  @Post()
  @HttpCode(200)
  @Roles('EMPLOYEE')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async generatePaper(
    @Body()
    dto: GeneratePaperDto,
    @Req() req: AuthRequest,
  ) {
    return this.paperService.generatePaperService(dto, req.user);
  }

  // PA-5.1: replaces GET /papers/today. Declared before ':paperId'.
  @Get('current')
  @Roles('EMPLOYEE')
  async getCurrentPapers() {
    return this.paperService.getCurrentPapersService();
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

  // PA-19: "would the next action pass?" Nothing is changed.
  @Get(':paperId/readiness')
  @Roles('EMPLOYEE')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async getReadiness(
    @Param('paperId', ParseIdPipe)
    paperId: number,
  ) {
    return this.paperService.getReadinessService(paperId);
  }

  // PA-20
  @Get(':paperId/audit')
  @Roles('ADMIN')
  async getAuditLog(
    @Param('paperId', ParseIdPipe)
    paperId: number,
  ) {
    return this.paperService.getAuditLogService(paperId);
  }

  @Post(':paperId/propagation/retry')
  @HttpCode(200)
  @Roles('ADMIN')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async retryPropagation(
    @Param('paperId', ParseIdPipe)
    paperId: number,
    @Req() req: AuthRequest,
  ) {
    return this.paperService.retryFailedPropagationService(paperId, req.user);
  }

  // PA-10.6
  @Post(':paperId/propagation/dismiss')
  @HttpCode(200)
  @Roles('ADMIN')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async dismissPropagation(
    @Param('paperId', ParseIdPipe)
    paperId: number,
    @Body()
    dto: PaperReasonDto,
    @Req() req: AuthRequest,
  ) {
    return this.paperService.dismissFailedPropagationService(
      paperId,
      dto.reason,
      req.user,
    );
  }

  // PA-17
  @Post(':paperId/sheets/no-operation')
  @HttpCode(200)
  @Roles('EMPLOYEE')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async setSheetsNoOperation(
    @Param('paperId', ParseIdPipe)
    paperId: number,
    @Body()
    dto: SetSheetsNoOperationDto,
    @Req() req: AuthRequest,
  ) {
    return this.paperService.setSheetsNoOperationService(
      paperId,
      dto,
      req.user,
    );
  }

  @Post(':paperId/submit-night')
  @HttpCode(200)
  @Roles('EMPLOYEE')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async submitNightEntry(
    @Param('paperId', ParseIdPipe)
    paperId: number,
    @Req() req: AuthRequest,
  ) {
    return this.paperService.submitNightEntryService(paperId, req.user);
  }

  @Post(':paperId/submit-morning')
  @HttpCode(200)
  @Roles('EMPLOYEE')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async submitMorningEntry(
    @Param('paperId', ParseIdPipe)
    paperId: number,
    @Req() req: AuthRequest,
  ) {
    return this.paperService.submitMorningEntryService(paperId, req.user);
  }

  @Post(':paperId/finalize')
  @HttpCode(200)
  @Roles('ADMIN')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async finalizePaper(
    @Param('paperId', ParseIdPipe)
    paperId: number,
    @Req() req: AuthRequest,
  ) {
    return this.paperService.finalizePaperService(paperId, req.user);
  }

  @Post(':paperId/reopen')
  @HttpCode(200)
  @Roles('ADMIN')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async reopenPaper(
    @Param('paperId', ParseIdPipe)
    paperId: number,

    @Body()
    dto: ReopenPaperDto,
    @Req() req: AuthRequest,
  ) {
    return this.paperService.reopenPaperService(paperId, dto.reason, req.user);
  }

  // PA-18
  @Post(':paperId/revert-morning')
  @HttpCode(200)
  @Roles('ADMIN')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async revertMorning(
    @Param('paperId', ParseIdPipe)
    paperId: number,
    @Body()
    dto: PaperReasonDto,
    @Req() req: AuthRequest,
  ) {
    return this.paperService.revertMorningSubmitService(
      paperId,
      dto.reason,
      req.user,
    );
  }
}
