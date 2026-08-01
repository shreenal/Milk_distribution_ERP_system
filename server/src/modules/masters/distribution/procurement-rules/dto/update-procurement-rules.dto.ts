import { PartialType } from '@nestjs/mapped-types';

import { CreateProcurementRuleDto } from './create-procurement-rules.dto.js';

export class UpdateProcurementRuleDto extends PartialType(
  CreateProcurementRuleDto,
) {}