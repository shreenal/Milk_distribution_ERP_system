import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';

import { ClientStatementService } from './client-statement.service.js';
import { ClientStatementQueryDto } from './dto/client-statment-query.dto.js';

import { JwtAuthGuard } from '../../transactions/auth/auth.guard.js';
import { RolesGuard } from '../../transactions/auth/roles.guard.js';
import { Roles } from '../../transactions/auth/roles.decorator.js';

@Controller('reports/client-statements')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClientStatementController {
  constructor(
    private readonly clientStatementService: ClientStatementService,
  ) {}

  @Get(':clientId')
  @Roles('EMPLOYEE')
  async generateStatement(
    @Param('clientId', ParseIntPipe) clientId: number,
    @Query() query: ClientStatementQueryDto,
  ) {
    return this.clientStatementService.generateStatement(
      clientId,
      query.category,
      new Date(query.from),
      new Date(query.to),
    );
  }
}
