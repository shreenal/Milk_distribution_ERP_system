import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateEmployeeDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  contact?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
