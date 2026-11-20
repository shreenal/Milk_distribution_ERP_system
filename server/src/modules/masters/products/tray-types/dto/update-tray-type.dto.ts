import { PartialType } from '@nestjs/swagger';
import { CreateTrayTypeDto } from './create-tray-type.dto.js';

export class UpdateTrayTypeDto extends PartialType(CreateTrayTypeDto) {}
