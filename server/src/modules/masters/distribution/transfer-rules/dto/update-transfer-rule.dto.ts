import { PartialType } from '@nestjs/swagger';

import { CreateTransferRuleDto } from './create-transfer-rule.dto.js';

export class UpdateTransferRuleDto extends PartialType(CreateTransferRuleDto) {}
