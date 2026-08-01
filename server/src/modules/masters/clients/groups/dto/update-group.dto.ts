import { PartialType } from '@nestjs/mapped-types';

import { CreateGroupDto } from './create-group.dto.js';

export class UpdateGroupDto extends PartialType(CreateGroupDto) {}