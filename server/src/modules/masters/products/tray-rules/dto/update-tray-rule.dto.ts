import { PartialType } from '@nestjs/mapped-types';

import { CreateTrayRuleDto } from './create-tray-rule.dto.js';

export class UpdateTrayRuleDto extends PartialType(CreateTrayRuleDto) {}
