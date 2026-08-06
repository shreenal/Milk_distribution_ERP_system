import { PartialType } from '@nestjs/mapped-types';

import { CreateRolesDto } from './create-roles.dto.js';

export class UpdateRolesDto extends PartialType(CreateRolesDto) {}
