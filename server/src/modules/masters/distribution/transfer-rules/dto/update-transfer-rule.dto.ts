import { PartialType } from '@nestjs/mapped-types';

import { CreateTransferRuleDto } from './create-transfer-rule.dto.js';

export class UpdateTransferRuleDto extends PartialType(
  CreateTransferRuleDto,
) {}