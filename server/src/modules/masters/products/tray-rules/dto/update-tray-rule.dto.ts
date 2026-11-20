import { PartialType } from '@nestjs/swagger';

import { CreateTrayRuleDto } from './create-tray-rule.dto.js';

export class UpdateTrayRuleDto extends PartialType(CreateTrayRuleDto) {}
