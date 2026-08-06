import { PartialType } from '@nestjs/mapped-types';

import { CreateGroupSupplyRuleDto } from './create-group-supply-rules.dto.js';

export class UpdateGroupSupplyRuleDto extends PartialType(
  CreateGroupSupplyRuleDto,
) {}
