import { IsBoolean, IsOptional } from 'class-validator';
import { TrimmedName } from '../../../../../common/dto/trimmed-name.decorator.js';

export class CreateExpenseTypeDto {
  @TrimmedName(100)
  name!: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
