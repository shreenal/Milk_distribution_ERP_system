import { PartialType } from '@nestjs/swagger';

import { CreateProcurementRuleDto } from './create-procurement-rules.dto.js';

export class UpdateProcurementRuleDto extends PartialType(
  CreateProcurementRuleDto,
) {}
