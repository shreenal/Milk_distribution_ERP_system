import { PartialType } from '@nestjs/swagger';
import { CreateDairyDto } from './create-dairy.dto.js';

export class UpdateDairyDto extends PartialType(CreateDairyDto) {}
