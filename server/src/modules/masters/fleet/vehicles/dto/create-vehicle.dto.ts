import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateVehicleDto {
  @IsString()
  @MaxLength(20)
  vehicle_number!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  vehicle_name?: string;

  @IsOptional()
  @IsInt()
  capacity?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}