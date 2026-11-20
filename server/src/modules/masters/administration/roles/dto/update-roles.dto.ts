import { PartialType } from '@nestjs/swagger';

import { CreateRolesDto } from './create-roles.dto.js';

export class UpdateRolesDto extends PartialType(CreateRolesDto) {}
