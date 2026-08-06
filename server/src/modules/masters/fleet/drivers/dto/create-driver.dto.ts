import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateDriverDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  contact?: string;

  @IsOptional()
  @IsInt()
  vehicle_id?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
