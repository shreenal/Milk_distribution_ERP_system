import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateDairyDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
