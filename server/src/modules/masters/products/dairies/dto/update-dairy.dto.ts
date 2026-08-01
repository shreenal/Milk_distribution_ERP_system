import { PartialType } from '@nestjs/mapped-types';
import { CreateDairyDto } from './create-dairy.dto.js';

export class UpdateDairyDto extends PartialType(CreateDairyDto) {}