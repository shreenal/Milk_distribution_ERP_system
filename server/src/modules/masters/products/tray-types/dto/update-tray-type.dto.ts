import { PartialType } from '@nestjs/mapped-types';
import { CreateTrayTypeDto } from './create-tray-type.dto.js';

export class UpdateTrayTypeDto extends PartialType(CreateTrayTypeDto) {}
