import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { TrimmedName } from '../../../../../common/dto/trimmed-name.decorator.js';

export class CreateDairyDto {
  @TrimmedName(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string | null;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
