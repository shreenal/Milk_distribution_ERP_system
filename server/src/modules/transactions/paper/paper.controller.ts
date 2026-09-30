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
import { PaperService } from './paper.service.js';
import { JwtAuthGuard } from '../auth/auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { GeneratePaperDto } from './dto/generate-paper.dto.js';
import { ReopenPaperDto } from './dto/reopen-paper.dto.js';

@Controller('papers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaperController {
  constructor(private readonly paperService: PaperService) {}

  @Post()
  @Roles('EMPLOYEE')
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
    @Param('paperId', ParseIntPipe)
    paperId: number,
  ) {
    return this.paperService.getPaperByIdService(paperId);
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

    @Body()
    dto: ReopenPaperDto,
  ) {
    return this.paperService.reopenPaperService(paperId, dto.reason);
  }
}
