import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { TrimmedName } from '../../../../../common/dto/trimmed-name.decorator.js';

export class CreateDriverDto {
  @TrimmedName(100)
  name!: string;

  // IsOptional also lets null through, which is how a client clears the field.
  @IsOptional()
  @IsString()
  @MaxLength(20)
  contact?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2147483647)
  vehicle_id?: number | null;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
