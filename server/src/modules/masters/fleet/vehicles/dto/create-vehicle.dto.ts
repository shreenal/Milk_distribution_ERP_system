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

export class CreateVehicleDto {
  @TrimmedName(20)
  vehicle_number!: string;

  // IsOptional also lets null through, which is how a client clears the field.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  vehicle_name?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2147483647)
  capacity?: number | null;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
